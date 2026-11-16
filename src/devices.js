// -----------------------------------------------------------------------------
// One device per zone followed (continental Europe, Nordic, Great Britain), and
// its states.
//
//   unknown/unknown     frequency, Hz, 3 decimals (Gladys has no hertz unit:
//                       the unit is in the name)
//   unknown/unknown     deviation from 50 Hz, mHz, signed, bounds symmetric so
//                       a gauge centres 0
//   risk/integer        grid state, 0 normal, 1 notable, 2 strong (src/zones.js)
//   text/text           time of the measurement ("15:19:00", Gladys time zone)
//   text/text           the source that answered
//
// Ids are built from the zone key: stable, never a label. No poll frequency:
// the container reads the sources on its own timer (src/app.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { zonesOf } from './zones.js';
import { NAMES, ZONE_NAMES, clockTime, pick } from './i18n.js';
import { SOURCES } from './sources.js';
import { deviationMhz, gridState } from './zones.js';

export const ZONE = 'zone';

/** Feature keys: frozen once published (Gladys keys history and scenes on them). */
export const FEATURES = ['frequency', 'deviation', 'state', 'measured_at', 'source'];

/** Display bounds: a European grid is cut off below 47.5 Hz and above 52.5 Hz. */
export const FREQUENCY_RANGE = { min: 47.5, max: 52.5 };
export const DEVIATION_RANGE = { min: -500, max: 500 };

export const zoneIds = (gladys, zone) => gladys.externalIds(ZONE, zone.key);

const base = { read_only: true, has_feedback: false, keep_history: true };

/**
 * The discovery payload: one device per zone.
 * @param {object} gladys
 * @param {ReturnType<import('./config.js').normalizeConfig>} config
 */
export function buildDevices(gladys, config) {
  return zonesOf(config).map((zone) => buildZoneDevice(gladys, config.language, zone));
}

function buildZoneDevice(gladys, language, zone) {
  const names = NAMES[language] ?? NAMES.fr;
  const ids = zoneIds(gladys, zone);
  const feature = (key, definition) => ({
    ...base,
    ...definition,
    name: names[key],
    external_id: ids.feature(key),
  });
  const unknown = (key, range) =>
    feature(key, {
      category: DEVICE_FEATURE_CATEGORIES.UNKNOWN,
      type: DEVICE_FEATURE_TYPES.UNKNOWN.UNKNOWN,
      ...range,
    });
  const text = (key) =>
    feature(key, {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      min: 0,
      max: 0,
      keep_history: false,
    });
  return {
    name: `${names.device} ${pick(ZONE_NAMES[zone.key], language)}`,
    external_id: ids.device,
    should_poll: false,
    features: [
      unknown('frequency', FREQUENCY_RANGE),
      unknown('deviation', DEVIATION_RANGE),
      feature('state', {
        category: DEVICE_FEATURE_CATEGORIES.RISK,
        type: DEVICE_FEATURE_TYPES.RISK.INTEGER,
        min: 0,
        max: 2,
      }),
      text('measured_at'),
      text('source'),
    ],
  };
}

/**
 * The states of a zone from its latest reading.
 * @param {object} gladys
 * @param {object} zone
 * @param {{ frequency: number, measuredAt: number, source: string } | null} reading
 * @param {string} [timeZone]
 */
export function zoneStates(gladys, zone, reading, timeZone) {
  if (!reading) {
    return [];
  }
  const ids = zoneIds(gladys, zone);
  const state = (key, value) => ({ device_feature_external_id: ids.feature(key), state: value });
  const text = (key, value) => ({ device_feature_external_id: ids.feature(key), text: value });
  const deviation = deviationMhz(reading.frequency);
  return [
    state('frequency', Math.round(reading.frequency * 1000) / 1000),
    state('deviation', deviation),
    state('state', gridState(zone, deviation)),
    text('measured_at', clockTime(reading.measuredAt, timeZone)),
    text('source', SOURCES[reading.source].name),
  ];
}
