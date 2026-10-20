// -----------------------------------------------------------------------------
// The forecast in memory, and when to ask Open-Meteo again.
//
// Everything published (states, scene outputs, widget) is computed from the
// LAST forecast received: Gladys polls the device every minute, which only
// recomputes "now" from it, and the API is called again once the forecast is
// older than the refresh interval of the configuration. A failed call keeps
// the previous forecast — still the best estimate there is — and is retried
// a few minutes later, not at every poll.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fetchIrradiance } from './openMeteo.js';
import { resolveSite } from './location.js';
import { buildForecast } from './solar.js';

const logger = createLogger({ name: 'forecast' });

/** Delay before trying again after a failed call. */
export const RETRY_DELAY_MS = 5 * 60 * 1000;

/** Raised when nothing locates the panels: the user has something to fill in. */
export class MissingLocationError extends Error {
  constructor() {
    super('No location: set the location of your house in Gladys, or type coordinates');
    this.name = 'MissingLocationError';
  }
}

/**
 * @param {object} [deps]
 * @param {typeof fetchIrradiance} [deps.fetchIrradiance] the HTTP call (faked in the tests)
 * @param {() => number} [deps.now] clock
 */
export function createForecastStore({
  fetchIrradiance: fetchPlane = fetchIrradiance,
  now = Date.now,
} = {}) {
  let forecast = null;
  // What the forecast was computed for: a change of any of these values
  // makes it stale at once.
  let inputsKey = null;
  let lastError = null;
  let lastAttemptAt = null;
  let inflight = null;

  const keyOf = (config) =>
    JSON.stringify([
      config.peak_power,
      config.tilt,
      config.azimuth,
      config.system_loss,
      config.latitude,
      config.longitude,
    ]);

  async function fetchForecast(gladys, config) {
    lastAttemptAt = now();
    try {
      const site = await resolveSite(gladys, config);
      if (!site) {
        throw new MissingLocationError();
      }
      const irradiance = await fetchPlane({ ...site, tilt: config.tilt, azimuth: config.azimuth });
      forecast = buildForecast(irradiance, config, site, now());
      inputsKey = keyOf(config);
      lastError = null;
      // The coordinates are personal data (the home): not at the info level.
      logger.info(`Forecast received: ${forecast.slots.length} slots`);
      return forecast;
    } catch (err) {
      lastError = err;
      logger.warn(`Forecast refresh failed: ${err.message}`);
      throw err;
    }
  }

  return {
    /** The last forecast received, or `null`. */
    get forecast() {
      return forecast;
    },

    /** The error of the last call, `null` when it succeeded. */
    get lastError() {
      return lastError;
    },

    /** Whether the next poll should call Open-Meteo. */
    isDue(config) {
      const time = now();
      if (lastError !== null && lastAttemptAt !== null && time - lastAttemptAt < RETRY_DELAY_MS) {
        return false;
      }
      return (
        forecast === null ||
        inputsKey !== keyOf(config) ||
        time - forecast.fetchedAt >= config.refresh_interval * 60 * 1000
      );
    },

    /**
     * Call Open-Meteo now. Concurrent calls (a poll and a widget button at the
     * same moment) share the same request.
     */
    refresh(gladys, config) {
      if (!inflight) {
        inflight = fetchForecast(gladys, config).finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },

    /** Forget the retry delay: the next poll calls Open-Meteo (new config, reconnection). */
    invalidate() {
      lastAttemptAt = null;
      inputsKey = null;
    },
  };
}
