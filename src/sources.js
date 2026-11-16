// -----------------------------------------------------------------------------
// The open sources of the grid frequency, one reader each. A reader returns
// `{ frequency, measuredAt }` (Hz, epoch ms) or throws a SourceError whose
// message is short and holds no secret (there is none: no source needs a key).
//
//   netzfrequenzmessung.de   continental Europe, measured in Germany: a
//                            documented XML interface for private use, a
//                            3-second moving average every 3 seconds, no more
//                            than one call a second.
//   netzfrequenz.info        continental Europe, measured in Germany: the JSON
//                            behind its live page, a value every second.
//   Statnett (driftsdata)    the Nordic area, measured by the Norwegian TSO: one
//                            value a second over the window asked, refreshed
//                            every ten seconds.
//   Elexon BMRS (FREQ)       Great Britain, the system frequency NESO publishes
//                            through Elexon: one value every 15 seconds, out
//                            in batches about two minutes late.
// -----------------------------------------------------------------------------

export const REQUEST_TIMEOUT_MS = 8_000;

/** Any frequency outside this band is a broken answer, not a grid event (blackout at 47.5 Hz). */
export const PLAUSIBLE = { min: 45, max: 55 };

export class SourceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceError';
  }
}

/**
 * GET a URL, the body as text.
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 */
async function getText(fetchImpl, url) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: 'application/json, application/xml;q=0.9, */*;q=0.5' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // A DNS failure, a refused connection, the timeout: the cause names it.
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.name ?? 'network error';
    throw new SourceError(`unreachable (${cause})`);
  }
  if (!response.ok) {
    throw new SourceError(`HTTP ${response.status}`);
  }
  return response.text();
}

async function getJson(fetchImpl, url) {
  const text = await getText(fetchImpl, url);
  try {
    return JSON.parse(text);
  } catch {
    throw new SourceError('the answer is not JSON');
  }
}

/** A reading, checked: a plausible frequency and a valid time. */
export function reading(frequency, measuredAt) {
  const value = typeof frequency === 'string' ? Number(frequency.trim()) : frequency;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SourceError('no frequency in the answer');
  }
  if (value < PLAUSIBLE.min || value > PLAUSIBLE.max) {
    throw new SourceError(`implausible frequency ${value}`);
  }
  if (!Number.isFinite(measuredAt)) {
    throw new SourceError('no measurement time in the answer');
  }
  return { frequency: value, measuredAt };
}

// --- Parsers (pure, tested on real answers) ----------------------------------

/** `<r><f>50.013</f><z>2026-11-16T15:19:00+00:00</z></r>` */
export function parseNetzfrequenzmessung(xml) {
  const tag = (name) => String(xml).match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
  const f = tag('f');
  return reading(f === undefined ? undefined : f, Date.parse(tag('z') ?? ''));
}

/** `{ "freq": 50.012, "time": 1794842342 }`, time in seconds. */
export function parseNetzfrequenzInfo(body) {
  return reading(body?.freq, Number(body?.time) * 1000);
}

/**
 * `{ StartPointUTC, EndPointUTC, PeriodTickMs, Measurements: [...] }`: the
 * last value is the latest, at StartPointUTC + (n - 1) ticks.
 */
export function parseStatnett(body) {
  const values = Array.isArray(body?.Measurements) ? body.Measurements : [];
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (typeof values[i] === 'number') {
      return reading(values[i], Number(body.StartPointUTC) + i * Number(body.PeriodTickMs ?? 1000));
    }
  }
  throw new SourceError('no frequency in the answer');
}

/** `{ data: [{ measurementTime, frequency }, ...] }`, in any order: the latest wins. */
export function parseElexon(body) {
  const rows = (Array.isArray(body?.data) ? body.data : [])
    .map((row) => ({ frequency: row?.frequency, at: Date.parse(row?.measurementTime) }))
    .filter((row) => typeof row.frequency === 'number' && Number.isFinite(row.at))
    .sort((a, b) => b.at - a.at);
  if (rows.length === 0) {
    throw new SourceError('no frequency in the answer');
  }
  return reading(rows[0].frequency, rows[0].at);
}

// --- The sources ---------------------------------------------------------------

export const NETZFREQUENZMESSUNG_URL = 'https://dat.netzfrequenzmessung.de:9080/frequenz.xml';
export const NETZFREQUENZ_INFO_URL = 'https://www.netzfrequenz.info/json/aktuell.json';
export const STATNETT_URL = 'https://driftsdata.statnett.no/restapi/Frequency/BySecond';
export const ELEXON_URL = 'https://data.elexon.co.uk/bmrs/api/v1/datasets/FREQ';

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Each source: its key (frozen, it goes out in scene variables), the name
 * shown to the user, and how to read it at `now`.
 */
export const SOURCES = {
  netzfrequenzmessung: {
    name: 'netzfrequenzmessung.de',
    read: async (fetchImpl) =>
      parseNetzfrequenzmessung(await getText(fetchImpl, NETZFREQUENZMESSUNG_URL)),
  },
  netzfrequenz_info: {
    name: 'netzfrequenz.info',
    read: async (fetchImpl) =>
      parseNetzfrequenzInfo(await getJson(fetchImpl, NETZFREQUENZ_INFO_URL)),
  },
  statnett: {
    name: 'Statnett',
    // The last minute only (the default is the last hour, 3600 values).
    read: async (fetchImpl, now) =>
      parseStatnett(await getJson(fetchImpl, `${STATNETT_URL}?From=${now - 60_000}`)),
  },
  elexon: {
    name: 'Elexon BMRS',
    // The last ten minutes: the values arrive about two minutes late.
    read: async (fetchImpl, now) =>
      parseElexon(
        await getJson(
          fetchImpl,
          `${ELEXON_URL}?measurementDateTimeFrom=${iso(now - 600_000)}` +
            `&measurementDateTimeTo=${iso(now + 60_000)}&format=json`,
        ),
      ),
  },
};
