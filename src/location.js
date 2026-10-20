// -----------------------------------------------------------------------------
// Where the panels are.
//
// The house configured in Gladys already knows it: the manifest declares
// `"location": true` (shown on the install screen, the home location is
// personal data) and `gladys.getHouses()` returns the coordinates. The user
// only types a latitude and a longitude to observe another place — a second
// home, panels in a field.
// -----------------------------------------------------------------------------

/**
 * The coordinates to forecast, or `null` when nothing locates the panels.
 *
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {object} config normalized configuration
 * @returns {Promise<{ latitude: number, longitude: number, label: string|null } | null>}
 *   `label` is the name of the Gladys house used, `null` for typed coordinates
 */
export async function resolveSite(gladys, config) {
  if (config.latitude !== null && config.longitude !== null) {
    return { latitude: config.latitude, longitude: config.longitude, label: null };
  }
  // Sorted by name, some maybe without coordinates: the first located one.
  const houses = await gladys.getHouses();
  const house = houses.find(
    (candidate) => Number.isFinite(candidate.latitude) && Number.isFinite(candidate.longitude),
  );
  if (!house) {
    return null;
  }
  return { latitude: house.latitude, longitude: house.longitude, label: house.name };
}

/** `48.86, 2.35`: short enough for a widget row. */
export function describeCoordinates({ latitude, longitude }) {
  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}
