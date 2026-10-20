import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildForecastUrl,
  fetchIrradiance,
  parseForecast,
  SLOT_MS,
  toOpenMeteoAzimuth,
} from '../src/openMeteo.js';
import { MIDNIGHT, OFFSET_SECONDS, openMeteoBody } from './helpers/fakeOpenMeteo.js';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const plane = { latitude: 48.8566, longitude: 2.3522, tilt: 30, azimuth: 180 };

test('the compass orientation becomes the Open-Meteo azimuth (0 = south)', () => {
  assert.equal(toOpenMeteoAzimuth(180), 0, 'south');
  assert.equal(toOpenMeteoAzimuth(90), -90, 'east');
  assert.equal(toOpenMeteoAzimuth(270), 90, 'west');
  assert.equal(toOpenMeteoAzimuth(0), -180, 'north');
  assert.equal(toOpenMeteoAzimuth(360), -180, 'north again');
});

test('the request asks for the tilted irradiance of the plane, in local days', () => {
  const url = new URL(buildForecastUrl({ ...plane, azimuth: 225 }));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '48.8566');
  assert.equal(url.searchParams.get('longitude'), '2.3522');
  assert.equal(url.searchParams.get('tilt'), '30');
  assert.equal(url.searchParams.get('azimuth'), '45', 'south-west is 45 for Open-Meteo');
  assert.match(url.searchParams.get('minutely_15'), /global_tilted_irradiance/);
  assert.match(url.searchParams.get('minutely_15'), /temperature_2m/);
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(url.searchParams.get('forecast_days'), '2');
});

test('a 15-minute value covers the 15 minutes before its timestamp', () => {
  const { slots, utcOffsetSeconds, timezone } = parseForecast(openMeteoBody());
  assert.equal(utcOffsetSeconds, OFFSET_SECONDS);
  assert.equal(timezone, 'Europe/Paris');
  assert.equal(slots.length, 192);
  assert.equal(slots[0].end, MIDNIGHT);
  assert.equal(slots[0].start, MIDNIGHT - SLOT_MS);
  assert.equal(slots[0].temperature, 25);
});

test('values Open-Meteo does not give are left out, negative ones floored', () => {
  const body = openMeteoBody();
  body.minutely_15.global_tilted_irradiance[0] = null;
  body.minutely_15.global_tilted_irradiance[1] = -3;
  body.minutely_15.temperature_2m[1] = null;
  const { slots } = parseForecast(body);
  assert.equal(slots.length, 191);
  assert.equal(slots[0].irradiance, 0);
  assert.equal(slots[0].temperature, null);
});

test('an answer without 15-minute data is refused', () => {
  assert.throws(() => parseForecast({}), /without 15-minute data/);
  assert.throws(
    () => parseForecast({ minutely_15: { time: [1], global_tilted_irradiance: [null] } }),
    /without any irradiance/,
  );
});

test('fetchIrradiance returns the parsed slots', async () => {
  let calledUrl;
  globalThis.fetch = async (url) => {
    calledUrl = url;
    return { ok: true, json: async () => openMeteoBody() };
  };
  const result = await fetchIrradiance(plane);
  assert.equal(result.slots.length, 192);
  assert.match(calledUrl, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
});

test('fetchIrradiance reports the reason Open-Meteo gives for a refusal', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ error: true, reason: 'Latitude must be in range of -90 to 90°.' }),
  });
  await assert.rejects(fetchIrradiance(plane), /Open-Meteo HTTP 400: Latitude must be in range/);
});

test('fetchIrradiance throws on a server error without a body', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => {
      throw new SyntaxError('Unexpected end of JSON input');
    },
  });
  await assert.rejects(fetchIrradiance(plane), /^Error: Open-Meteo HTTP 503$/);
});
