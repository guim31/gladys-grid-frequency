// -----------------------------------------------------------------------------
// The four readers on the real answers of 16/11/2026, and on broken ones.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOURCES,
  SourceError,
  parseElexon,
  parseNetzfrequenzInfo,
  parseNetzfrequenzmessung,
  parseStatnett,
} from '../src/sources.js';
import { deviationMhz, gridState, ZONES } from '../src/zones.js';
import {
  ELEXON_BODY,
  NFI_BODY,
  NFM_XML,
  START,
  STATNETT_BODY,
  createFakeApi,
} from './helpers/world.js';

test('netzfrequenzmessung.de: the XML interface', () => {
  assert.deepEqual(parseNetzfrequenzmessung(NFM_XML), {
    frequency: 50.013,
    measuredAt: Date.UTC(2026, 10, 16, 15, 19, 0),
  });
});

test('netzfrequenz.info: the JSON of the live page, time in seconds', () => {
  assert.deepEqual(parseNetzfrequenzInfo(NFI_BODY), {
    frequency: 50.012,
    measuredAt: Date.UTC(2026, 10, 16, 15, 19, 2),
  });
});

test('Statnett: the last value of the window, at its own second', () => {
  assert.deepEqual(parseStatnett(STATNETT_BODY), {
    frequency: 50.008,
    measuredAt: Date.UTC(2026, 10, 16, 15, 19, 2),
  });
  // A hole at the end of the window: the last real value.
  const holed = { ...STATNETT_BODY, Measurements: [...STATNETT_BODY.Measurements, null] };
  assert.equal(parseStatnett(holed).measuredAt, Date.UTC(2026, 10, 16, 15, 19, 2));
});

test('Elexon: the latest of the rows, whatever their order', () => {
  assert.deepEqual(parseElexon(ELEXON_BODY), {
    frequency: 49.94,
    measuredAt: Date.UTC(2026, 10, 16, 15, 17, 45),
  });
  assert.deepEqual(
    parseElexon({ data: [...ELEXON_BODY.data].reverse() }),
    parseElexon(ELEXON_BODY),
  );
});

test('broken answers are SourceErrors, never a value', () => {
  const broken = [
    () => parseNetzfrequenzmessung('<html>maintenance</html>'),
    () => parseNetzfrequenzmessung('<r><f></f><z>2026-11-16T15:19:00+00:00</z></r>'),
    () => parseNetzfrequenzmessung('<r><f>50.01</f></r>'),
    () => parseNetzfrequenzInfo({ freq: 0, time: 1794842342 }),
    () => parseNetzfrequenzInfo({ freq: '50.0x', time: 1794842342 }),
    () => parseNetzfrequenzInfo(null),
    () => parseStatnett({ Measurements: [] }),
    () => parseStatnett({ StartPointUTC: 0, Measurements: [null, null] }),
    () => parseElexon({ data: [] }),
    () => parseElexon({ data: [{ measurementTime: 'soon', frequency: 50 }] }),
    () => parseElexon({ error: 'Bad request' }),
    () => parseElexon({ data: [{ measurementTime: '2026-11-16T15:17:45Z', frequency: 60.1 }] }),
  ];
  for (const read of broken) {
    assert.throws(read, SourceError, String(read));
  }
});

test('a reader names the HTTP status or the network cause, and the window it asks', async () => {
  const api = createFakeApi();
  api.status.elexon = 503;
  await assert.rejects(SOURCES.elexon.read(api.fetch, START), /HTTP 503/);
  api.down.add('statnett');
  await assert.rejects(SOURCES.statnett.read(api.fetch, START), /unreachable \(ECONNREFUSED\)/);
  api.bodies.netzfrequenz_info = 'Bad Gateway';
  await assert.rejects(SOURCES.netzfrequenz_info.read(api.fetch, START), /not JSON/);
  assert.ok(api.calls.some((url) => url.endsWith(`?From=${START - 60_000}`)));
  assert.ok(
    api.calls.some((url) =>
      url.includes(
        'measurementDateTimeFrom=2026-11-16T15:09:05Z&measurementDateTimeTo=2026-11-16T15:20:05Z',
      ),
    ),
  );
});

test('deviation and grid state, per area', () => {
  const [continental, nordic, gb] = ZONES;
  assert.equal(deviationMhz(49.962), -38);
  assert.equal(deviationMhz(50.0125), 13);
  assert.equal(gridState(continental, 50), 0);
  assert.equal(gridState(continental, -51), 1);
  assert.equal(gridState(continental, 201), 2);
  assert.equal(gridState(nordic, -90), 0);
  assert.equal(gridState(gb, -150), 0);
  assert.equal(gridState(gb, 250), 1);
  assert.equal(gridState(gb, -600), 2);
});
