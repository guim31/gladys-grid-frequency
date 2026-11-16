// -----------------------------------------------------------------------------
// The integration, wired on a Gladys client (the real one in index.js, the
// SDK's fake Gladys in the tests).
//
// Refresh: the devices declare no poll frequency (the core does not poll
// external devices reliably, Gladys#3198). The container reads the sources on
// its own timer, every `interval_seconds` (30 s by default), for the zones
// whose device is added, or that a dashboard showed in the last minutes. A
// zone tries its sources in order: the second one when the first fails,
// answers nonsense or a value too old. Only the states that changed are
// published, with a heartbeat. The core's onPoll, if it ever calls it, only
// runs a tick when the timer missed one: it is the fallback.
//
// Triggers, in memory (an excursion lasts seconds to minutes: a restart that
// forgets one costs at most a duplicate event):
//   - "frequency_deviation": the deviation of a zone goes beyond the threshold
//     of the configuration;
//   - "frequency_normal": it comes back under 80 % of that threshold (the
//     margin keeps a value hovering at the threshold from firing in a loop).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { buildDevices, zoneIds, zoneStates } from './devices.js';
import { MESSAGES, NAMES, STATE_TEXT, TEXT, ZONE_NAMES, joinTexts, pick } from './i18n.js';
import { createIssueLog } from './issues.js';
import { SOURCES, SourceError } from './sources.js';
import { WIDGET_KEY, buildWidgetContent } from './widgets.js';
import { deviationMhz, gridState, zonesOf } from './zones.js';

const logger = createLogger({ name: 'grid-frequency' });

export const HEARTBEAT_MS = 6 * 60 * 60 * 1000;
/** A widget shown in the last five minutes keeps its zone read without the device. */
const WIDGET_INTEREST_MS = 5 * 60 * 1000;
/** Back to normal under this share of the threshold. */
export const RELEASE_RATIO = 0.8;

export const ACTION_KEY = 'test_sources';
export const DEVIATION_TRIGGER_KEY = 'frequency_deviation';
export const NORMAL_TRIGGER_KEY = 'frequency_normal';
/** Direction of an excursion, as the trigger filter knows it. */
export const DIRECTIONS = ['low', 'high'];

/**
 * A failure of a user action: Gladys shows the thrown message in red, and the
 * multi-language object reaches the user in their language.
 */
export class ActionFailure extends Error {
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}

/**
 * @param {object} gladys GladysIntegration, or the SDK's fake Gladys
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 * @param {boolean} [options.timers] run the timer
 * @param {string} [options.timeZone] for the clock times (TZ of Gladys by default)
 */
export function registerHandlers(
  gladys,
  { fetch: fetchImpl = globalThis.fetch, now = () => Date.now(), timers = true, timeZone } = {},
) {
  let config = normalizeConfig(gladys.config ?? {});
  let zones = zonesOf(config);
  /** zone key → latest good reading `{ frequency, measuredAt, source, readAt }`. */
  const readings = new Map();
  /** zone key → ongoing excursion `{ since, peak, direction }`. */
  const alerts = new Map();
  const widgetShownAt = new Map();
  let lastTickAt = -Infinity;
  let lastStatus = null;
  let timer = null;
  let stopped = true;
  let ticking = null;

  const zoneIssues = createIssueLog(logger);
  const sourceIssues = createIssueLog(logger.child('source'));
  const gladysIssues = createIssueLog(logger);

  const isCreated = (zone) =>
    (gladys.devices ?? []).some((device) => device.external_id === zoneIds(gladys, zone).device);
  const zoneOfDevice = (externalId) =>
    zones.find((zone) => zoneIds(gladys, zone).device === externalId) ?? null;
  const isFailing = (zone) => zoneIssues.isFailing(zone.key);
  const wanted = (zone) =>
    isCreated(zone) || now() - (widgetShownAt.get(zone.key) ?? -Infinity) < WIDGET_INTEREST_MS;

  // --- Reading the sources ------------------------------------------------------

  /** One source of a zone, checked for freshness. Throws a SourceError. */
  async function readSource(zone, key) {
    const result = await SOURCES[key].read(fetchImpl, now());
    const age = now() - result.measuredAt;
    if (age > zone.maxAgeMs) {
      throw new SourceError(`stale value (${Math.round(age / 1000)} s old)`);
    }
    return { ...result, source: key };
  }

  /** Read one zone, its sources in order; true when one answered. */
  async function refreshZone(zone) {
    const errors = [];
    for (const key of zone.sources) {
      try {
        const result = await readSource(zone, key);
        sourceIssues.ok(key, `${SOURCES[key].name} answers again`);
        readings.set(zone.key, { ...result, readAt: now() });
        zoneIssues.ok(zone.key, `${zone.key}: frequency readable again`);
        logger.debug(`${zone.key}: ${result.frequency} Hz from ${SOURCES[key].name}`);
        return true;
      } catch (err) {
        const message = err instanceof SourceError ? err.message : `error (${err.message})`;
        errors.push(`${SOURCES[key].name}: ${message}`);
        sourceIssues.fail(key, `${SOURCES[key].name} cannot be read: ${message}`);
      }
    }
    zoneIssues.fail(zone.key, `${zone.key}: no source answers (${errors.join('; ')})`);
    return false;
  }

  // --- States and triggers --------------------------------------------------------

  async function publishStates() {
    const states = zones
      .filter(isCreated)
      .flatMap((zone) => zoneStates(gladys, zone, readings.get(zone.key), timeZone));
    if (states.length === 0) {
      return;
    }
    try {
      const { count } = await gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (count > 0) {
        logger.debug(`${count} state(s) published`);
      }
      gladysIssues.ok('states', 'States accepted by Gladys again');
    } catch (err) {
      gladysIssues.fail('states', `States not accepted by Gladys: ${err.message}`);
    }
  }

  /** Compare each fresh reading with the threshold; fire on crossing. */
  async function fireTriggers(freshZones) {
    const threshold = config.thresholdMhz;
    for (const zone of freshZones.filter(isCreated)) {
      const reading = readings.get(zone.key);
      const deviation = deviationMhz(reading.frequency);
      const away = Math.abs(deviation);
      const device = zoneIds(gladys, zone).device;
      const name = pick(ZONE_NAMES[zone.key], config.language);
      const alert = alerts.get(zone.key);
      if (!alert && away >= threshold) {
        const direction = deviation < 0 ? 'low' : 'high';
        const fired = await fire(DEVIATION_TRIGGER_KEY, {
          device,
          direction,
          frequency: reading.frequency,
          deviation_mhz: deviation,
          threshold_mhz: threshold,
          state: pick(STATE_TEXT[gridState(zone, deviation)], config.language),
          zone: name,
        });
        if (fired) {
          alerts.set(zone.key, { since: reading.measuredAt, peak: deviation, direction });
          logger.info(`${zone.key}: ${deviation} mHz, beyond the ${threshold} mHz threshold`);
        }
      } else if (alert && away < threshold * RELEASE_RATIO) {
        const fired = await fire(NORMAL_TRIGGER_KEY, {
          device,
          frequency: reading.frequency,
          deviation_mhz: deviation,
          peak_deviation_mhz: alert.peak,
          duration_seconds: Math.max(0, Math.round((reading.measuredAt - alert.since) / 1000)),
          zone: name,
        });
        if (fired) {
          alerts.delete(zone.key);
          logger.info(`${zone.key}: back to normal (${deviation} mHz, peak ${alert.peak} mHz)`);
        }
      } else if (alert && away > Math.abs(alert.peak)) {
        alert.peak = deviation;
      }
    }
  }

  /** Fire one trigger; false when Gladys refused it (fired again on the next reading). */
  async function fire(key, data) {
    try {
      await gladys.publishSceneEvent(key, data);
      gladysIssues.ok(`scene-${key}`, `Scene event ${key} accepted by Gladys again`);
      return true;
    } catch (err) {
      gladysIssues.fail(`scene-${key}`, `Scene event ${key} not sent to Gladys: ${err.message}`);
      return false;
    }
  }

  /** The application status of the Configuration screen, sent on change only. */
  async function reportStatus() {
    let status = { connected: true };
    const failing = zones.filter((zone) => isFailing(zone) && wanted(zone));
    if (zones.length === 0) {
      status = { connected: false, message: TEXT.noZone };
    } else if (failing.length > 0) {
      status = {
        connected: false,
        message: MESSAGES.statusFailing(failing.map((zone) => ZONE_NAMES[zone.key])),
      };
    }
    const key = JSON.stringify(status);
    if (key === lastStatus) {
      return;
    }
    try {
      await gladys.setConnectionStatus(status.connected, status.message);
      lastStatus = key;
    } catch (err) {
      logger.debug(`Connection status not sent: ${err.message}`);
    }
  }

  // --- The tick ---------------------------------------------------------------------

  /** Read the wanted zones, publish what changed, fire the triggers. One at a time. */
  async function tick() {
    if (ticking) {
      return ticking;
    }
    ticking = (async () => {
      lastTickAt = now();
      if (gladys.connected === false) {
        logger.debug('Gladys unreachable: tick skipped');
        return;
      }
      // In parallel: a source that hangs must not hold back the other zones.
      const due = zones.filter(wanted);
      const answered = await Promise.all(due.map(refreshZone));
      await publishStates();
      await fireTriggers(due.filter((_, i) => answered[i]));
      await reportStatus();
    })().finally(() => {
      ticking = null;
    });
    return ticking;
  }

  function schedule() {
    clearTimeout(timer);
    timer = null;
    if (!timers || stopped) {
      return;
    }
    timer = setTimeout(async () => {
      timer = null;
      try {
        await tick();
      } catch (err) {
        logger.error(`Refresh failed (${err.message})`);
      } finally {
        schedule();
      }
    }, config.intervalMs);
  }

  /** (Re)start: publish the devices, read everything wanted, then on the timer. */
  async function start() {
    stopped = false;
    lastStatus = null;
    zones = zonesOf(config);
    // A new threshold or a zone dropped: excursions start afresh.
    alerts.clear();
    for (const key of readings.keys()) {
      if (!zones.some((zone) => zone.key === key)) {
        readings.delete(key);
      }
    }
    try {
      await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
    } catch (err) {
      logger.error(`Publishing the devices failed: ${err.message}`);
    }
    logger.info(
      `Following ${zones.map((z) => z.key).join(', ') || 'no zone'}, every ${config.intervalMs / 1000} s`,
    );
    schedule();
    await tick();
  }

  // --- Handlers -----------------------------------------------------------------------

  gladys.onScanRequest(async () => {
    await gladys.publishDiscoveredDevices(buildDevices(gladys, config));
  });

  gladys.onPoll(async () => {
    // Fallback of the timer: a tick runs only when the timer missed one.
    if (now() - lastTickAt < config.intervalMs * 0.9) {
      return;
    }
    await tick();
  });

  // A device just added: its states again now (the core dropped the ones it
  // received before the feature existed; the SDK forgot them), and the
  // widget can show it.
  const onDeviceAdded = async (device) => {
    const zone = zoneOfDevice(device?.external_id);
    if (zone && !readings.has(zone.key)) {
      await refreshZone(zone);
    }
    await publishStates();
    gladys.requestWidgetRefresh(WIDGET_KEY);
  };
  gladys.onDeviceCreated(onDeviceAdded);
  gladys.onDeviceUpdated(onDeviceAdded);
  gladys.onDeviceDeleted(async (device) => {
    const zone = zoneOfDevice(device?.external_id);
    if (zone) {
      alerts.delete(zone.key);
    }
    gladys.requestWidgetRefresh(WIDGET_KEY);
  });

  gladys.onAction(ACTION_KEY, async () => {
    logger.info('Action: test the sources');
    if (zones.length === 0) {
      throw new ActionFailure(TEXT.noZone);
    }
    // Every source of every zone, in parallel: the fallbacks are tested too.
    const results = await Promise.all(
      zones.map((zone) =>
        Promise.all(
          zone.sources.map((key) =>
            readSource(zone, key).then(
              (result) => ({ key, result }),
              (err) => ({ key, error: err.message }),
            ),
          ),
        ),
      ),
    );
    const parts = [];
    let allUp = true;
    zones.forEach((zone, i) => {
      const ok = results[i].filter((r) => r.result);
      const down = results[i].filter((r) => r.error).map((r) => SOURCES[r.key].name);
      if (ok.length === 0) {
        allUp = false;
        parts.push(MESSAGES.zoneDown(ZONE_NAMES[zone.key], down));
        for (const r of results[i]) {
          logger.warn(`Action: ${SOURCES[r.key].name}: ${r.error}`);
        }
        return;
      }
      const best = ok[0].result;
      readings.set(zone.key, { ...best, readAt: now() });
      parts.push(
        MESSAGES.zoneOk(ZONE_NAMES[zone.key], best.frequency, SOURCES[best.source].name, down),
      );
    });
    await publishStates();
    const message = joinTexts(parts);
    if (!allUp) {
      throw new ActionFailure(message);
    }
    return message;
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings = {}, language }) => {
    const zone = settings.zone ? zoneOfDevice(settings.zone) : (zones[0] ?? null);
    const common = {
      showChart: settings.show_chart !== false && settings.show_chart !== 'false',
      showStatus: settings.show_status !== false && settings.show_status !== 'false',
      ttlSeconds: config.intervalMs / 1000,
      language,
      timeZone,
    };
    if (!zone) {
      return buildWidgetContent({ ...common, title: null, zone: null, reading: null });
    }
    widgetShownAt.set(zone.key, now());
    // A zone whose device is added is kept fresh by the timer; another one is
    // read here, at the pace of the interval.
    const held = readings.get(zone.key);
    if (!isCreated(zone) && (!held || now() - held.readAt >= config.intervalMs)) {
      await refreshZone(zone);
    }
    const ids = zoneIds(gladys, zone);
    const device = (gladys.devices ?? []).find((d) => d.external_id === ids.device);
    const names = NAMES[language] ?? NAMES.en;
    return buildWidgetContent({
      ...common,
      title: device?.name ?? `${names.device} ${pick(ZONE_NAMES[zone.key], language)}`,
      zone,
      reading: readings.get(zone.key) ?? null,
      frequencyFeature: device ? ids.feature('frequency') : null,
      failing: isFailing(zone),
    });
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw);
    logger.info('New configuration received');
    await start();
  });

  gladys.on('connected', async () => {
    try {
      config = normalizeConfig(await gladys.getConfig());
      await start();
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
      await gladys.setConnectionStatus(false, TEXT.initFailed).catch(() => {});
    }
  });

  return {
    tick,
    /** For the tests: what the integration holds. */
    readings,
    alerts,
    /** Stop the timer and wait for the tick in progress. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      timer = null;
      await ticking?.catch(() => {});
    },
  };
}
