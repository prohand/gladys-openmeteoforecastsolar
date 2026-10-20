import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { SOLAR_WIDGET, WIDGET_ACTIONS } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';
import { createHarness } from './helpers/harness.js';

async function contentOf(harness, language = 'en') {
  const ack = await harness.gladys.fake.widgetGet(SOLAR_WIDGET, { language });
  assert.equal(ack.success, true);
  return ack.data.content;
}

test('the widget content is rendered exactly as sent', async () => {
  const harness = createHarness({ time: '11:00' });
  await harness.gladys.connect();
  // [] = nothing the core would drop, truncate or trim to the content budget.
  assert.deepEqual(validateWidgetContent(await contentOf(harness)), []);
});

test('the live tiles reference features the device publishes', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  const featureIds = new Set(harness.device().features.map((feature) => feature.external_id));
  const tiles = (await contentOf(harness)).components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 3);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), `unknown feature ${tile.device_feature}`);
  }
});

test('the chart draws today and tomorrow, with the peak marked', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  const chart = (await contentOf(harness)).components.find((c) => c.type === 'chart');
  assert.equal(chart.series.length, 1);
  assert.ok(chart.series[0].points.length > 180 && chart.series[0].points.length <= 300);
  assert.equal(chart.now_marker, true);
  assert.equal(chart.annotations.length, 1);
  assert.ok(chart.annotations[0].value > 0);
});

test('every text of the widget exists in every language', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  const content = await contentOf(harness);
  const texts = [];
  for (const component of content.components) {
    texts.push(component.label, component.title, component.text);
    for (const item of component.items ?? []) {
      texts.push(item.label, typeof item.value === 'object' ? item.value : undefined);
    }
  }
  for (const text of texts.filter((value) => value && typeof value === 'object')) {
    assert.deepEqual(Object.keys(text), LANGUAGES, JSON.stringify(text));
  }
});

test('without a forecast, the widget says why and offers to retry', async () => {
  const missing = createHarness({ houses: [] });
  await missing.gladys.connect();
  const noLocation = await contentOf(missing);
  assert.deepEqual(validateWidgetContent(noLocation), []);
  assert.match(noLocation.components[0].text.en, /location of your house/);

  const offline = createHarness();
  offline.state.online = false;
  await offline.gladys.connect();
  const noForecast = await contentOf(offline);
  assert.deepEqual(validateWidgetContent(noForecast), []);
  assert.match(noForecast.components[0].text.en, /could not be reached/);
  assert.equal(noForecast.components.at(-1).action.key, WIDGET_ACTIONS.REFRESH);
});

test('an old forecast kept after a failure shows a warning on its date', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  harness.state.online = false;
  harness.setTime('11:00');
  await harness.poll();
  const status = (await contentOf(harness)).components.find((c) => c.type === 'status');
  const updated = status.items.find((item) => item.label.en === 'Updated');
  assert.equal(updated.value, '10:00');
  assert.equal(updated.color, 'warning');
});

test('the refresh button calls Open-Meteo and answers a short toast', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  const ack = await harness.gladys.fake.widgetAction(SOLAR_WIDGET, WIDGET_ACTIONS.REFRESH, {});
  assert.equal(ack.success, true);
  assert.equal(harness.state.calls, 2);
  assert.equal(ack.data.message.en, 'Forecast updated.');
  assert.equal(harness.gladys.fake.sceneEvents.length, 0, 'a button fires no scene event');

  harness.state.online = false;
  const failed = await harness.gladys.fake.widgetAction(SOLAR_WIDGET, WIDGET_ACTIONS.REFRESH, {});
  assert.equal(failed.data.message.en, 'Open-Meteo could not be reached.');
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const harness = createHarness();
  await harness.gladys.connect();
  const ack = await harness.gladys.fake.widgetAction(SOLAR_WIDGET, 'unknown', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /Unknown widget action/);
});
