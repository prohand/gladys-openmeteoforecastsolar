// -----------------------------------------------------------------------------
// Scene triggers (Gladys 5.1+): what HAPPENS, fired with publishSceneEvent.
//
//   - `production_threshold`: the estimated power goes above, or back below,
//     the threshold of the configuration — the moment to start the washing
//     machine, or to stop the water heater. One event per crossing, never one
//     per poll.
//   - `forecast_updated`: a new forecast arrived from Open-Meteo, with the
//     day's figures as variables ("tomorrow will be sunny: plan the laundry").
//
// Both keys are stored by the users' scenes: never rename them. Event `data`
// is flat and only carries the keys the manifest declares (`fields` and
// `variables`), the core drops any other.
// -----------------------------------------------------------------------------

export const TRIGGERS = {
  PRODUCTION_THRESHOLD: 'production_threshold',
  FORECAST_UPDATED: 'forecast_updated',
};

export const DIRECTIONS = { ABOVE: 'above', BELOW: 'below' };

/**
 * Remembers on which side of the threshold the estimated power was, to fire
 * one event per crossing.
 *
 * The first reading after a start, or after the threshold changed, only sets
 * the side: nobody saw the power cross anything.
 */
export function createThresholdTracker() {
  let side = null;
  let threshold = null;

  return {
    /**
     * @param {number|null} power estimated power now, W
     * @param {number} newThreshold W
     * @returns {object|null} the event data of a crossing, `null` otherwise
     */
    update(power, newThreshold) {
      if (power === null) {
        return null;
      }
      const current = power > newThreshold ? DIRECTIONS.ABOVE : DIRECTIONS.BELOW;
      const crossed = side !== null && threshold === newThreshold && current !== side;
      side = current;
      threshold = newThreshold;
      return crossed ? { direction: current, power, threshold: newThreshold } : null;
    },

    reset() {
      side = null;
      threshold = null;
    },
  };
}

/** Data of the `forecast_updated` event. */
export function forecastUpdatedData(summary) {
  return {
    energy_today: summary.energyToday,
    energy_remaining_today: summary.energyRemainingToday,
    energy_tomorrow: summary.energyTomorrow,
    peak_power_today: summary.peakPowerToday,
    peak_time_today: summary.peakTimeToday,
  };
}
