// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations. Source names are brands: never translated.
//
//   - NAMES    : device and feature names, written once in the language of
//                the configuration (Gladys freezes them when a device is added);
//   - TEXT     : the fixed texts (widget, configuration screen, actions);
//   - MESSAGES : the texts built from a value.
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages, with no empty text and no polite German.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

export { LANGUAGES };

/** A multi-language object → the text of one language (English as fallback). */
export function pick(text, language) {
  return text[language] ?? text.en;
}

/** One multi-language object from a function of the language. */
export function each(build) {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, build(lang)]));
}

/** Device and feature names, by language then key. */
export const NAMES = {
  en: {
    device: 'Grid frequency',
    frequency: 'Frequency (Hz)',
    deviation: 'Deviation from 50 Hz (mHz)',
    state: 'Grid state (0 to 2)',
    measured_at: 'Measurement time',
    source: 'Source',
  },
  fr: {
    device: 'Fréquence du réseau',
    frequency: 'Fréquence (Hz)',
    deviation: 'Écart à 50 Hz (mHz)',
    state: 'État du réseau (0 à 2)',
    measured_at: 'Heure de la mesure',
    source: 'Source',
  },
  de: {
    device: 'Netzfrequenz',
    frequency: 'Frequenz (Hz)',
    deviation: 'Abweichung von 50 Hz (mHz)',
    state: 'Netzzustand (0 bis 2)',
    measured_at: 'Messzeitpunkt',
    source: 'Quelle',
  },
  es: {
    device: 'Frecuencia de la red',
    frequency: 'Frecuencia (Hz)',
    deviation: 'Desviación de 50 Hz (mHz)',
    state: 'Estado de la red (0 a 2)',
    measured_at: 'Hora de la medición',
    source: 'Fuente',
  },
};

export const ZONE_NAMES = {
  continental: {
    en: 'Continental Europe',
    fr: 'Europe continentale',
    de: 'Kontinentaleuropa',
    es: 'Europa continental',
  },
  nordic: { en: 'Nordic', fr: 'Nordique', de: 'Nordeuropa', es: 'Nórdica' },
  gb: { en: 'Great Britain', fr: 'Grande-Bretagne', de: 'Großbritannien', es: 'Gran Bretaña' },
};

/** The grid states, as words: widget tiles and scene variables (12 characters at most). */
export const STATE_TEXT = {
  0: { en: 'Normal', fr: 'Normal', de: 'Normal', es: 'Normal' },
  1: { en: 'Notable', fr: 'Notable', de: 'Deutlich', es: 'Notable' },
  2: { en: 'Strong', fr: 'Fort', de: 'Stark', es: 'Fuerte' },
};

export const TEXT = {
  frequency: { en: 'Frequency', fr: 'Fréquence', de: 'Frequenz', es: 'Frecuencia' },
  deviation: { en: 'Deviation', fr: 'Écart', de: 'Abweichung', es: 'Desviación' },
  state: { en: 'Grid state', fr: 'État du réseau', de: 'Netzzustand', es: 'Estado de la red' },
  source: { en: 'Source', fr: 'Source', de: 'Quelle', es: 'Fuente' },
  chart: {
    en: 'Frequency, last hour',
    fr: 'Fréquence, dernière heure',
    de: 'Frequenz, letzte Stunde',
    es: 'Frecuencia, última hora',
  },
  noZone: {
    en: 'No zone selected: tick at least one grid in the configuration.',
    fr: 'Aucune zone choisie : cochez au moins un réseau dans la configuration.',
    de: 'Keine Zone gewählt: Kreuze in der Konfiguration mindestens ein Netz an.',
    es: 'Ninguna zona elegida: marque al menos una red en la configuración.',
  },
  noDevice: {
    en: 'Choose a zone in the widget settings.',
    fr: 'Choisissez une zone dans les réglages du widget.',
    de: 'Wähle eine Zone in den Widget-Einstellungen.',
    es: 'Elija una zona en los ajustes del widget.',
  },
  waiting: {
    en: 'Waiting for the first measurement…',
    fr: 'En attente de la première mesure…',
    de: 'Warte auf die erste Messung …',
    es: 'Esperando la primera medición…',
  },
  unreachable: {
    en: 'No source answers for this zone right now.',
    fr: 'Aucune source ne répond pour cette zone en ce moment.',
    de: 'Für diese Zone antwortet gerade keine Quelle.',
    es: 'Ninguna fuente responde para esta zona en este momento.',
  },
  initFailed: {
    en: 'Initialization failed: see the integration logs.',
    fr: "L'initialisation a échoué : voir les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen: siehe die Protokolle der Integration.',
    es: 'La inicialización falló: consulte los registros de la integración.',
  },
};

const SEPARATOR = { en: '; ', fr: ' ; ', de: '; ', es: '; ' };

/** 50.012 → "50.012" in English, "50,012" in French, German and Spanish. */
export function formatHz(value, language) {
  const text = value.toFixed(3);
  return language === 'en' ? text : text.replace('.', ',');
}

/** -38 → "−38", 12 → "+12": the sign always shown. */
export function signed(value) {
  return value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0';
}

export const MESSAGES = {
  /** Action: a zone answered. `fallback` names the sources that did not. */
  zoneOk: (zone, frequency, source, down) =>
    each((lang) => {
      const base = `${pick(zone, lang)} ${formatHz(frequency, lang)} Hz (${source})`;
      if (down.length === 0) {
        return base;
      }
      const label = { en: 'down', fr: 'hors service', de: 'gestört', es: 'sin respuesta' }[lang];
      return `${base}, ${down.join(', ')} ${label}`;
    }),
  /** Action: no source of a zone answered. */
  zoneDown: (zone, sources) =>
    each((lang) => {
      const label = {
        en: 'no answer from',
        fr: 'aucune réponse de',
        de: 'keine Antwort von',
        es: 'sin respuesta de',
      }[lang];
      const colon = lang === 'fr' ? ' :' : ':';
      return `${pick(zone, lang)}${colon} ${label} ${sources.join(', ')}`;
    }),
  /** Configuration screen: the zones that cannot be read. */
  statusFailing: (zones) =>
    each((lang) => {
      const names = zones.map((zone) => pick(zone, lang)).join(', ');
      return {
        en: `No source answers for: ${names}.`,
        fr: `Aucune source ne répond pour : ${names}.`,
        de: `Keine Quelle antwortet für: ${names}.`,
        es: `Ninguna fuente responde para: ${names}.`,
      }[lang];
    }),
  /** Widget caption. */
  measuredAt: (time) =>
    each(
      (lang) =>
        ({
          en: `Measured at ${time}`,
          fr: `Mesure de ${time}`,
          de: `Gemessen um ${time}`,
          es: `Medición de las ${time}`,
        })[lang],
    ),
};

/** Join multi-language parts with the separator of each language. */
export function joinTexts(parts) {
  return each((lang) => parts.map((part) => pick(part, lang)).join(SEPARATOR[lang]));
}

/**
 * "15:19:00" in the time zone of Gladys (TZ), or the one given.
 * @param {number} ms
 * @param {string} [timeZone]
 */
export function clockTime(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(ms));
}
