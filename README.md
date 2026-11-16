# Grid Frequency for Gladys Assistant

The real-time frequency of the European power grids in
[Gladys Assistant](https://gladysassistant.com): continental Europe, the Nordic
area and Great Britain. Every European grid runs at 50 Hz; the frequency
drops when consumption exceeds production and rises when production exceeds
consumption. Read from open sources, without account or key.

Not affiliated with netzfrequenzmessung.de, netzfrequenz.info, Statnett,
Elexon, NESO or ENTSO-E.

## Features

- One device per zone followed: **frequency** (Hz, three decimals),
  **deviation from 50 Hz** (mHz), **grid state** (0 normal, 1 notable, 2
  strong, after the European SOGL and British thresholds), **time of the
  measurement** and **source**.
- Continental Europe from **netzfrequenzmessung.de**, with
  **netzfrequenz.info** as a fallback; the Nordic area from **Statnett**;
  Great Britain from **Elexon BMRS** (system frequency `FREQ`).
- A reading every 10, 15, 30 or 60 seconds, on the container's own timer; only
  the states that changed are published.
- A **"Grid frequency" dashboard widget**: frequency, deviation, the last hour
  from the history of Gladys, grid state and source.
- **Scene triggers** "Frequency beyond the threshold" (threshold from ±50 to
  ±500 mHz, direction under or over 50 Hz) and "Frequency back to normal"
  (with the peak and the duration of the excursion).
- A **"Test the sources"** button that tries every source, fallbacks
  included.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.2.0 or later.
- Internet access from Gladys.

## Installation

In Gladys: **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-grid-frequency`. Choose your zones in the
**Configuration** tab, then add the devices from the **Discovery** tab.

The full documentation, in four languages, is in [`docs/`](docs/en.md).

## How it works

| Zone               | Source                                                                            | Pace                    |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------- |
| Continental Europe | [netzfrequenzmessung.de](https://www.netzfrequenzmessung.de) XML interface        | every 3 s               |
| Continental Europe | [netzfrequenz.info](https://www.netzfrequenz.info) live JSON, fallback only       | every second            |
| Nordic area        | [Statnett operational data](https://driftsdata.statnett.no), `Frequency/BySecond` | every 10 s              |
| Great Britain      | [Elexon BMRS](https://bmrs.elexon.co.uk) dataset `FREQ`                           | every 15 s, ~2 min late |

A zone tries its sources in order: the next one when the previous one fails,
answers an implausible value (outside 45–55 Hz) or a measurement too old (one
minute on the continent, two in the Nordic area, ten in Great Britain). In normal operation, each source is asked at most once per interval, never more than once every ten
seconds. The integration stores nothing.

Gladys has no hertz unit: the frequency and the deviation are `unknown`
features with the unit in their name; the grid state is a `risk` feature
(0 to 2).

## Checked, and what was not

- The four readers were run against the real sources on 16/11/2026; their
  answers of that day are the test fixtures.
- The Docker image was started with the Gladys sandbox constraints
  (read-only rootfs, all capabilities dropped, 256 MB) and read the four
  sources from inside the container.
- The whole integration runs in the tests against the SDK's fake Gladys.
- Not checked on a real Gladys instance: the look of the widget and of the
  device features in the interface.

## Limitations

- The continental value is measured in Germany; it is the same everywhere on
  the synchronous grid, up to a few mHz during fast events.
- A reading every 10 seconds at best: a dip of one or two seconds can be
  missed.
- Great Britain is about two minutes late.
- One source only for the Nordic area and Great Britain.
- Open sources, with no guarantee of service. netzfrequenzmessung.de offers
  its interface for private use.

## See also

- [gladys-carbon-intensity-uk](https://github.com/guim31/gladys-carbon-intensity-uk):
  the carbon intensity of British electricity.
- [gladys-rte](https://github.com/guim31/gladys-rte): Tempo, EcoWatt and the
  French grid from RTE.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules. Versions, images and
releases belong to the Release workflow (Actions → Release).

## Credits

- Frequency data: [netzfrequenzmessung.de](https://www.netzfrequenzmessung.de),
  [netzfrequenz.info](https://www.netzfrequenz.info),
  [Statnett](https://www.statnett.no) and [Elexon](https://www.elexon.co.uk)
  (BMRS data licence).
- Thresholds: ENTSO-E System Operation Guideline (EU regulation 2017/1485) and
  the GB Grid Code.
- Built on the
  [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js)
  and its JavaScript template.

## Disclaimer

For information only: do not base safety decisions on this integration.

## License

[Apache-2.0](LICENSE)
