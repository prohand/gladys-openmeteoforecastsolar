// -----------------------------------------------------------------------------
// Integration configuration.
//
// The values are filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. The SDK fetches them (`getConfig()`) and
// notifies every change (`onConfigUpdated()`). This module only provides the
// defaults and normalizes the received object, so the rest of the code never
// deals with `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay equal to the `default` values of the manifest
// `config_schema` (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Peak power of the panels, in kWp (the sum printed on their labels).
  peak_power: 3,
  // Panel tilt, in degrees: 0 = flat, 90 = vertical.
  tilt: 30,
  // Panel orientation, in compass degrees: 0 = north, 90 = east, 180 = south,
  // 270 = west. Converted to the Open-Meteo convention in src/openMeteo.js.
  azimuth: 180,
  // Losses of the whole system (inverter, cables, dirt), in percent.
  system_loss: 14,
  // Estimated power above which the `production_threshold` trigger says the
  // production is "above", in watts.
  power_threshold: 1000,
  // Minutes between two calls to Open-Meteo. Its models are updated every
  // hour at best: a faster pace brings nothing.
  refresh_interval: 30,
  // The Gladys house the panels sit at: the `selector` the `source: "houses"`
  // select stores (Gladys 5.2+). Empty means the first located house.
  house: '',
  // Coordinates to observe. Empty (null) means the location of the Gladys
  // house (see src/location.js): the user only types them to override it.
  latitude: null,
  longitude: null,
};

/**
 * A number typed in a form, or `null` when the field is empty.
 *
 * `Number('')` is 0, a valid latitude: an empty field must not become one.
 */
function optionalNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A number typed in a form, kept inside [min, max], the default otherwise. */
function boundedNumber(value, fallback, min, max) {
  const number = optionalNumber(value);
  if (number === null) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const latitude = optionalNumber(raw.latitude);
  const longitude = optionalNumber(raw.longitude);
  // One coordinate without the other locates nothing: both or neither.
  const located =
    latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    peak_power: boundedNumber(raw.peak_power, DEFAULT_CONFIG.peak_power, 0.1, 1000),
    tilt: boundedNumber(raw.tilt, DEFAULT_CONFIG.tilt, 0, 90),
    azimuth: boundedNumber(raw.azimuth, DEFAULT_CONFIG.azimuth, 0, 360),
    system_loss: boundedNumber(raw.system_loss, DEFAULT_CONFIG.system_loss, 0, 50),
    power_threshold: boundedNumber(
      raw.power_threshold,
      DEFAULT_CONFIG.power_threshold,
      0,
      1_000_000,
    ),
    refresh_interval: boundedNumber(raw.refresh_interval, DEFAULT_CONFIG.refresh_interval, 15, 180),
    house: typeof raw.house === 'string' ? raw.house.trim() : '',
    latitude: located ? latitude : null,
    longitude: located ? longitude : null,
  };
}
