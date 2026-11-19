// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACTION_KEY, DEVIATION_TRIGGER_KEY, DIRECTIONS, NORMAL_TRIGGER_KEY } from '../src/app.js';
import { DEFAULT_CONFIG, INTERVALS, LANGUAGES, THRESHOLDS } from '../src/config.js';
import { ZONE_NAMES } from '../src/i18n.js';
import { WIDGET_KEY } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const field = (key) => manifest.config_schema.find((f) => f.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('identity: name, image, cover, local transport, energy category', () => {
  assert.equal(manifest.name, 'Grid Frequency');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-grid-frequency:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-grid-frequency/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['energy']);
  assert.equal(manifest.network_discovery, undefined);
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version, 'manifest version must match package.json');
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('Gladys >= 5.2.0: widget chart bound to a device feature', () => {
  assert.deepEqual(minGladysVersion(), [5, 2, 0]);
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  const valued = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(keysOf(valued).sort(), Object.keys(DEFAULT_CONFIG).sort());
  for (const f of valued) {
    assert.equal(DEFAULT_CONFIG[f.key], f.default, f.key);
  }
  assert.deepEqual(
    field('language').options.map((o) => o.value),
    LANGUAGES,
  );
  assert.deepEqual(
    field('interval_seconds').options.map((o) => o.value),
    INTERVALS,
  );
  assert.deepEqual(
    field('alert_threshold_mhz').options.map((o) => o.value),
    THRESHOLDS,
  );
  // One boolean per zone.
  for (const key of Object.keys(ZONE_NAMES)) {
    assert.equal(field(key).type, 'boolean', key);
  }
});

test('section fields are purely presentational, their links https, the sources named', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
  assert.match(field('intro').description.en, /Not affiliated with them/);
  assert.match(field('intro').description.fr, /Sans lien avec eux/);
});

test('the manifest action has a handler and needs no field', async (t) => {
  assert.deepEqual(keysOf(manifest.actions), [ACTION_KEY]);
  assert.equal(manifest.actions[0].fields, undefined);
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action(ACTION_KEY, {});
  assert.equal(ack.success, true, JSON.stringify(ack.error));
});

test('scene keys and the widget key are the ones of the code', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [DEVIATION_TRIGGER_KEY, NORMAL_TRIGGER_KEY]);
  assert.equal(manifest.scene_actions, undefined);
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  const settings = manifest.widgets[0].settings;
  assert.deepEqual(keysOf(settings), ['zone', 'show_chart', 'show_status']);
  assert.equal(settings[0].source, 'devices');
  assert.deepEqual(
    manifest.scene_triggers[0].fields[1].options.map((o) => o.value),
    DIRECTIONS,
  );
});

/** Every key sent is a filter or a variable, every variable is sent with its type. */
function assertEventMatches(trigger, event) {
  const declared = new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)]);
  assert.deepEqual(
    Object.keys(event.data).filter((key) => !declared.has(key)),
    [],
  );
  for (const variable of trigger.variables) {
    assert.equal(typeof event.data[variable.key], variable.type, variable.key);
  }
  for (const filter of trigger.fields) {
    assert.ok(filter.key in event.data, filter.key);
  }
}

test('the triggers send the keys their filters and variables declare', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  for (const frequency of [49.8, 50]) {
    world.clock.advance(30_000);
    world.api.setFrequency(frequency, world.clock.now());
    await world.app.tick();
  }
  const [deviation, normal] = manifest.scene_triggers;
  assertEventMatches(
    deviation,
    world.fake.sceneEvents.find((e) => e.key === deviation.key),
  );
  assertEventMatches(
    normal,
    world.fake.sceneEvents.find((e) => e.key === normal.key),
  );
});
