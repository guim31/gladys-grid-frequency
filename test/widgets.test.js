// -----------------------------------------------------------------------------
// The "Grid frequency" widget through the fake Gladys: valid for the core,
// within its budget, its device references pointing at features that exist.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/widgets.js';
import { createWorld } from './helpers/world.js';

const CE = 'ext:test-integration:zone:continental';
const GB = 'ext:test-integration:zone:gb';

const get = async (world, settings, language = 'fr') => {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, JSON.stringify(ack.error));
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.length <= 8);
  assert.ok(content.components.filter((c) => c.type === 'text').length <= 2);
  return content;
};

test('a zone: name from Gladys, frequency, deviation, last hour, state, source', async (t) => {
  const world = await createWorld({ config: { gb: true } });
  t.after(() => world.app.stop());
  const content = await get(world, { zone: GB });
  assert.equal(content.ttl_seconds, 30);
  const [heading, frequency, deviation, chart, status, caption] = content.components;
  assert.equal(heading.text, 'Device gb');
  assert.deepEqual([frequency.value, frequency.unit], [49.94, 'Hz']);
  assert.deepEqual([deviation.value, deviation.unit, deviation.color], ['−60', 'mHz', 'success']);
  assert.deepEqual(chart.device_features, [`${GB}:frequency`]);
  // The reference points at a feature the device really has.
  const device = world.fake.discoveredDevices.find((d) => d.external_id === GB);
  assert.ok(device.features.some((f) => f.external_id === chart.device_features[0]));
  assert.deepEqual(
    status.items.map((i) => i.value),
    ['Normal', 'Elexon BMRS'],
  );
  assert.equal(caption.text, 'Mesure de 16:17:45');
});

test('the optional blocks can be hidden, the colour follows the grid state', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  world.api.setFrequency(49.75, world.clock.now());
  await world.app.tick();
  const content = await get(world, { zone: CE, show_chart: false, show_status: false }, 'de');
  assert.deepEqual(
    content.components.map((c) => c.type),
    ['text', 'value', 'value', 'text'],
  );
  assert.equal(content.components[2].value, '−250');
  assert.equal(content.components[2].color, 'danger');
  assert.equal(content.components[1].label, 'Frequenz');
});

test('a zone without device is read on demand, without chart', async (t) => {
  const world = await createWorld({ created: false, config: {} });
  t.after(() => world.app.stop());
  const content = await get(world, {}, 'en');
  assert.equal(content.components[0].text, 'Grid frequency Continental Europe');
  assert.ok(!content.components.some((c) => c.type === 'chart'));
  assert.equal(world.api.count('netzfrequenzmessung'), 1);
  await get(world, {}, 'en');
  assert.equal(world.api.count('netzfrequenzmessung'), 1, 'not again within the interval');
});

test('no zone, or nothing readable: a sentence', async (t) => {
  const none = await createWorld({ config: { continental: false } });
  t.after(() => none.app.stop());
  const empty = await get(none, {}, 'es');
  assert.match(empty.components[0].text, /Elija una zona/);

  const world = await createWorld({ created: false, config: {} });
  t.after(() => world.app.stop());
  world.api.down.add('netzfrequenzmessung');
  world.api.down.add('netzfrequenz_info');
  const down = await get(world, {}, 'fr');
  assert.match(down.components[1].text, /Aucune source ne répond/);
});
