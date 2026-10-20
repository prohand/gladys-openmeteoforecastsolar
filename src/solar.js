// -----------------------------------------------------------------------------
// The PV model and every figure derived from the forecast. Pure functions:
// no network, no clock (`now` is always passed in), easy to test.
//
// Model: the irradiance on the panels (W/m²) against the 1000 W/m² of the
// standard test conditions gives the share of the peak power produced, minus
// the system losses, corrected for the cell temperature. Crystalline silicon
// loses about 0.4 % of power per degree above 25 °C, and the cells run hotter
// than the air the more sun they get (NOCT model). It is an estimate: shading,
// snow and the exact inverter curve are out of reach of a weather forecast.
// -----------------------------------------------------------------------------

import { SLOT_MS } from './openMeteo.js';

/** Irradiance of the standard test conditions, in W/m². */
const STC_IRRADIANCE = 1000;
/** Power change per degree of cell temperature above 25 °C. */
const TEMPERATURE_COEFFICIENT = -0.004;
/** Cell heating per W/m²: (NOCT 45 °C − 20 °C) / 800 W/m². */
const CELL_HEATING = 25 / 800;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Estimated AC power of the installation, in watts, for one irradiance.
 *
 * @param {number} irradiance on the panels, W/m²
 * @param {number|null} temperature air temperature, °C (null: not known)
 * @param {{ peak_power: number, system_loss: number }} config
 */
export function estimatePower(irradiance, temperature, { peak_power, system_loss }) {
  if (!(irradiance > 0)) {
    return 0;
  }
  const peakWatts = peak_power * 1000;
  const cell = temperature === null ? 25 : temperature + irradiance * CELL_HEATING;
  const thermal = 1 + TEMPERATURE_COEFFICIENT * (cell - 25);
  const watts = (irradiance / STC_IRRADIANCE) * peakWatts * (1 - system_loss / 100) * thermal;
  return Math.round(Math.min(peakWatts, Math.max(0, watts)));
}

/**
 * The forecast of the installation: one estimated power per 15-minute slot.
 *
 * @param {Awaited<ReturnType<import('./openMeteo.js').fetchIrradiance>>} irradiance
 * @param {object} config normalized configuration
 * @param {{ latitude: number, longitude: number, label?: string }} site
 * @param {number} fetchedAt when Open-Meteo answered, ms
 */
export function buildForecast(irradiance, config, site, fetchedAt) {
  return {
    fetchedAt,
    site,
    timezone: irradiance.timezone,
    utcOffsetSeconds: irradiance.utcOffsetSeconds,
    slots: irradiance.slots.map(({ start, end, irradiance: value, temperature }) => ({
      start,
      end,
      power: estimatePower(value, temperature, config),
    })),
  };
}

/** Local midnight, in ms, of the day holding `time` at the site. */
export function startOfLocalDay(forecast, time) {
  const offset = forecast.utcOffsetSeconds * 1000;
  return Math.floor((time + offset) / DAY_MS) * DAY_MS - offset;
}

/** `HH:MM`, local time of the site. */
export function localTime(forecast, time) {
  return new Date(time + forecast.utcOffsetSeconds * 1000).toISOString().slice(11, 16);
}

/** The slots that START on the local day beginning at `dayStart`. */
export function slotsOfDay(forecast, dayStart) {
  return forecast.slots.filter((slot) => slot.start >= dayStart && slot.start < dayStart + DAY_MS);
}

/** Energy of a slot, or of the part of it after `from`, in Wh. */
function slotEnergy(slot, from = slot.start) {
  const begin = Math.max(slot.start, from);
  if (begin >= slot.end) {
    return 0;
  }
  return (slot.power * (slot.end - begin)) / HOUR_MS;
}

const toKwh = (wh) => Math.round(wh / 10) / 100;

/**
 * Every figure the device, the scenes and the widget publish.
 *
 * @param {object} forecast built by buildForecast
 * @param {number} now ms
 * @returns {{ powerNow: number|null, powerNextHour: number|null, energyToday: number,
 *   energyRemainingToday: number, energyTomorrow: number|null, peakPowerToday: number,
 *   peakTimeToday: string|null }} powers in W, energies in kWh; `null` when the
 *   forecast does not cover the moment.
 */
export function summarize(forecast, now) {
  const today = startOfLocalDay(forecast, now);
  const tomorrow = today + DAY_MS;
  const todaySlots = slotsOfDay(forecast, today);
  const tomorrowSlots = slotsOfDay(forecast, tomorrow);

  const current = forecast.slots.find((slot) => slot.start <= now && now < slot.end);
  const nextHour = forecast.slots.filter((slot) => slot.end > now && slot.start < now + HOUR_MS);
  // The next hour, weighted by how much of each slot falls inside it.
  const nextHourWh = nextHour.reduce(
    (sum, slot) => sum + slotEnergy({ ...slot, end: Math.min(slot.end, now + HOUR_MS) }, now),
    0,
  );
  const nextHourCovered = nextHour.length > 0 && nextHour.at(-1).end >= now + HOUR_MS;

  let peak = null;
  for (const slot of todaySlots) {
    if (slot.power > 0 && (peak === null || slot.power > peak.power)) {
      peak = slot;
    }
  }

  return {
    powerNow: current ? current.power : null,
    powerNextHour: nextHourCovered ? Math.round(nextHourWh) : null,
    energyToday: toKwh(todaySlots.reduce((sum, slot) => sum + slotEnergy(slot), 0)),
    energyRemainingToday: toKwh(todaySlots.reduce((sum, slot) => sum + slotEnergy(slot, now), 0)),
    // A day the forecast only partly covers would read as a cloudy day.
    energyTomorrow:
      tomorrowSlots.length >= 90
        ? toKwh(tomorrowSlots.reduce((sum, slot) => sum + slotEnergy(slot), 0))
        : null,
    peakPowerToday: peak ? peak.power : 0,
    peakTimeToday: peak ? localTime(forecast, peak.start) : null,
  };
}

export const DAYS = { TODAY: 'today', TOMORROW: 'tomorrow' };

/**
 * The sunniest window of a given length: where to run the dishwasher, charge
 * the car or heat the water on the panels' own production.
 *
 * Windows start on the 15-minute slots; today's start no earlier than the
 * slot in progress. Ties go to the earliest window.
 *
 * @param {object} forecast built by buildForecast
 * @param {{ durationMinutes: number, day: 'today'|'tomorrow' }} request
 * @param {number} now ms
 * @returns {{ found: boolean, start?: string, end?: string, energy?: number,
 *   averagePower?: number }} times as local `HH:MM`, energy in kWh, power in W
 */
export function findBestWindow(forecast, { durationMinutes, day }, now) {
  const today = startOfLocalDay(forecast, now);
  const dayStart = day === DAYS.TOMORROW ? today + DAY_MS : today;
  const length = Math.max(1, Math.round((durationMinutes * 60 * 1000) / SLOT_MS));
  const slots = slotsOfDay(forecast, dayStart).filter((slot) => slot.end > now);

  let best = null;
  for (let first = 0; first + length <= slots.length; first += 1) {
    const window = slots.slice(first, first + length);
    // A gap in the data (a value Open-Meteo did not give) breaks the window.
    if (window.at(-1).end - window[0].start !== length * SLOT_MS) {
      continue;
    }
    const wh = window.reduce((sum, slot) => sum + slotEnergy(slot), 0);
    if (best === null || wh > best.wh) {
      best = { wh, start: window[0].start, end: window.at(-1).end };
    }
  }
  if (best === null || best.wh <= 0) {
    return { found: false };
  }
  return {
    found: true,
    start: localTime(forecast, best.start),
    end: localTime(forecast, best.end),
    energy: toKwh(best.wh),
    averagePower: Math.round(best.wh / ((best.end - best.start) / HOUR_MS)),
  };
}
