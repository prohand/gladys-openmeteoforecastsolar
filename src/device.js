// -----------------------------------------------------------------------------
// The device: one "solar forecast" per installation, read-only sensors.
//
// Its external ids are FOREVER: Gladys keys the device, its history, the
// scenes and the dashboards on them. They do not depend on the configuration
// — changing the peak power or the location updates the same device.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';

const DEVICE_TYPE = 'solar-forecast';

// One installation per integration: a fixed platform id, not a coordinate
// (moving the panels must not create a new device).
const PLATFORM_ID = 'installation';

/** Feature keys, kept in one place so discovery and states always agree. */
export const FEATURES = {
  POWER_NOW: 'power-now',
  POWER_NEXT_HOUR: 'power-next-hour',
  PEAK_POWER_TODAY: 'peak-power-today',
  ENERGY_TODAY: 'energy-today',
  ENERGY_REMAINING_TODAY: 'energy-remaining-today',
  ENERGY_TOMORROW: 'energy-tomorrow',
};

// The forecast is published under the production category, as POWER and
// DAILY_PRODUCTION only: the Gladys energy monitoring reads the production
// INDEX and THIRTY_MINUTES_PRODUCTION features as real metered production,
// and a forecast must never be counted as such.
const POWER = {
  category: DEVICE_FEATURE_CATEGORIES.ENERGY_PRODUCTION_SENSOR,
  type: DEVICE_FEATURE_TYPES.ENERGY_PRODUCTION_SENSOR.POWER,
  unit: DEVICE_FEATURE_UNITS.WATT,
  min: 0,
  max: 1_000_000,
};
const ENERGY = {
  category: DEVICE_FEATURE_CATEGORIES.ENERGY_PRODUCTION_SENSOR,
  type: DEVICE_FEATURE_TYPES.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
  unit: DEVICE_FEATURE_UNITS.KILOWATT_HOUR,
  min: 0,
  max: 10_000,
};

const FEATURE_DEFINITIONS = [
  { key: FEATURES.POWER_NOW, name: 'Estimated power now', ...POWER },
  { key: FEATURES.POWER_NEXT_HOUR, name: 'Estimated power next hour', ...POWER },
  { key: FEATURES.PEAK_POWER_TODAY, name: 'Estimated peak power today', ...POWER },
  { key: FEATURES.ENERGY_TODAY, name: 'Estimated production today', ...ENERGY },
  { key: FEATURES.ENERGY_REMAINING_TODAY, name: 'Estimated production left today', ...ENERGY },
  { key: FEATURES.ENERGY_TOMORROW, name: 'Estimated production tomorrow', ...ENERGY },
];

export function deviceIds(gladys) {
  return gladys.externalIds(DEVICE_TYPE, PLATFORM_ID);
}

/** The discovery payload. */
export function buildDevice(gladys) {
  const ids = deviceIds(gladys);
  return {
    name: 'Solar forecast',
    external_id: ids.device,
    // Polled every minute: the poll recomputes "now" from the forecast in
    // memory, and calls Open-Meteo only once it is older than the refresh
    // interval. `poll_frequency` is in ms and must be one of
    // DEVICE_POLL_FREQUENCIES, or Gladys refuses the whole list (400).
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    features: FEATURE_DEFINITIONS.map(({ key, ...feature }) => ({
      ...feature,
      external_id: ids.feature(key),
      read_only: true,
      has_feedback: false,
      keep_history: true,
    })),
  };
}

/**
 * The states of the device, from the figures of src/solar.js. A figure the
 * forecast does not cover (`null`) is left out rather than published as 0.
 */
export function buildStates(gladys, summary) {
  const ids = deviceIds(gladys);
  const values = {
    [FEATURES.POWER_NOW]: summary.powerNow,
    [FEATURES.POWER_NEXT_HOUR]: summary.powerNextHour,
    [FEATURES.PEAK_POWER_TODAY]: summary.peakPowerToday,
    [FEATURES.ENERGY_TODAY]: summary.energyToday,
    [FEATURES.ENERGY_REMAINING_TODAY]: summary.energyRemainingToday,
    [FEATURES.ENERGY_TOMORROW]: summary.energyTomorrow,
  };
  return Object.entries(values)
    .filter(([, state]) => state !== null)
    .map(([key, state]) => ({ device_feature_external_id: ids.feature(key), state }));
}
