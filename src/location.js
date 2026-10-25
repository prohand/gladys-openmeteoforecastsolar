// -----------------------------------------------------------------------------
// Where the panels are.
//
// The house configured in Gladys already knows it: the manifest declares
// `"location": true` (shown on the install screen, the home location is
// personal data) and `gladys.getHouses()` returns the coordinates. The user
// only types a latitude and a longitude to observe another place — a second
// home, panels in a field.
//
// With several houses, the `house` select of the configuration (`source:
// "houses"`, Gladys 5.2+) names the one with the panels by its selector. A
// picked house that is gone or not placed on the map is REPORTED, never
// replaced by another house: the forecast would silently describe the wrong
// roof.
// -----------------------------------------------------------------------------

/** Why nothing locates the panels, when the user picked a house. */
export const LOCATION_PROBLEMS = {
  HOUSE_NOT_FOUND: 'house_not_found',
  HOUSE_UNLOCATED: 'house_unlocated',
};

const isLocated = (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude);

/**
 * The coordinates to forecast, or `null` when nothing locates the panels.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} config normalized configuration
 * @returns {Promise<{ latitude: number, longitude: number, label: string|null }
 *   | { problem: string, house: string|null } | null>}
 *   `label` is the name of the Gladys house used, `null` for typed coordinates;
 *   `problem` (a LOCATION_PROBLEMS value) when the picked house locates nothing;
 *   `null` when no house is located at all
 */
export async function resolveSite(gladys, config) {
  if (config.latitude !== null && config.longitude !== null) {
    return { latitude: config.latitude, longitude: config.longitude, label: null };
  }
  // Sorted by name, some maybe without coordinates.
  const houses = await gladys.getHouses();
  if (config.house) {
    const picked = houses.find((candidate) => candidate.selector === config.house);
    if (!picked) {
      return { problem: LOCATION_PROBLEMS.HOUSE_NOT_FOUND, house: null };
    }
    if (!isLocated(picked)) {
      return { problem: LOCATION_PROBLEMS.HOUSE_UNLOCATED, house: picked.name };
    }
    return { latitude: picked.latitude, longitude: picked.longitude, label: picked.name };
  }
  // Nothing picked: the first located one.
  const house = houses.find(isLocated);
  if (!house) {
    return null;
  }
  return { latitude: house.latitude, longitude: house.longitude, label: house.name };
}

/**
 * What to tell the user when the house picked in the configuration locates
 * nothing, or `null` for the other cases (each caller has its own wording).
 *
 * @param {{ problem?: string|null, house?: string|null }} err a MissingLocationError
 * @returns {{ en: string, fr: string, de: string, es: string } | null}
 */
export function pickedHouseProblem(err) {
  if (err.problem === LOCATION_PROBLEMS.HOUSE_NOT_FOUND) {
    return {
      en: 'No location: the house picked in the configuration no longer exists in Gladys. Pick another one.',
      fr: "Aucune position : la maison choisie dans la configuration n'existe plus dans Gladys. Choisissez-en une autre.",
      de: 'Kein Standort: Das in der Konfiguration gewählte Haus gibt es in Gladys nicht mehr. Wähle ein anderes.',
      es: 'Sin ubicación: la casa elegida en la configuración ya no existe en Gladys. Elija otra.',
    };
  }
  if (err.problem === LOCATION_PROBLEMS.HOUSE_UNLOCATED) {
    return {
      en: `No location: the house "${err.house}" is not placed on the map in Gladys (Settings > Houses).`,
      fr: `Aucune position : la maison « ${err.house} » n'est pas placée sur la carte dans Gladys (Paramètres > Maisons).`,
      de: `Kein Standort: Das Haus „${err.house}“ ist in Gladys nicht auf der Karte platziert (Einstellungen > Zuhause).`,
      es: `Sin ubicación: la casa «${err.house}» no está situada en el mapa en Gladys (Configuración > Viviendas).`,
    };
  }
  return null;
}

/** `48.86, 2.35`: short enough for a widget row. */
export function describeCoordinates({ latitude, longitude }) {
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}
