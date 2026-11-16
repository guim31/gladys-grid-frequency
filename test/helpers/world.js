// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, the four sources behind a fake
// `fetch` serving their real answers (16/11/2026, 15:19 UTC) and a manual
// clock, with the integration wired on top through registerHandlers. No timer
// runs unless `timers: true`: the tests call `app.tick()`. No test touches the
// network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { normalizeConfig } from '../../src/config.js';
import { zoneIds } from '../../src/devices.js';
import {
  ELEXON_URL,
  NETZFREQUENZMESSUNG_URL,
  NETZFREQUENZ_INFO_URL,
  STATNETT_URL,
} from '../../src/sources.js';
import { zonesOf } from '../../src/zones.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const fixtureText = (name) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
export const fixture = (name) => JSON.parse(fixtureText(name));

/** Real answers, read on 16/11/2026 at 15:19 UTC. */
export const NFM_XML = fixtureText('netzfrequenzmessung.xml'); // 50.013 Hz at 15:19:00
export const NFI_BODY = fixture('netzfrequenz-info.json'); // 50.012 Hz at 15:19:02
export const STATNETT_BODY = fixture('statnett-bysecond.json'); // 50.008 Hz at 15:19:02
export const ELEXON_BODY = fixture('elexon-freq.json'); // 49.94 Hz at 15:17:45

/** 2026-11-16 15:19:05 UTC, a few seconds after the fixtures. */
export const START = Date.UTC(2026, 10, 16, 15, 19, 5);
export const TIME_ZONE = 'Europe/Paris';

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

const respond = (status, body, type) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': type },
  });

/** An XML answer of netzfrequenzmessung.de for a frequency at a time. */
export const nfmXml = (frequency, at) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<r>\n<f>${frequency}</f>\n<z>${new Date(at).toISOString().replace('.000Z', '+00:00')}</z>\n</r>\n`;

/**
 * Fake sources. `api.bodies` can be changed between two calls, `api.down` is
 * a set of source keys that refuse the connection; every URL is recorded.
 */
export function createFakeApi() {
  const api = {
    calls: [],
    down: new Set(),
    status: {},
    bodies: {
      netzfrequenzmessung: NFM_XML,
      netzfrequenz_info: NFI_BODY,
      statnett: STATNETT_BODY,
      elexon: ELEXON_BODY,
    },
    /** Every source answers this frequency, measured at `at`. */
    setFrequency(frequency, at) {
      api.bodies.netzfrequenzmessung = nfmXml(frequency, at);
      api.bodies.netzfrequenz_info = { freq: frequency, time: Math.round(at / 1000) };
      api.bodies.statnett = {
        StartPointUTC: at - 2000,
        EndPointUTC: at,
        PeriodTickMs: 1000,
        Measurements: [frequency, frequency, frequency],
      };
      api.bodies.elexon = {
        data: [{ dataset: 'FREQ', measurementTime: new Date(at).toISOString(), frequency }],
      };
    },
    keyOf(url) {
      if (url.startsWith(NETZFREQUENZMESSUNG_URL)) return 'netzfrequenzmessung';
      if (url.startsWith(NETZFREQUENZ_INFO_URL)) return 'netzfrequenz_info';
      if (url.startsWith(STATNETT_URL)) return 'statnett';
      if (url.startsWith(ELEXON_URL)) return 'elexon';
      return null;
    },
    /** @type {typeof fetch} */
    fetch: async (url) => {
      const text = String(url);
      api.calls.push(text);
      const key = api.keyOf(text);
      if (!key) {
        return respond(404, 'not found', 'text/plain');
      }
      if (api.down.has(key)) {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
      }
      const body = api.bodies[key];
      return respond(
        api.status[key] ?? 200,
        body,
        key === 'netzfrequenzmessung' ? 'application/xml' : 'application/json',
      );
    },
    count: (key) => api.calls.filter((url) => api.keyOf(url) === key).length,
  };
  return api;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {boolean} [options.created] the devices are already added in Gladys
 * @param {ReturnType<typeof createFakeApi>} [options.api]
 * @param {ReturnType<typeof createClock>} [options.clock]
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = { nordic: true, gb: true },
  created = true,
  api = createFakeApi(),
  clock = createClock(),
  connect = true,
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config });
  if (created) {
    gladys.fake.devices = zonesOf(normalizeConfig(config)).map((zone) => ({
      external_id: zoneIds(gladys, zone).device,
      name: `Device ${zone.key}`,
      features: [],
    }));
  }
  const app = registerHandlers(gladys, {
    fetch: api.fetch,
    now: clock.now,
    timers,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
  }
  return { gladys, fake: gladys.fake, app, api, clock };
}

/** The devices discovered for a configuration. */
export async function discoveredDevices(config) {
  const world = await createWorld({ config, created: false });
  await world.app.stop();
  return world.fake.discoveredDevices;
}
