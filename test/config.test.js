import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps user values over the defaults', () => {
  const config = normalizeConfig({ peak_power: 6.5, tilt: 15, azimuth: 90, system_loss: 10 });
  assert.equal(config.peak_power, 6.5);
  assert.equal(config.tilt, 15);
  assert.equal(config.azimuth, 90);
  assert.equal(config.system_loss, 10);
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ peak_power: '4.2', power_threshold: '1500', latitude: '45.5' });
  assert.equal(config.peak_power, 4.2);
  assert.equal(config.power_threshold, 1500);
  assert.equal(typeof config.power_threshold, 'number');
});

test('out-of-range values are brought back into range', () => {
  const config = normalizeConfig({
    tilt: 120,
    system_loss: -5,
    refresh_interval: 1,
    peak_power: 0,
  });
  assert.equal(config.tilt, 90);
  assert.equal(config.system_loss, 0);
  assert.equal(config.refresh_interval, 15, 'Open-Meteo is never called more than every 15 min');
  assert.equal(config.peak_power, 0.1);
});

test('a value that is not a number falls back to the default', () => {
  assert.equal(normalizeConfig({ peak_power: 'abc' }).peak_power, DEFAULT_CONFIG.peak_power);
  assert.equal(normalizeConfig({ tilt: '' }).tilt, DEFAULT_CONFIG.tilt);
});

test('typed coordinates override the house, both or neither', () => {
  const both = normalizeConfig({ latitude: '45.5', longitude: '-73.6' });
  assert.equal(both.latitude, 45.5);
  assert.equal(both.longitude, -73.6);

  // An empty field is not latitude 0.
  const empty = normalizeConfig({ latitude: '', longitude: '' });
  assert.equal(empty.latitude, null);
  assert.equal(empty.longitude, null);

  const half = normalizeConfig({ latitude: 45.5 });
  assert.equal(half.latitude, null, 'one coordinate alone locates nothing');
  assert.equal(half.longitude, null);

  const outOfRange = normalizeConfig({ latitude: 95, longitude: 2 });
  assert.equal(outOfRange.latitude, null);
});

test('latitude 0 and longitude 0 are a real place', () => {
  const config = normalizeConfig({ latitude: 0, longitude: 0 });
  assert.equal(config.latitude, 0);
  assert.equal(config.longitude, 0);
});
