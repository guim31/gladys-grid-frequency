# Grid Frequency

The frequency of the European power grids in real time: continental Europe,
the Nordic area and Great Britain. Every grid in Europe runs at 50 Hz; the
frequency drops a little when consumption exceeds production and rises when
production exceeds consumption. It is the pulse of the grid, the same value
in every socket of a synchronous area. Read from open sources, without an
account or a key: netzfrequenzmessung.de and netzfrequenz.info (continental
Europe), Statnett (Nordic area) and Elexon (Great Britain). This integration
is not affiliated with any of them.

## Overview

For every zone you follow, the integration adds a device with:

- the **frequency**, in Hz, to the thousandth;
- the **deviation from 50 Hz**, in mHz (−38 means 49.962 Hz);
- the **grid state**: 0 normal, 1 notable deviation, 2 strong deviation (see
  "Grid states" below);
- the **time of the measurement** and the **source** that gave it.

On top of that: a dashboard widget with the last hour, and two scene
triggers, "Frequency beyond the threshold" and "Frequency back to normal".
What for: watching the grid as a hobby, explaining it to the family, or
postponing a big consumption while the grid is short.

## Requirements

- Gladys Assistant 5.2.0 or later.
- Internet access from Gladys. No account, no key.

## Installation

In Gladys, **Integrations → Install from GitHub**, address
`https://github.com/guim31/gladys-grid-frequency`. Then open the
**Configuration** tab of the integration, choose your zones and save. The
devices appear in the **Discovery** tab: add them.

## Configuration

- **Language of the names**: language of the device and feature names (fixed
  when a device is added) and of the texts sent to scenes. French by default.
- **Continental Europe**, **Nordic area**, **Great Britain**: one device per
  zone ticked. Continental Europe goes from Portugal to Poland and Greece,
  France and Germany included. The Nordic area is Norway, Sweden, Finland and
  eastern Denmark. Western Denmark is part of continental Europe; Ireland and
  the Baltic states are not covered.
- **Reading interval**: 10, 15, 30 (default) or 60 seconds. Each reading can
  publish new states, kept in the history of Gladys.
- **Alert threshold**: the deviation from 50 Hz, in mHz, that fires the scene
  trigger: ±50, ±100 (default), ±150, ±200, ±300 or ±500 mHz.

### Test the sources button

Reads every source of every zone, the fallback ones too, and says what each
answered. The message is red when a zone has no source answering.

## Devices

### Grid frequency (one per zone)

| Feature                    | Values                                       |
| -------------------------- | -------------------------------------------- |
| Frequency (Hz)             | 47.5 to 52.5, three decimals                 |
| Deviation from 50 Hz (mHz) | signed, −500 to +500 shown on a gauge        |
| Grid state (0 to 2)        | 0 normal, 1 notable, 2 strong                |
| Measurement time           | "16:19:00", in the time zone of Gladys       |
| Source                     | netzfrequenzmessung.de, netzfrequenz.info, … |

Gladys has no hertz unit: the unit is in the name of the feature. The states
are published only when they change, and at least every six hours.

## Grid states

The thresholds come from the European rules for grid operation (SOGL, EU
regulation 2017/1485) and from the British grid code:

| Zone               | Normal        | Notable        | Strong       |
| ------------------ | ------------- | -------------- | ------------ |
| Continental Europe | up to 50 mHz  | 50 to 200 mHz  | over 200 mHz |
| Nordic area        | up to 100 mHz | 100 to 500 mHz | over 500 mHz |
| Great Britain      | up to 200 mHz | 200 to 500 mHz | over 500 mHz |

"Normal" is the standard frequency range of the area. Beyond it, the
reserves are at work; beyond "strong", the primary reserve of the continent
is fully deployed (or, in Great Britain, the statutory limit is crossed).
For reference on the continent: within ±10 to ±20 mHz the reserves do not
even react; 49.8 Hz triggers the emergency plans of the operators; 49 Hz
starts automatic load shedding. Great Britain and the Nordic area, smaller
grids, move more: ±100 mHz is an everyday value there.

## Widget

**Grid frequency**: the name of the zone's device, the frequency and the
deviation (green, orange or red after the grid state), the frequency of the
last hour from the history of Gladys (once the device is added), the grid
state, the source and the time of the measurement. Settings: the zone, and
two switches to hide the chart or the state and source.

## Scenes

### Frequency beyond the threshold (trigger)

The deviation of a zone goes beyond the alert threshold of the
configuration. Once per excursion. Filters: the zone, the direction (under
50 Hz: shortage; over 50 Hz: surplus). Variables: direction (`low`, `high`),
frequency (Hz), deviation (mHz), threshold (mHz), grid state as a word, zone.

### Frequency back to normal (trigger)

After an excursion, the deviation falls back under 80 % of the threshold (the
margin avoids a burst of events when the value hovers at the threshold).
Filter: the zone. Variables: frequency, deviation, peak deviation (mHz),
duration of the excursion (seconds), zone.

## Scene examples

- "Frequency beyond the threshold", direction under 50 Hz → turn off the
  water heater; "Frequency back to normal" → turn it back on.
- "Frequency beyond the threshold" → send a message with the frequency and the
  deviation, taken from the variables of the trigger.
- A device-value trigger on "Grid state" equal to 2 → notification.

## Sources and terms of use

| Zone               | Source                                            | Pace                    |
| ------------------ | ------------------------------------------------- | ----------------------- |
| Continental Europe | netzfrequenzmessung.de, interface for private use | value every 3 s         |
| Continental Europe | netzfrequenz.info, fallback                       | value every second      |
| Nordic area        | Statnett, operational data                        | value every 10 s        |
| Great Britain      | Elexon BMRS, system frequency (FREQ)              | every 15 s, ~2 min late |

The second continental source is asked only when the first fails, answers
something implausible or a value older than a minute. In normal operation, the
integration asks each source at most once per interval (10 s at least), far below the "once a
second" netzfrequenzmessung.de allows. Its interface is meant for private
use: a home automation system is one. Elexon data is published under the
Elexon BMRS data licence.

## Limits

- The continental value is measured in Germany: it is the same in France,
  Spain or Italy (one synchronous grid), up to a few mHz during fast events.
- A reading every 10 seconds at best: a short dip of one or two seconds can be
  missed.
- Great Britain is about two minutes late: no trigger there for a fast
  reaction.
- One source per zone for the Nordic area and Great Britain: no fallback.
- The open sources give no guarantee of service.

## Troubleshooting

- **"No source answers"** in the configuration screen: use the "Test the
  sources" button; the message names each source and its error. A source
  down is usually back within minutes.
- **No state on a device**: check that it is added (Discovery tab).
- **Too many events**: raise the alert threshold; ±100 mHz is rare on the
  continent but common in Great Britain.
- For details: `LOG_LEVEL=debug` in the logs of the integration.

## Credits

Data: [netzfrequenzmessung.de](https://www.netzfrequenzmessung.de),
[netzfrequenz.info](https://www.netzfrequenz.info),
[Statnett](https://driftsdata.statnett.no) and
[Elexon BMRS](https://bmrs.elexon.co.uk). Integration by guim31, Apache-2.0.
