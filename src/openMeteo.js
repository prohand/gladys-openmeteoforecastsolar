// -----------------------------------------------------------------------------
// The Open-Meteo forecast API: the only third party this integration talks to.
//
// Free, no account, no API key (https://open-meteo.com/en/docs). We ask for
// the irradiance received by a TILTED plane — the panels — every 15 minutes,
// with the air temperature that sets how hot the cells run. The PV model that
// turns both into watts lives in src/solar.js.
//
// Node 22+ provides `fetch` natively: no HTTP dependency.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'open-meteo' });

export const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Today and tomorrow, from local midnight: what every feature, scene and the
// widget talk about.
const FORECAST_DAYS = 2;

const REQUEST_TIMEOUT_MS = 15_000;

// A 15-minute value of Open-Meteo is the mean of the 15 minutes BEFORE its
// timestamp (radiation is a "preceding period" variable).
export const SLOT_MS = 15 * 60 * 1000;

/**
 * Compass orientation (0 = north, 90 = east, 180 = south, 270 = west), as
 * users read it on a map, to the Open-Meteo convention (0 = south,
 * -90 = east, 90 = west, ±180 = north).
 */
export function toOpenMeteoAzimuth(compass) {
  const normalized = ((compass % 360) + 360) % 360;
  return normalized - 180;
}

/**
 * The request URL for a site and a plane.
 * @param {{ latitude: number, longitude: number, tilt: number, azimuth: number }} plane
 */
export function buildForecastUrl({ latitude, longitude, tilt, azimuth }) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    minutely_15: 'global_tilted_irradiance,temperature_2m',
    tilt: String(tilt),
    azimuth: String(toOpenMeteoAzimuth(azimuth)),
    // Days cut at the site's own midnight, and times as plain UNIX seconds:
    // no local date string to parse.
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: String(FORECAST_DAYS),
  });
  return `${OPEN_METEO_URL}?${params}`;
}

/**
 * Fetch the irradiance forecast of a plane.
 *
 * @returns {Promise<{ timezone: string, utcOffsetSeconds: number,
 *   slots: Array<{ start: number, end: number, irradiance: number, temperature: number|null }> }>}
 *   one slot per 15 minutes, times in milliseconds; a slot Open-Meteo has no
 *   value for is left out.
 */
export async function fetchIrradiance(plane) {
  const url = buildForecastUrl(plane);
  logger.debug('Request ->', url);

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    // Open-Meteo explains a refused request (a coordinate out of range…) in
    // a JSON `reason`: keep it, it is what the user can act on.
    const reason = await response
      .json()
      .then((body) => body?.reason)
      .catch(() => undefined);
    throw new Error(`Open-Meteo HTTP ${response.status}${reason ? `: ${reason}` : ''}`);
  }
  return parseForecast(await response.json());
}

/** Turn the JSON answer of Open-Meteo into slots. Exported for the tests. */
export function parseForecast(body) {
  const series = body?.minutely_15;
  if (!series || !Array.isArray(series.time)) {
    throw new Error('Open-Meteo answer without 15-minute data');
  }
  const irradiances = series.global_tilted_irradiance ?? [];
  const temperatures = series.temperature_2m ?? [];
  const slots = [];
  series.time.forEach((time, index) => {
    const irradiance = irradiances[index];
    if (!Number.isFinite(time) || !Number.isFinite(irradiance)) {
      return;
    }
    const end = time * 1000;
    const temperature = temperatures[index];
    slots.push({
      start: end - SLOT_MS,
      end,
      irradiance: Math.max(0, irradiance),
      temperature: Number.isFinite(temperature) ? temperature : null,
    });
  });
  if (slots.length === 0) {
    throw new Error('Open-Meteo answer without any irradiance value');
  }
  return {
    timezone: typeof body.timezone === 'string' ? body.timezone : 'GMT',
    utcOffsetSeconds: Number.isFinite(body.utc_offset_seconds) ? body.utc_offset_seconds : 0,
    slots,
  };
}
