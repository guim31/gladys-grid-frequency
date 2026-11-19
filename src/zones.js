// -----------------------------------------------------------------------------
// The synchronous areas followed, one device each. A zone's key is the platform
// id of its device: frozen.
//
//   sources   read in this order, the next one when the previous one fails,
//             answers nonsense or a value too old;
//   maxAgeMs  a measurement older than this is stale (Elexon publishes its
//             values about two minutes late);
//   bands     the grid state, in mHz away from 50 Hz:
//               normal   inside the standard frequency range of the area
//                        (SOGL, EU regulation 2017/1485, annex III: ±50 mHz
//                        continental, ±100 mHz Nordic, ±200 mHz Great Britain);
//               notable  outside it, reserves at work;
//               strong   beyond the point where the primary reserve is fully
//                        deployed (±200 mHz continental, ±500 mHz Nordic, the
//                        ±500 mHz statutory limit in Great Britain).
// -----------------------------------------------------------------------------

/** The nominal frequency of every European grid. */
export const NOMINAL_HZ = 50;

export const STATE = { NORMAL: 0, NOTABLE: 1, STRONG: 2 };

export const ZONES = [
  {
    key: 'continental',
    sources: ['netzfrequenzmessung', 'netzfrequenz_info'],
    maxAgeMs: 60_000,
    bands: { notable: 50, strong: 200 },
  },
  {
    key: 'nordic',
    sources: ['statnett'],
    maxAgeMs: 120_000,
    bands: { notable: 100, strong: 500 },
  },
  {
    key: 'gb',
    sources: ['elexon'],
    maxAgeMs: 10 * 60_000,
    bands: { notable: 200, strong: 500 },
  },
];

/**
 * The zones of a configuration, in a stable order.
 * @param {{ continental: boolean, nordic: boolean, gb: boolean }} config
 */
export function zonesOf(config) {
  return ZONES.filter((zone) => config[zone.key]);
}

/** 49.962 Hz → -38 mHz (rounded to the mHz: the sources give 1 mHz at best). */
export function deviationMhz(frequency) {
  return Math.round((frequency - NOMINAL_HZ) * 1000);
}

/** The grid state of a zone for a deviation, 0 normal, 1 notable, 2 strong. */
export function gridState(zone, deviation) {
  const away = Math.abs(deviation);
  if (away > zone.bands.strong) {
    return STATE.STRONG;
  }
  return away > zone.bands.notable ? STATE.NOTABLE : STATE.NORMAL;
}
