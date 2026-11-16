// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and fake sources serving the
// real answers of 16/11/2026: devices, states, fallback, stale values, the
// two triggers, the action, the timer and the logs.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_KEY, DEVIATION_TRIGGER_KEY, NORMAL_TRIGGER_KEY } from '../src/app.js';
import { START, createWorld } from './helpers/world.js';

const CE = 'ext:test-integration:zone:continental';
const NORDIC = 'ext:test-integration:zone:nordic';
const GB = 'ext:test-integration:zone:gb';

/** Capture what the loggers write, at a given LOG_LEVEL. */
function captureLogs(t, level) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  for (const stream of ['log', 'error', 'warn', 'info']) {
    t.mock.method(console, stream, (...args) => lines.push(args.map(String).join(' ')));
  }
  return lines;
}

test('one device per zone, the states of each from its source', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => [d.external_id, d.name, d.should_poll]),
    [
      [CE, 'Fréquence du réseau Europe continentale', false],
      [NORDIC, 'Fréquence du réseau Nordique', false],
      [GB, 'Fréquence du réseau Grande-Bretagne', false],
    ],
  );
  assert.equal(world.fake.lastState(`${CE}:frequency`), 50.013);
  assert.equal(world.fake.lastState(`${CE}:deviation`), 13);
  assert.equal(world.fake.lastState(`${CE}:state`), 0);
  // 15:19:00 UTC in the Gladys time zone (Paris).
  assert.equal(world.fake.lastState(`${CE}:measured_at`), '16:19:00');
  assert.equal(world.fake.lastState(`${CE}:source`), 'netzfrequenzmessung.de');
  assert.equal(world.fake.lastState(`${NORDIC}:frequency`), 50.008);
  assert.equal(world.fake.lastState(`${NORDIC}:source`), 'Statnett');
  assert.equal(world.fake.lastState(`${GB}:frequency`), 49.94);
  assert.equal(world.fake.lastState(`${GB}:deviation`), -60);
  assert.equal(world.fake.lastState(`${GB}:state`), 0, '−60 mHz is normal in Great Britain');
  assert.equal(world.fake.lastState(`${GB}:source`), 'Elexon BMRS');
  assert.equal(world.fake.connectionStatus.connected, true);
  // The fallback is not asked while the first source answers.
  assert.equal(world.api.count('netzfrequenz_info'), 0);
});

test('a zone whose device is not added is not read', async (t) => {
  const world = await createWorld({ created: false });
  t.after(() => world.app.stop());
  assert.equal(world.api.calls.length, 0);
  assert.equal(world.fake.states.length, 0);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('the second source takes over when the first fails, answers nonsense or a stale value', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const lastSource = () => world.fake.lastState(`${CE}:source`);

  world.api.down.add('netzfrequenzmessung');
  world.clock.advance(30_000);
  world.api.setFrequency(49.987, world.clock.now() - 1000);
  world.api.down.add('netzfrequenzmessung');
  await world.app.tick();
  assert.equal(lastSource(), 'netzfrequenz.info');
  assert.equal(world.fake.lastState(`${CE}:frequency`), 49.987);

  world.api.down.clear();
  world.api.bodies.netzfrequenzmessung = '<html>Wartung</html>';
  world.clock.advance(30_000);
  await world.app.tick();
  assert.equal(lastSource(), 'netzfrequenz.info');

  // A frozen first source: its value is ten minutes old.
  world.api.setFrequency(50.004, world.clock.now() - 1000);
  world.api.bodies.netzfrequenzmessung = '<r><f>50.1</f><z>2026-11-16T15:10:00+00:00</z></r>';
  world.clock.advance(1000);
  await world.app.tick();
  assert.equal(lastSource(), 'netzfrequenz.info');
  assert.equal(world.fake.lastState(`${CE}:frequency`), 50.004);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('no source answers: the last states stay, the status says it, then recovers', async (t) => {
  const world = await createWorld({ config: { gb: true } });
  t.after(() => world.app.stop());
  const published = world.fake.states.length;
  world.api.down.add('netzfrequenzmessung');
  world.api.status.netzfrequenz_info = 502;
  world.clock.advance(30_000);
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Europe continentale/);
  assert.doesNotMatch(world.fake.connectionStatus.message.fr, /Grande-Bretagne/);
  assert.equal(world.fake.lastState(`${CE}:frequency`), 50.013);
  // Elexon still answers its old value: nothing new for the core.
  assert.equal(world.fake.states.length, published);

  world.api.down.clear();
  delete world.api.status.netzfrequenz_info;
  world.api.setFrequency(50.021, world.clock.now());
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.lastState(`${CE}:frequency`), 50.021);
});

test('Great Britain: a value two minutes late is fresh, eleven minutes is stale', async (t) => {
  const world = await createWorld({ config: { continental: false, gb: true } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.lastState(`${GB}:frequency`), 49.94);
  world.clock.advance(10 * 60_000);
  await world.app.tick();
  assert.equal(world.fake.connectionStatus.connected, false);
});

test('triggers: beyond the threshold once, back to normal under 80 % of it', async (t) => {
  const world = await createWorld({ config: { alert_threshold_mhz: '100' } });
  t.after(() => world.app.stop());
  const step = async (frequency) => {
    world.clock.advance(30_000);
    world.api.setFrequency(frequency, world.clock.now() - 1000);
    await world.app.tick();
  };
  const events = (key) =>
    world.fake.sceneEvents.filter((e) => e.key === key && e.data.device === CE);

  await step(49.95);
  assert.equal(events(DEVIATION_TRIGGER_KEY).length, 0);
  await step(49.88);
  const [first] = events(DEVIATION_TRIGGER_KEY);
  assert.deepEqual(first.data, {
    device: CE,
    direction: 'low',
    frequency: 49.88,
    deviation_mhz: -120,
    threshold_mhz: 100,
    state: 'Notable',
    zone: 'Europe continentale',
  });
  // Still beyond, deeper, then hovering at 90 mHz: no new event.
  await step(49.79);
  assert.equal(world.fake.lastState(`${CE}:state`), 2);
  await step(49.91);
  await step(49.89);
  assert.equal(events(DEVIATION_TRIGGER_KEY).length, 1);
  assert.equal(events(NORMAL_TRIGGER_KEY).length, 0);
  await step(49.93);
  const [normal] = events(NORMAL_TRIGGER_KEY);
  assert.deepEqual(normal.data, {
    device: CE,
    frequency: 49.93,
    deviation_mhz: -70,
    peak_deviation_mhz: -210,
    duration_seconds: 120,
    zone: 'Europe continentale',
  });
  await step(50.15);
  assert.equal(events(DEVIATION_TRIGGER_KEY).at(-1).data.direction, 'high');
  assert.equal(events(DEVIATION_TRIGGER_KEY).length, 2);
});

test('a trigger refused by Gladys is fired again on the next reading', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const original = world.gladys.publishSceneEvent.bind(world.gladys);
  let refuse = true;
  t.mock.method(world.gladys, 'publishSceneEvent', async (...args) => {
    if (refuse) {
      throw new Error('HTTP 429');
    }
    return original(...args);
  });
  world.clock.advance(30_000);
  world.api.setFrequency(49.85, world.clock.now());
  await world.app.tick();
  assert.equal(world.fake.sceneEvents.length, 0);
  refuse = false;
  world.clock.advance(30_000);
  world.api.setFrequency(49.86, world.clock.now());
  await world.app.tick();
  assert.equal(world.fake.sceneEvents.length, 1);
});

test('the action tests every source, fallbacks too; red when a zone has none', async (t) => {
  const world = await createWorld({ config: { gb: true } });
  t.after(() => world.app.stop());
  const ok = await world.fake.action(ACTION_KEY, {});
  assert.equal(ok.success, true, JSON.stringify(ok.error));
  assert.equal(world.api.count('netzfrequenz_info'), 1);

  world.api.down.add('netzfrequenzmessung');
  const partial = await world.fake.action(ACTION_KEY, {});
  assert.equal(partial.success, true);

  world.api.status.elexon = 500;
  const failed = await world.fake.action(ACTION_KEY, {});
  assert.equal(failed.success, false);
  assert.match(failed.error.fr, /Grande-Bretagne : aucune réponse de Elexon BMRS/);
  assert.match(failed.error.fr, /netzfrequenzmessung\.de hors service/);
  assert.match(failed.error.de, /keine Antwort von Elexon BMRS/);

  const none = await createWorld({ config: { continental: false } });
  t.after(() => none.app.stop());
  const empty = await none.fake.action(ACTION_KEY, {});
  assert.equal(empty.success, false);
  assert.match(empty.error.fr, /Aucune zone choisie/);
  assert.equal(none.fake.connectionStatus.connected, false);
});

test('a device added later gets its states at once', async (t) => {
  const world = await createWorld({ created: false, config: {} });
  t.after(() => world.app.stop());
  assert.equal(world.fake.states.length, 0);
  await world.fake.deviceCreated(world.fake.discoveredDevices[0]);
  assert.equal(world.fake.lastState(`${CE}:frequency`), 50.013);
  assert.equal(world.fake.lastState(`${CE}:source`), 'netzfrequenzmessung.de');
});

test('the container reads on its own timer, at the configured interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ config: { interval_seconds: '10' }, timers: true });
  t.after(() => world.app.stop());
  assert.equal(world.api.count('netzfrequenzmessung'), 1);
  for (let i = 0; i < 3; i += 1) {
    world.clock.advance(10_000);
    t.mock.timers.tick(10_000);
    for (let j = 0; j < 5; j += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  assert.equal(world.api.count('netzfrequenzmessung'), 4);
});

test('onPoll is only a fallback of the timer', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const device = world.fake.discoveredDevices[0];
  await world.fake.poll(device);
  assert.equal(world.api.count('netzfrequenzmessung'), 1);
  world.clock.advance(60_000);
  await world.fake.poll(device);
  assert.equal(world.api.count('netzfrequenzmessung'), 2);
});

test('a normal reading writes nothing at info level, a failure once, its end once', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 3; i += 1) {
    world.clock.advance(30_000);
    world.api.setFrequency(50 + i / 1000, world.clock.now());
    await world.app.tick();
  }
  assert.deepEqual(lines, []);
  world.api.down.add('netzfrequenzmessung');
  world.api.down.add('netzfrequenz_info');
  for (let i = 0; i < 3; i += 1) {
    world.clock.advance(30_000);
    await world.app.tick();
  }
  world.api.down.clear();
  world.api.setFrequency(50, world.clock.now());
  await world.app.tick();
  // First failure: one line per source and one for the zone; recovery: the
  // first source and the zone (the fallback is not asked while it answers).
  assert.equal(lines.length, 5, lines.join('\n'));
  assert.ok(lines.every((line) => !/token|password/i.test(line)));
});

test('Gladys unreachable: the tick waits', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  await world.gladys.disconnect();
  world.clock.advance(30_000);
  await world.app.tick();
  assert.equal(world.api.count('netzfrequenzmessung'), 1);
  assert.equal(START, world.clock.now() - 30_000);
});

test('a swing straight to the other side fires again; the language saved keeps the excursion', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  const step = async (frequency) => {
    world.clock.advance(30_000);
    world.api.setFrequency(frequency, world.clock.now());
    await world.app.tick();
  };
  const directions = () =>
    world.fake.sceneEvents
      .filter((e) => e.key === DEVIATION_TRIGGER_KEY)
      .map((e) => e.data.direction);
  await step(49.85);
  await step(50.12);
  assert.deepEqual(directions(), ['low', 'high']);
  await world.fake.configUpdated({ language: 'en' });
  await step(50.13);
  assert.deepEqual(directions(), ['low', 'high'], 'a new language is no new excursion');
  await world.fake.configUpdated({ language: 'en', alert_threshold_mhz: '50' });
  assert.deepEqual(directions(), ['low', 'high', 'high'], 'a new threshold starts afresh');
});

test('after a long outage the old value is neither republished nor shown', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  world.api.down.add('netzfrequenzmessung');
  world.api.down.add('netzfrequenz_info');
  const published = world.fake.states.length;
  world.clock.advance(7 * 60 * 60 * 1000);
  await world.app.tick();
  assert.equal(world.fake.states.length, published, 'no heartbeat of a stale value');
  const ack = await world.fake.widgetGet('grid_frequency', { settings: {}, language: 'en' });
  assert.match(ack.data.content.components[1].text, /No source answers/);
});
