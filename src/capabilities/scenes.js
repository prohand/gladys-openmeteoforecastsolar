// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+): OPERATIONS a scene author places in a scene,
// with parameters and a result. Each key is declared in the manifest
// `scene_actions` field and registered by src/app.js with onSceneAction.
//
//   - `get_forecast`: the figures of the forecast, as outputs the following
//     actions read ({{<column>.<row>.energy_tomorrow}}), e.g. in a message;
//   - `find_best_window`: the sunniest slot of a given length, today or
//     tomorrow — when to run an appliance on the panels' own production.
//
// The rules that matter: `fields` arrive resolved; resolve the declared
// `outputs` (scalars only); a scene action is never a condition, so "no
// forecast" is an output (`available` / `found`), not a failure; and never
// fire a scene event as a consequence of an action — a scene bound to that
// event would loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { DAYS, findBestWindow, summarize } from '../solar.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = {
  GET_FORECAST: 'get_forecast',
  FIND_BEST_WINDOW: 'find_best_window',
};

/** Default length of the window, in hours (mirrors the manifest default). */
export const DEFAULT_WINDOW_HOURS = 2;

/**
 * The forecast to answer with: the one in memory, or a fresh one when the
 * scene asks for it or when there is none yet. A failed call falls back to
 * the forecast in memory.
 */
async function currentForecast(app, refresh) {
  const { gladys, store } = app;
  if (refresh || store.forecast === null) {
    try {
      // Not app.refreshForecast: that path fires `forecast_updated`.
      await store.refresh(gladys, app.config);
    } catch {
      // Already logged by the store: answer with what there is.
    }
  }
  return store.forecast;
}

/**
 * @param {object} app the state src/app.js shares: gladys, store, config, now
 */
export function createSceneActions(app) {
  return {
    async [SCENE_ACTION_KEYS.GET_FORECAST](fields) {
      logger.info(`Scene action ${SCENE_ACTION_KEYS.GET_FORECAST} <- refresh=${fields.refresh}`);
      const forecast = await currentForecast(app, fields.refresh === true);
      if (!forecast) {
        return { available: false };
      }
      const summary = summarize(forecast, app.now());
      // Outputs are scalars: a figure the forecast does not cover is left out
      // (the following actions read it empty) rather than sent as null.
      const outputs = {
        available: true,
        power_now: summary.powerNow,
        power_next_hour: summary.powerNextHour,
        peak_power_today: summary.peakPowerToday,
        peak_time_today: summary.peakTimeToday,
        energy_today: summary.energyToday,
        energy_remaining_today: summary.energyRemainingToday,
        energy_tomorrow: summary.energyTomorrow,
      };
      return Object.fromEntries(Object.entries(outputs).filter(([, value]) => value !== null));
    },

    async [SCENE_ACTION_KEYS.FIND_BEST_WINDOW](fields) {
      const hours = Number(fields.duration ?? DEFAULT_WINDOW_HOURS);
      const day = fields.day === DAYS.TOMORROW ? DAYS.TOMORROW : DAYS.TODAY;
      logger.info(`Scene action ${SCENE_ACTION_KEYS.FIND_BEST_WINDOW} <- ${hours} h ${day}`);
      const forecast = await currentForecast(app, false);
      if (!forecast) {
        return { found: false };
      }
      const durationMinutes = Number.isFinite(hours) && hours > 0 ? hours * 60 : 120;
      const window = findBestWindow(forecast, { durationMinutes, day }, app.now());
      if (!window.found) {
        return { found: false };
      }
      return {
        found: true,
        start: window.start,
        end: window.end,
        energy: window.energy,
        average_power: window.averagePower,
      };
    },
  };
}
