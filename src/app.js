// -----------------------------------------------------------------------------
// Wiring: every SDK handler, registered on the Gladys client it is given.
//
// index.js passes the real client; the tests pass the fake Gladys of the SDK
// (`createFakeGladys()`) and a fake Open-Meteo, and play the whole lifecycle —
// connection, polls, scenes, widget — without network.
//
// The flow, in short:
//   - on connection: publish the device, fetch a first forecast;
//   - every minute (Gladys polls the device): call Open-Meteo again when the
//     forecast is older than the refresh interval, publish the states that
//     changed, fire the threshold trigger on a crossing;
//   - after each call to Open-Meteo: report the connection status and the
//     transport badge, nudge the widget.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { buildDevice, buildStates, deviceIds } from './device.js';
import { createForecastStore, MissingLocationError } from './forecastStore.js';
import { describeCoordinates } from './location.js';
import { formatKwh, formatWatts } from './format.js';
import { localize, pick } from './i18n.js';
import { localTime, summarize } from './solar.js';
import { createSceneActions } from './capabilities/scenes.js';
import { createThresholdTracker, forecastUpdatedData, TRIGGERS } from './capabilities/triggers.js';
import { buildSolarWidget, handleWidgetAction, SOLAR_WIDGET } from './capabilities/widget.js';

const logger = createLogger({ name: 'app' });

/** Manifest actions (Configuration screen buttons). */
export const ACTIONS = { TEST_FORECAST: 'test_forecast' };

// An unchanged state is re-sent this often, so it stays recently dated in
// Gladys (the host API accepts 300 states a minute, sized for changes).
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

const NO_LOCATION = {
  en: 'No location: set the location of your house in Gladys, or type coordinates.',
  fr: 'Aucune position : renseignez la position de votre maison dans Gladys, ou saisissez des coordonnées.',
  de: 'Kein Standort: Lege den Standort deines Hauses in Gladys fest oder gib Koordinaten ein.',
  es: 'Sin ubicación: indique la ubicación de su casa en Gladys o escriba unas coordenadas.',
};

/** Why Open-Meteo failed, as the user reads it. */
function describeFailure(err) {
  if (err instanceof MissingLocationError) {
    return NO_LOCATION;
  }
  return {
    en: `Open-Meteo could not be reached (${err.message}).`,
    fr: `Open-Meteo n'a pas pu être joint (${err.message}).`,
    de: `Open-Meteo war nicht erreichbar (${err.message}).`,
    es: `No se pudo contactar con Open-Meteo (${err.message}).`,
  };
}

/**
 * Register every handler on `gladys`. Call it before `gladys.connect()`.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} [deps]
 * @param {Function} [deps.fetchIrradiance] the Open-Meteo call (faked in the tests)
 * @param {() => number} [deps.now] clock
 * @returns {object} the shared state, for the tests
 */
export function createApp(gladys, { fetchIrradiance, now = Date.now } = {}) {
  const store = createForecastStore({ fetchIrradiance, now });
  const tracker = createThresholdTracker();
  const app = { gladys, store, now, config: normalizeConfig(), refreshForecast };
  const ids = deviceIds(gladys);

  // --- What the Configuration screen and the device card show ---------------
  async function reportStatus() {
    const error = store.lastError;
    const forecast = store.forecast;
    await gladys.setConnectionStatus(error === null, error ? describeFailure(error) : undefined);

    // Cloud only (manifest `transports`): the badge says whether the last
    // call went through, and flags an old forecast kept after a failure.
    let entry = { external_id: ids.device, transport: DEVICE_TRANSPORTS.CLOUD };
    if (error && forecast) {
      const time = localTime(forecast, forecast.fetchedAt);
      entry = {
        ...entry,
        degraded: true,
        message: {
          en: `Open-Meteo unreachable, showing the forecast of ${time}.`,
          fr: `Open-Meteo injoignable, prévision de ${time} affichée.`,
          de: `Open-Meteo nicht erreichbar, Prognose von ${time} angezeigt.`,
          es: `Open-Meteo inaccesible, se muestra la previsión de las ${time}.`,
        },
      };
    } else if (error) {
      entry = { ...entry, transport: DEVICE_TRANSPORTS.UNREACHABLE };
    }
    await gladys.publishTransports([entry]);
    gladys.requestWidgetRefresh(SOLAR_WIDGET);
  }

  // --- Device states ---------------------------------------------------------
  async function publishFigures() {
    if (!store.forecast) {
      return null;
    }
    const summary = summarize(store.forecast, now());
    await gladys.publishChangedStates(buildStates(gladys, summary), {
      heartbeat: STATE_HEARTBEAT_MS,
    });
    return summary;
  }

  async function fireSceneEvent(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
    } catch (err) {
      // A refused event (429…) must not stop the states from flowing.
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  /**
   * Call Open-Meteo now, then report and publish. `fireEvent` is only true on
   * the scheduled path: an event fired as the consequence of a scene action
   * could loop through a scene bound to it.
   */
  async function refreshForecast({ fireEvent }) {
    try {
      await store.refresh(gladys, app.config);
    } finally {
      await reportStatus().catch((err) => logger.error('Status report failed', err));
    }
    const summary = await publishFigures();
    if (fireEvent && summary) {
      await fireSceneEvent(TRIGGERS.FORECAST_UPDATED, forecastUpdatedData(summary));
    }
    return summary;
  }

  // --- Discovery -------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices([buildDevice(gladys)]);
  });

  // --- Polling: every minute, see src/forecastStore.js -----------------------
  gladys.onPoll(async (device) => {
    if (device.external_id !== ids.device) {
      return;
    }
    let summary;
    if (store.isDue(app.config)) {
      try {
        summary = await refreshForecast({ fireEvent: true });
      } catch {
        // Reported by refreshForecast; the forecast in memory still counts.
      }
    }
    summary ??= await publishFigures();
    if (!summary) {
      return;
    }
    const crossing = tracker.update(summary.powerNow, app.config.power_threshold);
    if (crossing) {
      logger.info(`Estimated power ${crossing.direction} ${crossing.threshold} W`);
      await fireSceneEvent(TRIGGERS.PRODUCTION_THRESHOLD, crossing);
    }
  });

  // --- Manifest action: "Test the forecast" ----------------------------------
  gladys.onAction(ACTIONS.TEST_FORECAST, async () => {
    logger.info(`Action ${ACTIONS.TEST_FORECAST} -> live request to Open-Meteo`);
    let summary;
    try {
      summary = await refreshForecast({ fireEvent: false });
    } catch (err) {
      return describeFailure(err);
    }
    const { site } = store.forecast;
    const place = site.label ?? describeCoordinates(site);
    return localize((language) => {
      const today = formatKwh(language, summary.energyToday);
      const tomorrow =
        summary.energyTomorrow === null ? '—' : formatKwh(language, summary.energyTomorrow);
      const peak = summary.peakTimeToday
        ? pick(language, {
            en: `, peak ${formatWatts(language, summary.peakPowerToday)} at ${summary.peakTimeToday}`,
            fr: `, pic de ${formatWatts(language, summary.peakPowerToday)} à ${summary.peakTimeToday}`,
            de: `, Spitze ${formatWatts(language, summary.peakPowerToday)} um ${summary.peakTimeToday}`,
            es: `, pico de ${formatWatts(language, summary.peakPowerToday)} a las ${summary.peakTimeToday}`,
          })
        : '';
      return pick(language, {
        en: `Open-Meteo OK (${place}): ${today} today${peak}, ${tomorrow} tomorrow.`,
        fr: `Open-Meteo OK (${place}) : ${today} aujourd'hui${peak}, ${tomorrow} demain.`,
        de: `Open-Meteo OK (${place}): ${today} heute${peak}, ${tomorrow} morgen.`,
        es: `Open-Meteo OK (${place}): ${today} hoy${peak}, ${tomorrow} mañana.`,
      });
    });
  });

  // --- Scene actions (Gladys 5.1+) -------------------------------------------
  for (const [key, handler] of Object.entries(createSceneActions(app))) {
    gladys.onSceneAction(key, handler);
  }

  // --- Dashboard widget (Gladys 5.1+) ----------------------------------------
  gladys.onWidgetGet(SOLAR_WIDGET, async () => buildSolarWidget(app));
  gladys.onWidgetAction(SOLAR_WIDGET, (actionKey) => handleWidgetAction(app, actionKey));

  // --- Configuration updated by the user -------------------------------------
  gladys.onConfigUpdated(async (raw) => {
    logger.info('onConfigUpdated -> new configuration received');
    app.config = normalizeConfig(raw);
    // A new threshold or installation: nobody saw anything cross yet.
    tracker.reset();
    store.invalidate();
    try {
      await refreshForecast({ fireEvent: false });
    } catch {
      // Reported in the Configuration screen.
    }
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      app.config = normalizeConfig(await gladys.getConfig());
      await gladys.publishDiscoveredDevices([buildDevice(gladys)]);
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Logs der Integration an.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
      return;
    }
    // The house may have moved while the socket was down: fetch again.
    store.invalidate();
    try {
      await refreshForecast({ fireEvent: false });
    } catch {
      // Reported in the Configuration screen; the polls retry.
    }
  });

  return app;
}
