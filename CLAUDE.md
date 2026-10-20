# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors when
working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) that forecasts the production of a set of solar
panels from the free **Open-Meteo** API (no account, no API key). It started from the official
JavaScript template (`GladysAssistant/integration-template-js`); its workflows follow
`prohand/gladys-devmel`.

One device ("Solar forecast") with read-only features, two scene triggers, two scene actions,
one dashboard widget and one Configuration-screen action. Cloud only (manifest
`"transports": ["cloud"]`). Gladys 5.1+.

## Commands

```bash
npm install
npm test                                     # node --test (built-in runner)
node --test test/solar.test.js               # one file
node --test --test-name-pattern "threshold"  # tests whose name matches
npm run lint                                 # eslint .
npm run format:check                         # prettier --check . (CI gate)
npm run format                               # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24; pull requests also run the store
checks and build the Docker image. Run the three commands before pushing.

Releases: **Actions → Release** only (bumps `package.json`, `package-lock.json`, manifest
`version` + `docker_image`, re-runs Prettier, rolls `CHANGELOG.md`, tags, builds the multi-arch
image, publishes the GitHub Release).

## Architecture

```
index.js                    SDK bootstrap only: new GladysIntegration, createApp, connect
src/app.js                  every handler (poll, actions, scenes, widget, config, connection)
src/config.js               DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/openMeteo.js            the HTTP call: URL, compass -> Open-Meteo azimuth, parsing
src/solar.js                pure PV model and figures: power, energy, peak, best window
src/forecastStore.js        forecast in memory, refresh interval, retry delay after a failure
src/location.js             coordinates: typed in the config, or the first located Gladys house
src/device.js               the device payload (external ids, features) and its states
src/format.js               numbers and compass points per language
src/i18n.js                 LANGUAGES = en, fr, de, es; pick / localize
src/capabilities/triggers.js   scene triggers: threshold tracker, forecast_updated data
src/capabilities/scenes.js     scene actions: get_forecast, find_best_window
src/capabilities/widget.js     dashboard widget content + refresh button
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md       user documentation, re-hosted by Gladys
test/                       node --test, against the SDK's fake Gladys + a fake Open-Meteo
.github/scripts/changelog-release.mjs   rolls CHANGELOG.md during a release (tested)
```

### Invariants worth knowing

- **External ids are forever.** The device is `gladys.externalIds('solar-forecast',
'installation')`: a fixed platform id, never a coordinate or a config value, so moving or
  resizing the panels updates the same device. Feature keys (`FEATURES` in `src/device.js`),
  manifest `config_schema` / `actions` keys, trigger, scene action and widget keys are stored by
  users: never rename them.
- **A forecast is not a meter.** Features use `energy-production-sensor` with the `power` and
  `daily-production` types only. Never `index` nor `thirty-minutes-production`: the Gladys
  energy monitoring reads those as real metered production.
- **Open-Meteo 15-minute radiation is the mean of the 15 minutes BEFORE its timestamp**: a
  slot is `[time - 15 min, time)`. Days are cut at the site's local midnight
  (`timezone=auto`, `utc_offset_seconds`), times are UNIX seconds (`timeformat=unixtime`).
- **Orientation**: users type compass degrees (180 = south); Open-Meteo wants 0 = south,
  -90 = east, 90 = west (`toOpenMeteoAzimuth`).
- **Polling**: the device is published with `should_poll: true` and `poll_frequency` =
  `DEVICE_POLL_FREQUENCIES.EVERY_MINUTES` (ms enum; any other value rejects the WHOLE discovery
  batch). Each poll recomputes "now" from the forecast in memory; Open-Meteo is only called
  when the forecast is older than `refresh_interval` (15 min minimum), or after a config
  change or a reconnection. A failed call keeps the old forecast and waits 5 minutes.
- **States** go through `publishChangedStates` with a 30-minute heartbeat (300 states/minute
  host limit). A figure the forecast does not cover is left out, never published as 0.
- **Scene events**: one `production_threshold` event per crossing (the first reading after a
  start or a threshold change only sets the side); `forecast_updated` fires on the scheduled
  refreshes only. Never fire an event as a consequence of a scene action, a widget button or a
  manifest action: a scene bound to it could loop.
- **Scene actions are never conditions**: "no forecast" is an output (`available: false`,
  `found: false`), not a thrown error.
- **Location is personal data**: the coordinates are never logged above `debug`.
- **Transport badge**: `cloud` when the last call worked, `cloud` + `degraded` while an older
  forecast is shown, `unreachable` when there is none.
- **The container rootfs is read-only.** Nothing is written; `/data` is the only writable path.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or in the
  manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version
  heading: the Release workflow moves the section.
- **Four languages.** Every user-facing text is `{ en, fr, de, es }`: manifest labels,
  descriptions and placeholders, action and toast messages, connection status, widget texts.
  English first (the fallback), German informal ("du"), French and Spanish formal
  ("vous", "usted"). The user docs `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md` are
  kept in sync. `test/manifest.test.js` and `test/widget.test.js` check the four keys.
- **Manifest.** `test/manifest.test.js` ties it to the code (defaults, actions, scene actions,
  triggers, widget): change both sides together. The catalog `description` holds 10 to 100
  characters per language; widget labels 3 to 30.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
  Tests never touch the network (fake Open-Meteo in `test/helpers/fakeOpenMeteo.js`, clock
  passed in as `now`).
