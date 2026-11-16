// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with a value typed by hand.
//
// The zones followed, one device each: the three synchronous areas of Europe
// that publish their frequency openly (src/zones.js).
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, every text exists in all four. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** Reading intervals offered, in seconds: the sources ask for no more than one call a second. */
export const INTERVALS = ['10', '15', '30', '60'];

/** Alert thresholds offered for the scene triggers, in mHz away from 50 Hz. */
export const THRESHOLDS = ['50', '100', '150', '200', '300', '500'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Language of the feature names (frozen when a device is added) and of the
  // texts the container produces where Gladys does not say the user's
  // language (scene events, text states, action messages).
  language: 'fr',
  continental: true,
  nordic: false,
  gb: false,
  interval_seconds: '30',
  alert_threshold_mhz: '100',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  const interval = String(raw.interval_seconds ?? DEFAULT_CONFIG.interval_seconds).trim();
  const threshold = String(raw.alert_threshold_mhz ?? DEFAULT_CONFIG.alert_threshold_mhz).trim();
  const flag = (key) => (raw[key] === undefined ? DEFAULT_CONFIG[key] : toBoolean(raw[key]));
  return {
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    continental: flag('continental'),
    nordic: flag('nordic'),
    gb: flag('gb'),
    intervalMs:
      1000 * Number(INTERVALS.includes(interval) ? interval : DEFAULT_CONFIG.interval_seconds),
    thresholdMhz: Number(
      THRESHOLDS.includes(threshold) ? threshold : DEFAULT_CONFIG.alert_threshold_mhz,
    ),
  };
}

function toBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}
