import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import { FEATURES } from '../src/device.js';
import { ACTIONS } from '../src/app.js';
import { TRIGGERS } from '../src/capabilities/triggers.js';
import { SOLAR_WIDGET } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';
import { createHarness } from './helpers/harness.js';

test('on connection: the device is published and a first forecast fetched', async () => {
  const { gladys, state } = createHarness();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'Solar forecast');
  assert.equal(device.should_poll, true);
  assert.equal(device.poll_frequency, DEVICE_POLL_FREQUENCIES.EVERY_MINUTES);
  assert.equal(state.calls, 1);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(gladys.fake.transports.at(-1).transport, 'cloud');
  assert.equal(gladys.fake.transports.at(-1).degraded, undefined);
  assert.ok(gladys.fake.widgetRefreshes.includes(SOLAR_WIDGET), 'the widget is nudged');
});

test('a scan publishes the same device', async () => {
  const { gladys } = createHarness();
  await gladys.connect();
  const before = gladys.fake.discoveredDevices;
  await gladys.fake.scanRequest();
  assert.deepEqual(gladys.fake.discoveredDevices, before);
});

test('a poll publishes every figure of the forecast', async () => {
  const harness = createHarness({ time: '14:05' });
  await harness.gladys.connect();
  assert.deepEqual(await harness.poll(), { success: true });
  const { gladys, feature } = harness;
  for (const key of Object.values(FEATURES)) {
    assert.equal(typeof gladys.fake.lastState(feature(key)), 'number', `${key} is published`);
  }
  assert.ok(gladys.fake.lastState(feature(FEATURES.POWER_NOW)) > 2000);
  assert.ok(gladys.fake.lastState(feature(FEATURES.ENERGY_TOMORROW)) > 0);
});

test('polls between two refreshes recompute "now" without calling Open-Meteo', async () => {
  const harness = createHarness({ time: '09:00' });
  await harness.gladys.connect();
  await harness.poll();
  const morning = harness.gladys.fake.lastState(harness.feature(FEATURES.POWER_NOW));
  harness.setTime('09:20');
  await harness.poll();
  const later = harness.gladys.fake.lastState(harness.feature(FEATURES.POWER_NOW));
  assert.equal(harness.state.calls, 1);
  assert.ok(later > morning, `${morning} W then ${later} W`);
});

test('unchanged states are not sent again at every poll', async () => {
  const harness = createHarness({ time: '23:00' });
  await harness.gladys.connect();
  await harness.poll();
  const count = harness.gladys.fake.states.length;
  harness.setTime('23:01');
  await harness.poll();
  assert.equal(harness.gladys.fake.states.length, count, 'night: nothing changed');
});

test('Open-Meteo is called again after the refresh interval, and forecast_updated fires', async () => {
  const harness = createHarness({ config: { refresh_interval: 30 }, time: '10:00' });
  await harness.gladys.connect();
  await harness.poll();
  assert.equal(harness.gladys.fake.sceneEvents.length, 0, 'not on the connection refresh');

  harness.setTime('10:30');
  await harness.poll();
  assert.equal(harness.state.calls, 2);
  const events = harness.gladys.fake.sceneEvents.filter(
    (event) => event.key === TRIGGERS.FORECAST_UPDATED,
  );
  assert.equal(events.length, 1);
  assert.ok(events[0].data.energy_today > 0);
  assert.ok(events[0].data.energy_tomorrow > 0);
  assert.equal(events[0].data.peak_time_today, '13:45');
});

test('production_threshold fires once per crossing, both ways', async () => {
  const harness = createHarness({ config: { power_threshold: 1000 }, time: '07:00' });
  await harness.gladys.connect();
  const crossings = () =>
    harness.gladys.fake.sceneEvents.filter((event) => event.key === TRIGGERS.PRODUCTION_THRESHOLD);

  await harness.poll();
  assert.equal(crossings().length, 0, 'the first reading only sets the side');

  for (const time of ['09:00', '11:00', '12:00']) {
    harness.setTime(time);
    await harness.poll();
  }
  assert.equal(crossings().length, 1);
  assert.equal(crossings()[0].data.direction, 'above');
  assert.equal(crossings()[0].data.threshold, 1000);
  assert.ok(crossings()[0].data.power > 1000);

  harness.setTime('20:00');
  await harness.poll();
  assert.equal(crossings().length, 2);
  assert.equal(crossings()[1].data.direction, 'below');
});

test('a new threshold is a fresh start, not a crossing', async () => {
  const harness = createHarness({ config: { power_threshold: 1000 }, time: '12:00' });
  await harness.gladys.connect();
  await harness.poll();
  await harness.gladys.fake.configUpdated({ power_threshold: 5000 });
  harness.setTime('12:01');
  await harness.poll();
  const crossings = harness.gladys.fake.sceneEvents.filter(
    (event) => event.key === TRIGGERS.PRODUCTION_THRESHOLD,
  );
  assert.equal(crossings.length, 0);
});

test('a new configuration fetches a new forecast at once', async () => {
  const harness = createHarness({ config: { peak_power: 3 }, time: '14:05' });
  await harness.gladys.connect();
  await harness.poll();
  const before = harness.gladys.fake.lastState(harness.feature(FEATURES.POWER_NOW));
  await harness.gladys.fake.configUpdated({ peak_power: 6 });
  assert.equal(harness.state.calls, 2);
  const after = harness.gladys.fake.lastState(harness.feature(FEATURES.POWER_NOW));
  assert.ok(Math.abs(after - before * 2) <= 2, `${before} W then ${after} W`);
});

test('Open-Meteo down at start: disconnected status, unreachable badge', async () => {
  const harness = createHarness();
  harness.state.online = false;
  await harness.gladys.connect();
  const status = harness.gladys.fake.connectionStatus;
  assert.equal(status.connected, false);
  for (const language of LANGUAGES) {
    assert.match(status.message[language], /Open-Meteo/);
  }
  assert.equal(harness.gladys.fake.transports.at(-1).transport, 'unreachable');
  assert.deepEqual(await harness.poll(), { success: true }, 'the poll does not fail');
  assert.equal(harness.gladys.fake.states.length, 0);
});

test('Open-Meteo down later: the old forecast stays, the badge says so', async () => {
  const harness = createHarness({ time: '10:00' });
  await harness.gladys.connect();
  harness.state.online = false;
  harness.setTime('11:00');
  await harness.poll();
  const entry = harness.gladys.fake.transports.at(-1);
  assert.equal(entry.transport, 'cloud');
  assert.equal(entry.degraded, true);
  assert.match(entry.message.en, /forecast of 10:00/);
  assert.equal(harness.gladys.fake.connectionStatus.connected, false);
  // The states still follow the clock, from the forecast in memory.
  assert.ok(harness.gladys.fake.lastState(harness.feature(FEATURES.POWER_NOW)) > 0);

  harness.state.online = true;
  harness.setTime('11:06');
  await harness.poll();
  assert.equal(harness.gladys.fake.connectionStatus.connected, true);
  assert.equal(harness.gladys.fake.transports.at(-1).degraded, undefined, 'back to nominal');
});

test('no location: the status tells the user what to fill in', async () => {
  const harness = createHarness({ houses: [] });
  await harness.gladys.connect();
  assert.equal(harness.state.calls, 0);
  const { connected, message } = harness.gladys.fake.connectionStatus;
  assert.equal(connected, false);
  assert.match(message.en, /location of your house/);
  assert.match(message.fr, /position de votre maison/);
});

test('a picked house that no longer exists: the status says to pick another one', async () => {
  const harness = createHarness({ config: { house: 'deleted-house' } });
  await harness.gladys.connect();
  assert.equal(harness.state.calls, 0, 'never replaced by another house');
  const { connected, message } = harness.gladys.fake.connectionStatus;
  assert.equal(connected, false);
  assert.deepEqual(Object.keys(message), LANGUAGES);
  assert.match(message.en, /no longer exists/);
  assert.match(message.fr, /n'existe plus/);
});

test('"Test the forecast" answers with the figures, in every language', async () => {
  const harness = createHarness({ time: '08:00' });
  await harness.gladys.connect();
  const ack = await harness.gladys.fake.action(ACTIONS.TEST_FORECAST, {});
  assert.equal(ack.success, true);
  const message = ack.data.message;
  assert.deepEqual(Object.keys(message), LANGUAGES);
  assert.match(
    message.en,
    /^Open-Meteo OK \(Home\): .* kWh today, peak .* W at 13:45, .* kWh tomorrow\.$/,
  );
  assert.match(message.fr, /kWh aujourd'hui/);
  assert.match(message.de, /kWh heute/);
  assert.match(message.es, /kWh hoy/);
  assert.equal(harness.gladys.fake.sceneEvents.length, 0, 'an action fires no scene event');
});

test('"Test the forecast" explains a failure instead of throwing', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  harness.state.online = false;
  const ack = await harness.gladys.fake.action(ACTIONS.TEST_FORECAST, {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /could not be reached \(Open-Meteo HTTP 503\)/);
});

test('a poll for another device is ignored', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  const count = harness.gladys.fake.states.length;
  harness.setTime('12:00');
  const ack = await harness.gladys.fake.poll({ external_id: 'ext:test-integration:other' });
  assert.deepEqual(ack, { success: true });
  assert.equal(harness.gladys.fake.states.length, count);
});
