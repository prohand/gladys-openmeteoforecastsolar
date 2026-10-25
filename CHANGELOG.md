# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.0] - 2026-10-25

### Added

- **House** field: with several Gladys houses, pick the one where the panels are (empty: the
  first house placed on the map, as before). A picked house that was deleted or is not on the
  map is reported, never replaced by another one.
- Search keywords in the store catalog (photovoltaic, kWp, irradiance…).

### Changed

- Requires Gladys 5.3.0 or later (catalog keywords, house picker).
- Gladys integration SDK 0.16.
- The release workflow runs the full store admission check once the image is published.

## [0.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [0.0.1] - 2026-10-20

### Added

- Solar production forecast of one installation (peak power, tilt, orientation,
  system losses) from the free Open-Meteo API: no account, no API key.
- A "Solar forecast" device: estimated power now, over the next hour and at the
  peak of the day, estimated production today, left today and tomorrow.
- The location of the Gladys house is used by default; coordinates typed in the
  configuration override it.
- Scene triggers (Gladys 5.1+): "Estimated production crosses the threshold"
  (going up or down) and "Solar forecast updated".
- Scene actions (Gladys 5.1+): "Get the solar forecast" and "Find the sunniest
  time slot", to run an appliance on your own production.
- A "Solar forecast" dashboard widget (Gladys 5.1+): live tiles, the production
  curve of today and tomorrow, the peak, and a refresh button.
- A "Test the forecast" button in the configuration screen.
- Cloud transport badge on the device, degraded while an older forecast is
  shown because Open-Meteo cannot be reached.
- English, French, German and Spanish texts and documentation.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build),
  UI-driven release workflow, GitHub Releases and Dependabot.

[Unreleased]: https://github.com/prohand/gladys-openmeteoforecastsolar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/prohand/gladys-openmeteoforecastsolar/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/prohand/gladys-openmeteoforecastsolar/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/prohand/gladys-openmeteoforecastsolar/releases/tag/v0.0.1
