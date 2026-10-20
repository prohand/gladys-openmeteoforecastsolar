// The whole integration on the fake Gladys of the SDK, with a fake Open-Meteo
// and a clock the test moves by hand.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';
import { parseForecast } from '../../src/openMeteo.js';
import { at, openMeteoBody } from './fakeOpenMeteo.js';

export const HOUSES = [
  { id: 'h1', name: 'Home', selector: 'home', latitude: 48.86, longitude: 2.34 },
];

/**
 * @param {object} [options]
 * @param {object} [options.config] the configuration Gladys serves
 * @param {object[]} [options.houses] the Gladys houses
 * @param {string} [options.time] local `HH:MM` of the first day to start at
 */
export function createHarness({ config = {}, houses = HOUSES, time = '10:00' } = {}) {
  const gladys = createFakeGladys({ config, houses });
  const state = { clock: at(time), online: true, calls: 0, body: openMeteoBody() };
  const app = createApp(gladys, {
    now: () => state.clock,
    fetchIrradiance: async () => {
      state.calls += 1;
      if (!state.online) {
        throw new Error('Open-Meteo HTTP 503');
      }
      return parseForecast(state.body);
    },
  });
  const device = () => gladys.fake.discoveredDevices[0];
  return {
    gladys,
    app,
    state,
    device,
    /** Move the clock to a local `HH:MM` (of the first day, or `day` after). */
    setTime(hhmm, day = 0) {
      state.clock = at(hhmm, day);
    },
    feature(key) {
      return `${device().external_id}:${key}`;
    },
    poll() {
      return gladys.fake.poll(device());
    },
  };
}
