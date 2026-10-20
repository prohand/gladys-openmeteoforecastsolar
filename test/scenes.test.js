import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTION_KEYS } from '../src/capabilities/scenes.js';
import { TRIGGERS } from '../src/capabilities/triggers.js';
import { createHarness } from './helpers/harness.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

/** Every key of `values` is declared and holds a scalar. */
function assertDeclaredScalars(values, declared, what) {
  for (const [key, value] of Object.entries(values)) {
    assert.ok(declared.includes(key), `${what}.${key} is not declared, the core would drop it`);
    assert.ok(value === null || typeof value !== 'object', `${what}.${key} must be a primitive`);
  }
}

async function sceneAction(harness, key, fields = {}) {
  const ack = await harness.gladys.fake.sceneAction(key, fields);
  assert.equal(ack.success, true, ack.error);
  return ack.data.outputs;
}

test('get_forecast returns the declared outputs', async () => {
  const harness = createHarness({ time: '12:00' });
  await harness.gladys.connect();
  const outputs = await sceneAction(harness, SCENE_ACTION_KEYS.GET_FORECAST, { refresh: false });
  assert.equal(outputs.available, true);
  assert.ok(outputs.power_now > 0);
  assert.equal(outputs.peak_time_today, '13:45');
  assert.ok(outputs.energy_tomorrow > 0);
  assertDeclaredScalars(
    outputs,
    keysOf(declarationOf('scene_actions', SCENE_ACTION_KEYS.GET_FORECAST).outputs),
    'outputs',
  );
  assert.equal(harness.state.calls, 1, 'the forecast in memory answers');
});

test('get_forecast with refresh calls Open-Meteo, and fires no event', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  await sceneAction(harness, SCENE_ACTION_KEYS.GET_FORECAST, { refresh: true });
  assert.equal(harness.state.calls, 2);
  // A scene bound to forecast_updated and calling get_forecast would loop.
  assert.equal(harness.gladys.fake.sceneEvents.length, 0);
});

test('without any forecast, get_forecast says so instead of failing the scene', async () => {
  const harness = createHarness({ houses: [] });
  await harness.gladys.connect();
  const outputs = await sceneAction(harness, SCENE_ACTION_KEYS.GET_FORECAST, {});
  assert.deepEqual(outputs, { available: false });
});

test('find_best_window answers with the sunniest slot', async () => {
  const harness = createHarness({ time: '07:00' });
  await harness.gladys.connect();
  const outputs = await sceneAction(harness, SCENE_ACTION_KEYS.FIND_BEST_WINDOW, {
    duration: 2,
    day: 'today',
  });
  assert.equal(outputs.found, true);
  assert.equal(outputs.start, '13:00');
  assert.equal(outputs.end, '15:00');
  assert.ok(outputs.energy > 0 && outputs.average_power > 0);
  assertDeclaredScalars(
    outputs,
    keysOf(declarationOf('scene_actions', SCENE_ACTION_KEYS.FIND_BEST_WINDOW).outputs),
    'outputs',
  );
});

test('find_best_window falls back to the manifest defaults', async () => {
  const harness = createHarness({ time: '07:00' });
  await harness.gladys.connect();
  const outputs = await sceneAction(harness, SCENE_ACTION_KEYS.FIND_BEST_WINDOW, {});
  assert.equal(outputs.end, '15:00', 'two hours, today');
  const declaration = declarationOf('scene_actions', SCENE_ACTION_KEYS.FIND_BEST_WINDOW);
  assert.equal(declaration.fields.find((field) => field.key === 'duration').default, 2);
  assert.equal(declaration.fields.find((field) => field.key === 'day').default, 'today');
});

test('find_best_window late in the evening finds nothing today, but something tomorrow', async () => {
  const harness = createHarness({ time: '22:30' });
  await harness.gladys.connect();
  assert.deepEqual(
    await sceneAction(harness, SCENE_ACTION_KEYS.FIND_BEST_WINDOW, { duration: 1, day: 'today' }),
    { found: false },
  );
  const tomorrow = await sceneAction(harness, SCENE_ACTION_KEYS.FIND_BEST_WINDOW, {
    duration: 1,
    day: 'tomorrow',
  });
  assert.equal(tomorrow.found, true);
  assert.equal(tomorrow.start, '13:30');
});

test('the events only carry the keys their trigger declares', async () => {
  const harness = createHarness({ config: { power_threshold: 500 }, time: '06:00' });
  await harness.gladys.connect();
  await harness.poll();
  for (const time of ['09:00', '10:00', '10:30']) {
    harness.setTime(time);
    await harness.poll();
  }
  const keys = new Set(harness.gladys.fake.sceneEvents.map((event) => event.key));
  assert.deepEqual([...keys].sort(), Object.values(TRIGGERS).sort(), 'both triggers fired');
  for (const { key, data } of harness.gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    assertDeclaredScalars(data, [...keysOf(trigger.fields), ...keysOf(trigger.variables)], key);
  }
  const crossing = harness.gladys.fake.sceneEvents.find(
    (event) => event.key === TRIGGERS.PRODUCTION_THRESHOLD,
  );
  const options = declarationOf('scene_triggers', TRIGGERS.PRODUCTION_THRESHOLD)
    .fields.find((field) => field.key === 'direction')
    .options.map((option) => option.value);
  assert.ok(options.includes(crossing.data.direction));
});
