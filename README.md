# Open-Meteo Forecast Solar for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that forecasts the
production of your solar panels, from the free [Open-Meteo](https://open-meteo.com) weather
API: no account, no API key.

- **Cloud** integration (Open-Meteo is reached over the internet), Gladys **5.1.0** or later.
- Languages: English, French, German, Spanish.
- User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
  [Deutsch](docs/de.md) · [Español](docs/es.md).

## What you get

| Surface                     | What it does                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Device **Solar forecast**   | Estimated power now, over the next hour and at the peak of the day; estimated production today, left today and tomorrow.      |
| Scene trigger               | **Estimated production crosses the threshold** (going up or down) — start the washing machine when the sun is there.          |
| Scene trigger               | **Solar forecast updated** — with today's and tomorrow's production as variables.                                             |
| Scene action                | **Get the solar forecast** — the figures, as outputs for the following actions (a message, a condition).                      |
| Scene action                | **Find the sunniest time slot** — the best window of a given length today or tomorrow, to run an appliance on your own power. |
| Dashboard widget            | **Solar forecast** — live tiles, the production curve of today and tomorrow with the peak, a refresh button.                  |
| Configuration screen button | **Test the forecast** — calls Open-Meteo and shows today's and tomorrow's production.                                         |

## How the estimate works

Open-Meteo gives, every 15 minutes, the sunlight received by a plane with the tilt and the
orientation of your panels (`global_tilted_irradiance`) and the air temperature. The
integration turns them into watts:

```
power = irradiance / 1000 W/m² × peak power × (1 − system losses) × temperature correction
```

The temperature correction follows the usual model for crystalline silicon: the cells run
hotter than the air the more sun they get, and lose about 0.4 % of power per degree above
25 °C. It is an estimate: shading, snow and your inverter's own curve are out of reach of a
weather forecast. Adjust the system losses if your real production differs.

The location of your Gladys house is used by default (the integration asks for it at
install, manifest `"location": true`). Coordinates typed in the configuration override it.

## Project structure

```
.
├─ index.js                          # SDK bootstrap (no logic)
├─ src/
│  ├─ app.js                         # every handler: poll, actions, scenes, widget, config
│  ├─ config.js                      # defaults + normalization
│  ├─ openMeteo.js                   # the Open-Meteo call
│  ├─ solar.js                       # PV model, daily figures, best window (pure)
│  ├─ forecastStore.js               # forecast in memory + refresh policy
│  ├─ location.js                    # Gladys house or typed coordinates
│  ├─ device.js                      # the device and its states
│  ├─ format.js / i18n.js            # numbers and texts in four languages
│  └─ capabilities/                  # scene triggers, scene actions, widget (Gladys 5.1+)
├─ docs/                             # user documentation (en, fr, de, es), re-hosted by Gladys
├─ test/                             # node --test, fake Gladys + fake Open-Meteo
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for contributors and coding assistants
├─ SECURITY.md                       # how to report a vulnerability privately
└─ .github/
   ├─ workflows/ci.yml               # format, lint, tests (Node 22 + 24), store checks, Docker build
   ├─ workflows/release.yml          # UI-driven release: bump + changelog + tag + build
   ├─ workflows/build.yml            # multi-arch image (amd64 + arm64) to ghcr.io
   ├─ workflows/github-release.yml   # GitHub Release of every version tag
   ├─ scripts/changelog-release.mjs  # rolls CHANGELOG.md during a release
   └─ dependabot.yml                 # npm, GitHub Actions and Docker updates
```

## Development

```bash
npm install
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test: no network, fake Gladys and fake Open-Meteo
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="open-meteo-forecast-solar" \
LOG_LEVEL=debug \
npm start
```

Check the store rules locally before a release:

```bash
npx github:GladysAssistant/integration-store --skip-image-check .
```

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps the version everywhere, rolls the changelog, tags `vX.Y.Z`, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io/prohand/gladys-openmeteoforecastsolar`
(`:X.Y.Z` and `:latest`) and publishes the GitHub Release. The store indexer picks up the new
manifest version and Gladys offers the update.

The repository needs the GitHub topic `gladys-assistant-integration`, a public `ghcr.io`
package, and **Private vulnerability reporting** turned on (see [`SECURITY.md`](SECURITY.md)).

## Credits

Weather data by [Open-Meteo.com](https://open-meteo.com/), under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The free API is for non-commercial
use.

## License

Apache-2.0
