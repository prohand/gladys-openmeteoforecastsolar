// A clear-sky day as Open-Meteo would forecast it, without the network.

const DAY_MS = 24 * 60 * 60 * 1000;
const SLOT_MS = 15 * 60 * 1000;

/** Paris in summer: UTC+2. */
export const OFFSET_SECONDS = 2 * 3600;

/** Local midnight of 2026-06-21 at UTC+2, in ms. */
export const MIDNIGHT = Date.UTC(2026, 5, 21) - OFFSET_SECONDS * 1000;

/** `HH:MM` local of the first day, as a UTC instant in ms. */
export function at(hhmm, dayOffset = 0) {
  const [hours, minutes] = hhmm.split(':').map(Number);
  return MIDNIGHT + dayOffset * DAY_MS + (hours * 60 + minutes) * 60 * 1000;
}

/**
 * Irradiance on the panels: a bell from 06:00 to 22:00 peaking at 14:00
 * local (solar noon in Paris, summer time), `peak` W/m², `scale` per day.
 */
export function irradianceAt(end, { peak = 1000, scales = [1, 0.5] } = {}) {
  const middle = end - SLOT_MS / 2;
  const day = Math.floor((middle - MIDNIGHT) / DAY_MS);
  const hour = (middle - MIDNIGHT - day * DAY_MS) / 3_600_000;
  if (hour < 6 || hour > 22) {
    return 0;
  }
  const u = (hour - 14) / 4;
  return Math.round(peak * (scales[day] ?? 1) * Math.exp(-u * u) * 10) / 10;
}

/** The JSON body of `/v1/forecast`, two days of 15-minute values. */
export function openMeteoBody(options = {}) {
  const times = [];
  for (let end = MIDNIGHT; end < MIDNIGHT + 2 * DAY_MS; end += SLOT_MS) {
    times.push(end / 1000);
  }
  return {
    latitude: 48.86,
    longitude: 2.34,
    utc_offset_seconds: OFFSET_SECONDS,
    timezone: 'Europe/Paris',
    minutely_15: {
      time: times,
      global_tilted_irradiance: times.map((time) => irradianceAt(time * 1000, options)),
      temperature_2m: times.map(() => options.temperature ?? 25),
    },
  };
}
