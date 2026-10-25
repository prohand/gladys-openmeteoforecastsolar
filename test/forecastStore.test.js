import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createForecastStore, MissingLocationError, RETRY_DELAY_MS } from '../src/forecastStore.js';
import { parseForecast } from '../src/openMeteo.js';
import { normalizeConfig } from '../src/config.js';
import { LOCATION_PROBLEMS, resolveSite } from '../src/location.js';
import { at, openMeteoBody } from './helpers/fakeOpenMeteo.js';

const HOUSES = [
  { id: 'a', name: 'Cabin', selector: 'cabin', latitude: null, longitude: null },
  { id: 'b', name: 'Home', selector: 'home', latitude: 48.86, longitude: 2.34 },
];

function setup({ houses = HOUSES, fail = false } = {}) {
  let clock = at('10:00');
  const calls = [];
  const gladys = createFakeGladys({ houses });
  const store = createForecastStore({
    now: () => clock,
    fetchIrradiance: async (plane) => {
      calls.push(plane);
      if (fail) {
        throw new Error('network down');
      }
      return parseForecast(openMeteoBody());
    },
  });
  return {
    gladys,
    store,
    calls,
    tick: (ms) => {
      clock += ms;
    },
  };
}

test('the first located Gladys house locates the panels', async () => {
  const site = await resolveSite(createFakeGladys({ houses: HOUSES }), normalizeConfig());
  assert.deepEqual(site, { latitude: 48.86, longitude: 2.34, label: 'Home' });
});

test('typed coordinates win over the house', async () => {
  const config = normalizeConfig({ latitude: 43.6, longitude: 1.44 });
  const site = await resolveSite(createFakeGladys({ houses: HOUSES }), config);
  assert.deepEqual(site, { latitude: 43.6, longitude: 1.44, label: null });
});

const TWO_HOUSES = [
  { id: 'h1', name: 'Home', selector: 'home', latitude: 48.86, longitude: 2.34 },
  { id: 'h2', name: 'Barn', selector: 'barn', latitude: 45.76, longitude: 4.83 },
  { id: 'h3', name: 'Flat', selector: 'flat', latitude: null, longitude: null },
];

test('the house picked in the configuration locates the panels', async () => {
  const site = await resolveSite(
    createFakeGladys({ houses: TWO_HOUSES }),
    normalizeConfig({ house: 'barn' }),
  );
  assert.deepEqual(site, { latitude: 45.76, longitude: 4.83, label: 'Barn' });
});

test('a picked house that is gone or not on the map is reported, never replaced', async () => {
  const gladys = createFakeGladys({ houses: TWO_HOUSES });
  assert.deepEqual(await resolveSite(gladys, normalizeConfig({ house: 'deleted' })), {
    problem: LOCATION_PROBLEMS.HOUSE_NOT_FOUND,
    house: null,
  });
  assert.deepEqual(await resolveSite(gladys, normalizeConfig({ house: 'flat' })), {
    problem: LOCATION_PROBLEMS.HOUSE_UNLOCATED,
    house: 'Flat',
  });
});

test('typed coordinates win over the picked house', async () => {
  const config = normalizeConfig({ house: 'barn', latitude: 43.6, longitude: 1.44 });
  const site = await resolveSite(createFakeGladys({ houses: TWO_HOUSES }), config);
  assert.deepEqual(site, { latitude: 43.6, longitude: 1.44, label: null });
});

test('a picked house that locates nothing does not call Open-Meteo', async () => {
  const { gladys, store, calls } = setup({ houses: TWO_HOUSES });
  const err = await store.refresh(gladys, normalizeConfig({ house: 'flat' })).catch((e) => e);
  assert.ok(err instanceof MissingLocationError);
  assert.equal(err.problem, LOCATION_PROBLEMS.HOUSE_UNLOCATED);
  assert.equal(calls.length, 0);
});

test('picking another house makes the forecast stale at once', async () => {
  const { gladys, store } = setup({ houses: TWO_HOUSES });
  await store.refresh(gladys, normalizeConfig());
  assert.equal(store.isDue(normalizeConfig()), false);
  assert.equal(store.isDue(normalizeConfig({ house: 'barn' })), true);
});

test('no located house and no coordinates: nothing to forecast', async () => {
  const { gladys, store, calls } = setup({ houses: [HOUSES[0]] });
  await assert.rejects(store.refresh(gladys, normalizeConfig()), MissingLocationError);
  assert.equal(calls.length, 0, 'Open-Meteo is not called without a place');
  assert.ok(store.lastError instanceof MissingLocationError);
});

test('the plane sent to Open-Meteo carries the panels of the configuration', async () => {
  const { gladys, store, calls } = setup();
  await store.refresh(gladys, normalizeConfig({ tilt: 20, azimuth: 135 }));
  assert.deepEqual(calls[0], {
    latitude: 48.86,
    longitude: 2.34,
    label: 'Home',
    tilt: 20,
    azimuth: 135,
  });
  assert.equal(store.forecast.site.label, 'Home');
  assert.equal(store.lastError, null);
});

test('Open-Meteo is called again once the forecast is older than the interval', async () => {
  const { gladys, store, tick } = setup();
  const config = normalizeConfig({ refresh_interval: 30 });
  assert.equal(store.isDue(config), true, 'no forecast yet');
  await store.refresh(gladys, config);
  assert.equal(store.isDue(config), false);
  tick(29 * 60 * 1000);
  assert.equal(store.isDue(config), false);
  tick(60 * 1000);
  assert.equal(store.isDue(config), true);
});

test('a new installation or place makes the forecast stale at once', async () => {
  const { gladys, store } = setup();
  const config = normalizeConfig();
  await store.refresh(gladys, config);
  assert.equal(store.isDue(normalizeConfig({ peak_power: 9 })), true);
  assert.equal(store.isDue(normalizeConfig({ latitude: 1, longitude: 2 })), true);
  assert.equal(store.isDue(normalizeConfig({ power_threshold: 5 })), false, 'not for a threshold');
});

test('a failed call keeps the previous forecast and waits before retrying', async () => {
  let clock = at('10:00');
  let online = true;
  const gladys = createFakeGladys({ houses: HOUSES });
  const store = createForecastStore({
    now: () => clock,
    fetchIrradiance: async () => {
      if (!online) {
        throw new Error('network down');
      }
      return parseForecast(openMeteoBody());
    },
  });
  const config = normalizeConfig();
  await store.refresh(gladys, config);
  const previous = store.forecast;

  online = false;
  clock += 31 * 60 * 1000;
  assert.equal(store.isDue(config), true);
  await assert.rejects(store.refresh(gladys, config), /network down/);
  assert.equal(store.forecast, previous, 'still the best estimate there is');
  assert.match(store.lastError.message, /network down/);
  clock += 60 * 1000;
  assert.equal(store.isDue(config), false, 'not retried at the next poll');
});

test('the retry delay passes, or a new configuration lifts it', async () => {
  let clock = at('10:00');
  const gladys = createFakeGladys({ houses: HOUSES });
  const store = createForecastStore({
    now: () => clock,
    fetchIrradiance: async () => {
      throw new Error('network down');
    },
  });
  const config = normalizeConfig();
  await assert.rejects(store.refresh(gladys, config));
  clock += RETRY_DELAY_MS - 1000;
  assert.equal(store.isDue(config), false);
  clock += 1000;
  assert.equal(store.isDue(config), true);

  await assert.rejects(store.refresh(gladys, config));
  assert.equal(store.isDue(config), false);
  store.invalidate();
  assert.equal(store.isDue(config), true);
});

test('concurrent refreshes share one request', async () => {
  const { gladys, store, calls } = setup();
  const config = normalizeConfig();
  await Promise.all([store.refresh(gladys, config), store.refresh(gladys, config)]);
  assert.equal(calls.length, 1);
});
