import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, localize, pick } from '../src/i18n.js';
import { describeInstallation, formatKwh, formatWatts } from '../src/format.js';
import { normalizeConfig } from '../src/config.js';

test('English first: it is the fallback of Gladys', () => {
  assert.deepEqual(LANGUAGES, ['en', 'fr', 'de', 'es']);
  assert.equal(pick('it', { en: 'Hello', fr: 'Bonjour' }), 'Hello');
});

test('localize builds one text per language', () => {
  assert.deepEqual(
    localize((language) => language.toUpperCase()),
    { en: 'EN', fr: 'FR', de: 'DE', es: 'ES' },
  );
});

test('numbers are written the way each language writes them', () => {
  assert.equal(formatKwh('en', 12.43), '12.4 kWh');
  assert.equal(formatKwh('fr', 12.43), '12,4 kWh');
  assert.equal(formatKwh('de', 12.43), '12,4 kWh');
  assert.equal(formatWatts('en', 2450), '2,450 W');
  assert.equal(formatWatts('de', 2450), '2.450 W');
});

test('the installation reads as a compass point, kWc in French', () => {
  const text = describeInstallation(normalizeConfig({ peak_power: 4.5, tilt: 35, azimuth: 200 }));
  assert.equal(text.en, '4.5 kWp, 35°, south');
  assert.equal(text.fr, '4,5 kWc, 35°, sud');
  assert.equal(text.de, '4,5 kWp, 35°, Süden');
  assert.equal(text.es, '4,5 kWp, 35°, sur');
  assert.equal(describeInstallation(normalizeConfig({ azimuth: 100 })).en, '3 kWp, 30°, east');
  assert.equal(describeInstallation(normalizeConfig({ azimuth: 340 })).en, '3 kWp, 30°, north');
});
