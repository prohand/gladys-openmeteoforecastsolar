// -----------------------------------------------------------------------------
// Dashboard widget (Gladys 5.1+): the forecast at a glance.
//
// Three LIVE tiles bound to the device features (they follow the published
// states, nothing to refresh), the production curve of today and tomorrow —
// data the core keeps no history of, so it travels as an inline series —, a
// status list (what is left today, the peak, the installation, the last
// update) and a button to call Open-Meteo now.
//
// The content is declarative, the core renders it with its own theme: see the
// "Dashboard widgets" section of the SDK README for the vocabulary and the
// budget (8 components, 1 focal, 6 tiles, 1 status list, 4 buttons).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { deviceIds, FEATURES } from '../device.js';
import { describeCoordinates } from '../location.js';
import { describeInstallation, formatKwh, formatWatts } from '../format.js';
import { localize } from '../i18n.js';
import { MissingLocationError } from '../forecastStore.js';
import { localTime, slotsOfDay, startOfLocalDay, summarize } from '../solar.js';

const logger = createLogger({ name: 'widget' });

/** Key of the manifest widget. Never renamed: dashboards store it. */
export const SOLAR_WIDGET = 'solar_forecast';

/** Keys of the `button` actions of the content. */
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };

// Computed parts only change with a new forecast, and src/app.js nudges the
// widget after each one: the TTL is a safety net.
const TTL_SECONDS = 900;

const DAY_MS = 24 * 60 * 60 * 1000;

const texts = {
  now: { en: 'Now', fr: 'Maintenant', de: 'Jetzt', es: 'Ahora' },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  chartTitle: {
    en: 'Estimated production',
    fr: 'Production estimée',
    de: 'Geschätzte Erzeugung',
    es: 'Producción estimada',
  },
  series: { en: 'Forecast', fr: 'Prévision', de: 'Prognose', es: 'Previsión' },
  peak: { en: 'Peak', fr: 'Pic', de: 'Spitze', es: 'Pico' },
  left: {
    en: 'Left today',
    fr: "Reste aujourd'hui",
    de: 'Rest heute',
    es: 'Resto de hoy',
  },
  peakToday: {
    en: 'Peak today',
    fr: "Pic aujourd'hui",
    de: 'Spitze heute',
    es: 'Pico de hoy',
  },
  installation: { en: 'Panels', fr: 'Panneaux', de: 'Module', es: 'Paneles' },
  location: { en: 'Location', fr: 'Position', de: 'Standort', es: 'Ubicación' },
  updated: { en: 'Updated', fr: 'Mis à jour', de: 'Aktualisiert', es: 'Actualizado' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  noLocation: {
    en: 'No location yet: set the location of your house in Gladys, or type coordinates in the integration configuration.',
    fr: "Pas encore de position : renseignez la position de votre maison dans Gladys, ou saisissez des coordonnées dans la configuration de l'intégration.",
    de: 'Noch kein Standort: Lege den Standort deines Hauses in Gladys fest oder gib Koordinaten in der Konfiguration der Integration ein.',
    es: 'Aún no hay ubicación: indique la ubicación de su casa en Gladys o escriba unas coordenadas en la configuración de la integración.',
  },
  noForecast: {
    en: 'No forecast yet: Open-Meteo could not be reached. Try again in a few minutes.',
    fr: "Pas encore de prévision : Open-Meteo n'a pas pu être joint. Réessayez dans quelques minutes.",
    de: 'Noch keine Prognose: Open-Meteo war nicht erreichbar. Versuche es in ein paar Minuten erneut.',
    es: 'Aún no hay previsión: no se pudo contactar con Open-Meteo. Vuelva a intentarlo en unos minutos.',
  },
};

/**
 * The content of the widget.
 *
 * @param {object} app the state src/app.js shares: gladys, store, config, now
 */
export function buildSolarWidget(app) {
  const { gladys, store, config } = app;
  const ids = deviceIds(gladys);
  const refreshButton = {
    type: 'button',
    label: texts.refresh,
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: WIDGET_ACTIONS.REFRESH },
  };

  const forecast = store.forecast;
  if (!forecast) {
    const missing = store.lastError instanceof MissingLocationError;
    return {
      ttl_seconds: 60,
      components: [
        { type: 'text', text: missing ? texts.noLocation : texts.noForecast },
        refreshButton,
      ],
    };
  }

  const now = app.now();
  const summary = summarize(forecast, now);
  const today = startOfLocalDay(forecast, now);
  const points = [...slotsOfDay(forecast, today), ...slotsOfDay(forecast, today + DAY_MS)].map(
    (slot) => ({ t: new Date(slot.start).toISOString(), v: slot.power }),
  );
  const peak = slotsOfDay(forecast, today).reduce(
    (best, slot) => (slot.power > 0 && (!best || slot.power > best.power) ? slot : best),
    null,
  );

  return {
    ttl_seconds: TTL_SECONDS,
    components: [
      {
        type: 'value',
        label: texts.now,
        icon: 'sun',
        device_feature: ids.feature(FEATURES.POWER_NOW),
      },
      {
        type: 'value',
        label: texts.today,
        icon: 'battery-charging',
        device_feature: ids.feature(FEATURES.ENERGY_TODAY),
      },
      {
        type: 'value',
        label: texts.tomorrow,
        icon: 'sunrise',
        device_feature: ids.feature(FEATURES.ENERGY_TOMORROW),
      },
      {
        type: 'chart',
        chart_type: 'area',
        title: texts.chartTitle,
        unit: 'W',
        series: [{ name: texts.series, points }],
        now_marker: true,
        annotations: peak
          ? [
              {
                t: new Date(peak.start).toISOString(),
                value: peak.power,
                label: texts.peak,
                color: WIDGET_COLORS.WARNING,
              },
            ]
          : [],
      },
      {
        type: 'status',
        items: [
          {
            label: texts.left,
            icon: 'clock',
            value: localize((language) => formatKwh(language, summary.energyRemainingToday)),
            color: summary.energyRemainingToday > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: texts.peakToday,
            icon: 'trending-up',
            value: summary.peakTimeToday
              ? localize(
                  (language) =>
                    `${formatWatts(language, summary.peakPowerToday)}, ${summary.peakTimeToday}`,
                )
              : '—',
            color: WIDGET_COLORS.NEUTRAL,
          },
          {
            label: texts.installation,
            icon: 'grid',
            value: describeInstallation(config),
            color: WIDGET_COLORS.NEUTRAL,
          },
          {
            label: texts.location,
            icon: 'map-pin',
            value: forecast.site.label ?? describeCoordinates(forecast.site),
            color: WIDGET_COLORS.NEUTRAL,
          },
          {
            label: texts.updated,
            icon: 'cloud',
            value: localTime(forecast, forecast.fetchedAt),
            // A failed refresh leaves an older forecast on screen: say so.
            color: store.lastError ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
          },
        ],
      },
      refreshButton,
    ],
  };
}

/** The toast of a tapped button. */
export async function handleWidgetAction(app, actionKey) {
  logger.info(`onWidgetAction <- ${SOLAR_WIDGET}.${actionKey}`);
  if (actionKey !== WIDGET_ACTIONS.REFRESH) {
    // Throwing acks the action as failed: the message reaches the user.
    throw new Error(`Unknown widget action: ${actionKey}`);
  }
  try {
    await app.refreshForecast({ fireEvent: false });
  } catch {
    return {
      en: 'Open-Meteo could not be reached.',
      fr: "Open-Meteo n'a pas pu être joint.",
      de: 'Open-Meteo war nicht erreichbar.',
      es: 'No se pudo contactar con Open-Meteo.',
    };
  }
  return {
    en: 'Forecast updated.',
    fr: 'Prévision mise à jour.',
    de: 'Prognose aktualisiert.',
    es: 'Previsión actualizada.',
  };
}
