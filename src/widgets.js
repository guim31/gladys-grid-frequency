// -----------------------------------------------------------------------------
// The "Grid frequency" dashboard widget, for one zone:
//   heading   the name of the zone's device in Gladys
//   tiles     frequency, deviation from 50 Hz (colored by the grid state)
//   chart     the frequency of the last hour, from the history Gladys keeps
//             (device reference: only once the device is added; optional)
//   status    grid state and source (optional)
//   caption   time of the measurement
// Budget (core): 8 components, 2 texts at most — this uses at most 6, 2 texts.
// -----------------------------------------------------------------------------

import { WIDGET_CHART_TYPES, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { MESSAGES, STATE_TEXT, TEXT, clockTime, pick, signed } from './i18n.js';
import { SOURCES } from './sources.js';
import { deviationMhz, gridState } from './zones.js';

export const WIDGET_KEY = 'grid_frequency';

const STATE_COLORS = {
  0: WIDGET_COLORS.SUCCESS,
  1: WIDGET_COLORS.WARNING,
  2: WIDGET_COLORS.DANGER,
};

/**
 * Build the widget content.
 * @param {object} options
 * @param {string | null} options.title the zone's device name, null without a zone
 * @param {object | null} options.zone
 * @param {{ frequency: number, measuredAt: number, source: string } | null} options.reading
 * @param {string | null} options.frequencyFeature external id of the frequency feature, when added
 * @param {boolean} options.showChart
 * @param {boolean} options.showStatus
 * @param {boolean} options.failing no source answers for the zone right now
 * @param {number} options.ttlSeconds
 * @param {string} options.language
 * @param {string} [options.timeZone]
 */
export function buildWidgetContent({
  title,
  zone,
  reading,
  frequencyFeature,
  showChart,
  showStatus,
  failing,
  ttlSeconds,
  language,
  timeZone,
}) {
  const ttl_seconds = Math.max(10, ttlSeconds);
  const components = [];
  if (title === null) {
    components.push({ type: 'text', variant: 'body', text: pick(TEXT.noDevice, language) });
    return { ttl_seconds, components };
  }
  components.push({ type: 'text', variant: 'heading', text: title });
  if (!reading) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(failing ? TEXT.unreachable : TEXT.waiting, language),
    });
    return { ttl_seconds, components };
  }
  const deviation = deviationMhz(reading.frequency);
  const state = gridState(zone, deviation);
  const color = STATE_COLORS[state];
  components.push(
    {
      type: 'value',
      label: pick(TEXT.frequency, language),
      value: Math.round(reading.frequency * 1000) / 1000,
      unit: 'Hz',
      icon: 'activity',
    },
    {
      type: 'value',
      label: pick(TEXT.deviation, language),
      value: signed(deviation),
      unit: 'mHz',
      icon: 'trending-up',
      color,
    },
  );
  if (showChart && frequencyFeature) {
    components.push({
      type: 'chart',
      device_features: [frequencyFeature],
      interval: 'last-hour',
      chart_type: WIDGET_CHART_TYPES.LINE,
      title: pick(TEXT.chart, language),
      unit: 'Hz',
    });
  }
  if (showStatus) {
    components.push({
      type: 'status',
      items: [
        { label: pick(TEXT.state, language), value: pick(STATE_TEXT[state], language), color },
        {
          label: pick(TEXT.source, language),
          value: SOURCES[reading.source].name,
          color: failing ? WIDGET_COLORS.WARNING : WIDGET_COLORS.INFO,
        },
      ],
    });
  }
  components.push({
    type: 'text',
    variant: 'caption',
    text: pick(MESSAGES.measuredAt(clockTime(reading.measuredAt, timeZone)), language),
  });
  return { ttl_seconds, components };
}
