// -----------------------------------------------------------------------------
// Numbers as each language writes them: "2,450 W" in English, "2 450 W" in
// French, "2.450 W" in German. Used by the texts the integration builds itself
// (action messages, widget rows); device states stay plain numbers.
// -----------------------------------------------------------------------------

import { localize } from './i18n.js';

/** A number in one language, at most `digits` decimals. */
export function formatNumber(language, value, digits = 0) {
  return new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(value);
}

/** `12.4 kWh`, in one language. */
export function formatKwh(language, value) {
  return `${formatNumber(language, value, 1)} kWh`;
}

/** `2,450 W`, in one language. */
export function formatWatts(language, value) {
  return `${formatNumber(language, value)} W`;
}

/** The orientation of the panels as a compass point, in every language. */
const COMPASS = [
  { en: 'north', fr: 'nord', de: 'Norden', es: 'norte' },
  { en: 'north-east', fr: 'nord-est', de: 'Nordosten', es: 'noreste' },
  { en: 'east', fr: 'est', de: 'Osten', es: 'este' },
  { en: 'south-east', fr: 'sud-est', de: 'Südosten', es: 'sureste' },
  { en: 'south', fr: 'sud', de: 'Süden', es: 'sur' },
  { en: 'south-west', fr: 'sud-ouest', de: 'Südwesten', es: 'suroeste' },
  { en: 'west', fr: 'ouest', de: 'Westen', es: 'oeste' },
  { en: 'north-west', fr: 'nord-ouest', de: 'Nordwesten', es: 'noroeste' },
];

/** Kilowatt-peak: French writes "crête". */
const PEAK_UNIT = { en: 'kWp', fr: 'kWc', de: 'kWp', es: 'kWp' };

/** `3 kWp, 30°, south`, in every language. */
export function describeInstallation(config) {
  const point = COMPASS[Math.round((((config.azimuth % 360) + 360) % 360) / 45) % 8];
  return localize(
    (language) =>
      `${formatNumber(language, config.peak_power, 2)} ${PEAK_UNIT[language]}, ` +
      `${formatNumber(language, config.tilt)}°, ${point[language]}`,
  );
}
