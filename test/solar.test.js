import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForecast } from '../src/openMeteo.js';
import {
  buildForecast,
  DAYS,
  estimatePower,
  findBestWindow,
  localTime,
  startOfLocalDay,
  summarize,
} from '../src/solar.js';
import { normalizeConfig } from '../src/config.js';
import { at, MIDNIGHT, openMeteoBody } from './helpers/fakeOpenMeteo.js';

const config = normalizeConfig({ peak_power: 3, system_loss: 14 });
const site = { latitude: 48.86, longitude: 2.34, label: 'Home' };

function forecastOf(options) {
  return buildForecast(parseForecast(openMeteoBody(options)), config, site, at('05:00'));
}

test('1000 W/m² at 25 °C cells gives the peak power minus the losses', () => {
  assert.equal(estimatePower(1000, null, { peak_power: 3, system_loss: 14 }), 2580);
  assert.equal(estimatePower(1000, null, { peak_power: 3, system_loss: 0 }), 3000);
});

test('hot cells produce less, cold cells more', () => {
  const settings = { peak_power: 3, system_loss: 0 };
  // At 1000 W/m², the cells run ~31 °C above the air.
  const cool = estimatePower(1000, -6.25, settings);
  const hot = estimatePower(1000, 25, settings);
  assert.equal(cool, 3000, 'cells at 25 °C');
  assert.ok(hot < cool, `${hot} W at 56 °C cells`);
  assert.equal(hot, Math.round(3000 * (1 - 0.004 * 31.25)));
});

test('no sun, no power, and never above the peak power', () => {
  const settings = { peak_power: 3, system_loss: 0 };
  assert.equal(estimatePower(0, 20, settings), 0);
  assert.equal(estimatePower(-5, 20, settings), 0);
  assert.equal(estimatePower(1400, -40, settings), 3000);
});

test('days are cut at the local midnight of the site', () => {
  const forecast = forecastOf();
  assert.equal(startOfLocalDay(forecast, at('13:00')), MIDNIGHT);
  assert.equal(startOfLocalDay(forecast, at('00:00')), MIDNIGHT);
  assert.equal(startOfLocalDay(forecast, at('23:59')), MIDNIGHT);
  assert.equal(localTime(forecast, at('13:45')), '13:45');
});

test('summarize at solar noon', () => {
  const summary = summarize(forecastOf(), at('14:05'));
  // The slot 14:00-14:15 is next to the peak of the bell; the cells run hot
  // in 25 °C air, below the 2580 W of the standard conditions.
  assert.ok(summary.powerNow > 2000 && summary.powerNow < 2580, `${summary.powerNow} W`);
  assert.ok(summary.powerNextHour > 1800 && summary.powerNextHour < summary.powerNow);
  // Symmetric around 14:00: the first of the two equal slots wins.
  assert.equal(summary.peakTimeToday, '13:45');
  assert.ok(summary.peakPowerToday >= summary.powerNow);
  assert.ok(summary.energyToday > 12 && summary.energyToday < 20, `${summary.energyToday} kWh`);
  assert.ok(summary.energyRemainingToday < summary.energyToday);
  assert.ok(summary.energyRemainingToday > summary.energyToday / 2 - 1.5, 'about half is left');
  // Tomorrow is half as sunny in the fake forecast.
  assert.ok(Math.abs(summary.energyTomorrow - summary.energyToday / 2) < 0.6);
});

test('summarize at night: nothing now, the whole day ahead', () => {
  const summary = summarize(forecastOf(), at('03:00'));
  assert.equal(summary.powerNow, 0);
  assert.equal(summary.powerNextHour, 0);
  assert.equal(summary.energyRemainingToday, summary.energyToday);
});

test('figures the forecast does not cover are null, not zero', () => {
  // Late on the second day: no "tomorrow", no full next hour.
  const summary = summarize(forecastOf(), at('23:40', 1));
  assert.equal(summary.energyTomorrow, null);
  assert.equal(summary.powerNextHour, null);
  // Past the end of the forecast: no "now" either.
  assert.equal(summarize(forecastOf(), at('12:00', 3)).powerNow, null);
});

test('a dark day has no peak', () => {
  const summary = summarize(forecastOf({ peak: 0 }), at('12:00'));
  assert.equal(summary.energyToday, 0);
  assert.equal(summary.peakPowerToday, 0);
  assert.equal(summary.peakTimeToday, null);
});

test('the best window is centred on the sunniest hours', () => {
  const window = findBestWindow(
    forecastOf(),
    { durationMinutes: 120, day: DAYS.TODAY },
    at('05:00'),
  );
  assert.deepEqual(
    { found: window.found, start: window.start, end: window.end },
    { found: true, start: '13:00', end: '15:00' },
  );
  assert.ok(window.energy > 4 && window.energy < 5.2, `${window.energy} kWh`);
  // Two hours: the average power is half the energy (rounded apart).
  assert.ok(Math.abs(window.averagePower - (window.energy * 1000) / 2) < 10);
});

test("today's best window never starts in the past", () => {
  const window = findBestWindow(
    forecastOf(),
    { durationMinutes: 60, day: DAYS.TODAY },
    at('16:10'),
  );
  assert.equal(window.start, '16:00', 'the slot in progress is the earliest start');
  assert.equal(window.end, '17:00');
});

test('tomorrow is searched over the whole day', () => {
  const window = findBestWindow(
    forecastOf(),
    { durationMinutes: 30, day: DAYS.TOMORROW },
    at('20:00'),
  );
  assert.equal(window.found, true);
  assert.equal(window.start, '13:45');
  assert.equal(window.end, '14:15');
});

test('the duration is rounded to the quarter of an hour, one quarter at least', () => {
  const forecast = forecastOf();
  // The bell is symmetric around 14:00: ties go to the earliest window.
  const short = findBestWindow(forecast, { durationMinutes: 1, day: DAYS.TODAY }, at('05:00'));
  assert.equal(short.start, '13:45');
  assert.equal(short.end, '14:00');
  const odd = findBestWindow(forecast, { durationMinutes: 50, day: DAYS.TODAY }, at('05:00'));
  assert.equal(odd.start, '13:30');
  assert.equal(odd.end, '14:15', '50 minutes is 3 quarters');
});

test('no window at night, nor longer than what is left of the day', () => {
  assert.deepEqual(
    findBestWindow(forecastOf(), { durationMinutes: 60, day: DAYS.TODAY }, at('22:30')),
    { found: false },
  );
  assert.deepEqual(
    findBestWindow(forecastOf(), { durationMinutes: 720, day: DAYS.TODAY }, at('18:00')),
    { found: false },
  );
});
