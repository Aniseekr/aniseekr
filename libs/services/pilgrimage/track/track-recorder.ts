// Records a pilgrimage walk from "start" to "finish", including while the
// phone is locked: a location task delivers fixes, the kept ones go to the
// track store, and spots of the user's own works are stamped as they pass.
//
// No "Always" permission: iOS keeps a while-in-use app running in the
// background once updates were started in the foreground (with the blue
// indicator), and Android runs a foreground service with a notification.
//
// This module must be imported from the root layout: the task has to be
// defined before the OS wakes the app with a batch of locations.
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { getAppLanguageSync } from '../../../i18n/app-language';
import { translate } from '../../../i18n/engine';
import { Logger } from '../../../utils/logger';
import { atlasClient } from '../atlas/atlas-client';
import type { AtlasSpotLiteRow } from '../atlas/types';
import { collectionPilgrimageService } from '../collection-pilgrimage-service';
import { offlinePackStore } from '../offline-pack/offline-pack-store';
import { loadSpotIntentsSync } from '../spot-intents';
import {
  checkInSpot,
  loadStampDetailsSync,
  loadStampsSync,
  loadVisitedAtSync,
} from '../visited-prefs';
import { buildSpotGrid, spotsWithin, type SpotGrid } from './spot-grid';
import { judgePoint, type TrackPoint } from './track-math';
import {
  appendActivePoints,
  clearActiveTrack,
  loadActiveTrackSync,
  saveActiveAsTrack,
  saveActiveTrack,
  type ActiveTrack,
  type SavedTrack,
  type TrackSpotEvent,
} from './track-store';

export const TRACK_TASK = 'aniseekr-pilgrimage-track';
/** A forgotten recording ends by itself. */
export const TRACK_MAX_DURATION_MS = 12 * 60 * 60 * 1000;
const IDLE_REMINDER_MS = 60 * 60 * 1000;
const IDLE_REMINDER_ID = 'aniseekr-track-idle';
/** The reminder is pushed back at most this often while the user keeps moving. */
const IDLE_RESCHEDULE_MS = 5 * 60 * 1000;
const MINE_LOOKUP_TIMEOUT_MS = 4000;

const t = (key: string, values?: Record<string, string | number>) =>
  translate(getAppLanguageSync(), key, values);

// ── Spot index ─────────────────────────────────────────────────────────────

let gridPromise: Promise<SpotGrid | null> | null = null;

/** Atlas spots from the cached index; offline with no cache, from downloaded trip packs. */
async function loadSpotRows(): Promise<AtlasSpotLiteRow[] | null> {
  try {
    return (await atlasClient.spotsLite()).rows;
  } catch {
    const rows: AtlasSpotLiteRow[] = [];
    for (const workKey of Object.keys(offlinePackStore.getSnapshot().manifests)) {
      const pack = await offlinePackStore.readWork(workKey);
      for (const spot of pack?.detail.spots ?? []) {
        const { lat, lon } = spot.location ?? {};
        if (typeof lat === 'number' && typeof lon === 'number') {
          rows.push([spot.id, workKey, spot.name_ja, lat, lon, 'u', []]);
        }
      }
    }
    return rows.length > 0 ? rows : null;
  }
}

function spotGrid(): Promise<SpotGrid | null> {
  gridPromise ??= loadSpotRows()
    .then((rows) => (rows ? buildSpotGrid(rows) : null))
    .catch(() => null)
    .then((grid) => {
      // A failed load is not remembered: the next batch tries again (signal may be back).
      if (!grid) gridPromise = null;
      return grid;
    });
  return gridPromise;
}

/** Works the user follows: in their list, saved or planned, downloaded, or already stamped. */
async function myWorkKeys(): Promise<string[]> {
  const keys = new Set<string>();
  for (const stamp of loadStampsSync()) if (stamp.meta) keys.add(stamp.meta.workKey);
  for (const intent of Object.values(loadSpotIntentsSync())) {
    if (intent.meta?.workKey) keys.add(intent.meta.workKey);
  }
  for (const key of Object.keys(offlinePackStore.getSnapshot().manifests)) keys.add(key);
  // The list lookup can go online for unmapped titles; a slow network must not hold up "start".
  const fromList = await Promise.race([
    collectionPilgrimageService
      .getEntries()
      .then((entries) => entries.map((entry) => entry.anime.key))
      .catch(() => [] as string[]),
    new Promise<string[]>((resolve) => setTimeout(() => resolve([]), MINE_LOOKUP_TIMEOUT_MS)),
  ]);
  for (const key of fromList) keys.add(key);
  return [...keys];
}

// ── Notifications (only when already allowed; recording never asks) ─────────

async function canNotify(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

let idleScheduledAt = 0;

async function scheduleIdleReminder(now: number): Promise<void> {
  if (now - idleScheduledAt < IDLE_RESCHEDULE_MS) return;
  idleScheduledAt = now;
  if (!(await canNotify())) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(IDLE_REMINDER_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: IDLE_REMINDER_ID,
      content: {
        title: t('pilgrimage.track.idleTitle'),
        body: t('pilgrimage.track.idleBody'),
        data: { kind: 'track_idle' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: IDLE_REMINDER_MS / 1000,
        channelId: Platform.OS === 'android' ? 'default' : undefined,
      },
    });
  } catch (error) {
    Logger.warn('[Track] idle reminder failed', error);
  }
}

async function cancelIdleReminder(): Promise<void> {
  idleScheduledAt = 0;
  await Notifications.cancelScheduledNotificationAsync(IDLE_REMINDER_ID).catch(() => undefined);
}

async function notifyStamped(events: readonly TrackSpotEvent[]): Promise<void> {
  if (events.length === 0 || !(await canNotify())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title:
          events.length === 1
            ? t('pilgrimage.stamps.stamped')
            : t('pilgrimage.stamps.stampedMany', { count: events.length }),
        body: events.map((event) => event.name).join('、'),
        data: { kind: 'track_stamp' },
      },
      trigger: null,
    });
  } catch (error) {
    Logger.warn('[Track] stamp notification failed', error);
  }
}

// ── Ingest ─────────────────────────────────────────────────────────────────

interface RawLocation {
  coords: { latitude: number; longitude: number; accuracy?: number | null };
  timestamp: number;
}

async function stampAlongTheWay(
  active: ActiveTrack,
  kept: readonly TrackPoint[]
): Promise<ActiveTrack> {
  const grid = await spotGrid();
  if (!grid) return active.canStamp ? { ...active, canStamp: false } : active;
  const mine = new Set(active.mine);
  const seen = new Set([...active.stamped, ...active.passed].map((event) => event.spotId));
  const stamped: TrackSpotEvent[] = [];
  const passed: TrackSpotEvent[] = [];
  for (const point of kept) {
    for (const spot of spotsWithin(grid, point.lat, point.lon)) {
      if (seen.has(spot.id)) continue;
      seen.add(spot.id);
      const event: TrackSpotEvent = {
        spotId: spot.id,
        workKey: spot.workKey,
        name: spot.name,
        lat: spot.lat,
        lon: spot.lon,
        at: point.t,
      };
      if (!mine.has(spot.workKey)) {
        // Already stamped by hand or photo earlier: nothing to offer.
        if (!(spot.id in loadVisitedAtSync())) passed.push(event);
        continue;
      }
      if (loadStampDetailsSync()[spot.id]?.onsiteAt) continue;
      await checkInSpot(spot.id, point.t, {
        onsiteVia: 'track',
        meta: { workKey: spot.workKey, name: spot.name, lat: spot.lat, lon: spot.lon },
      });
      stamped.push(event);
    }
  }
  if (stamped.length === 0 && passed.length === 0 && active.canStamp) return active;
  void notifyStamped(stamped);
  return {
    ...active,
    canStamp: true,
    stamped: [...active.stamped, ...stamped],
    passed: [...active.passed, ...passed],
  };
}

async function ingest(locations: readonly RawLocation[]): Promise<void> {
  let active = loadActiveTrackSync();
  if (!active || active.status !== 'recording') {
    // A task left running with nothing to record into (e.g. data cleared): stop it.
    await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => undefined);
    return;
  }
  const kept: TrackPoint[] = [];
  let last = active.last;
  let startNext = active.startNext;
  let lastRawAcc = active.lastRawAcc;
  let lastRawAt = active.lastRawAt;
  for (const location of locations) {
    const acc = location.coords.accuracy;
    const point: TrackPoint = {
      lat: location.coords.latitude,
      lon: location.coords.longitude,
      t: location.timestamp > 0 ? location.timestamp : Date.now(),
      acc: typeof acc === 'number' && Number.isFinite(acc) ? acc : null,
    };
    lastRawAcc = point.acc;
    lastRawAt = point.t;
    if (startNext) point.start = true;
    if (judgePoint(last, point) !== 'accept') continue;
    kept.push(point);
    last = point;
    startNext = false;
  }
  active = { ...appendActivePoints(active, kept), startNext, lastRawAcc, lastRawAt };
  if (kept.length > 0) {
    active = await stampAlongTheWay(active, kept);
    void scheduleIdleReminder(Date.now());
  }
  saveActiveTrack(active);
  if (Date.now() - active.startedAt >= TRACK_MAX_DURATION_MS) await stopAndSave();
}

// One batch at a time: batches read and rewrite the same records.
let queue: Promise<void> = Promise.resolve();

TaskManager.defineTask<{ locations?: RawLocation[] }>(TRACK_TASK, ({ data, error }) => {
  if (error) {
    Logger.warn('[Track] location task error', error);
    return Promise.resolve();
  }
  const locations = data?.locations ?? [];
  queue = queue
    .then(() => ingest(locations))
    .catch((err) => Logger.warn('[Track] ingest failed', err));
  return queue;
});

// ── Controls ───────────────────────────────────────────────────────────────

function startUpdates(): Promise<void> {
  return Location.startLocationUpdatesAsync(TRACK_TASK, {
    accuracy: Location.Accuracy.High,
    distanceInterval: 10,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: t('pilgrimage.track.serviceTitle'),
      notificationBody: t('pilgrimage.track.serviceBody'),
      killServiceOnDestroy: false,
    },
  });
}

export type StartResult = 'started' | 'already' | 'denied' | 'failed';

/** Call from a tap (the app must be in front). Asks for while-in-use location if it can. */
export async function startRecording(): Promise<StartResult> {
  if (loadActiveTrackSync()) return 'already';
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted' && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status !== 'granted') return 'denied';
  } catch {
    return 'denied';
  }
  gridPromise = null;
  const [mine, grid] = await Promise.all([myWorkKeys(), spotGrid()]);
  const now = Date.now();
  saveActiveTrack({
    id: `t${now.toString(36)}`,
    startedAt: now,
    status: 'recording',
    count: 0,
    meters: 0,
    movingMs: 0,
    last: null,
    startNext: true,
    lastRawAcc: null,
    lastRawAt: null,
    mine,
    canStamp: grid !== null,
    stamped: [],
    passed: [],
  });
  try {
    await startUpdates();
    void scheduleIdleReminder(now);
    return 'started';
  } catch (error) {
    Logger.warn('[Track] start failed', error);
    clearActiveTrack();
    return 'failed';
  }
}

export async function pauseRecording(): Promise<void> {
  const active = loadActiveTrackSync();
  if (!active || active.status !== 'recording') return;
  await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => undefined);
  await queue;
  const latest = loadActiveTrackSync();
  if (latest) saveActiveTrack({ ...latest, status: 'paused', pausedAt: Date.now() });
  await cancelIdleReminder();
}

export async function resumeRecording(): Promise<boolean> {
  const active = loadActiveTrackSync();
  if (!active || active.status !== 'paused') return false;
  saveActiveTrack({ ...active, status: 'recording', startNext: true, pausedAt: undefined });
  try {
    await startUpdates();
    void scheduleIdleReminder(Date.now());
    return true;
  } catch (error) {
    Logger.warn('[Track] resume failed', error);
    saveActiveTrack({ ...active, status: 'paused' });
    return false;
  }
}

/** Stops and saves. Null when the walk never got a line (fewer than two points). */
export async function finishRecording(): Promise<SavedTrack | null> {
  await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => undefined);
  // Let a batch that is mid-ingest finish first, or it would write the recording back.
  await queue;
  return stopAndSave();
}

async function stopAndSave(): Promise<SavedTrack | null> {
  const active = loadActiveTrackSync();
  if (!active) return null;
  await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => undefined);
  await cancelIdleReminder();
  // A walk ends at its last kept point, not when the button was pressed hours later.
  const endedAt = active.status === 'paused' && active.last ? active.last.t : Date.now();
  return saveActiveAsTrack(Math.min(endedAt, active.startedAt + TRACK_MAX_DURATION_MS));
}

/**
 * After a launch: a recording whose task the OS is still running carries on;
 * one that lost its task (app force-quit, reboot) or ran past the cap is
 * closed at its last point instead of pretending to record.
 */
export async function recoverRecording(): Promise<void> {
  const active = loadActiveTrackSync();
  if (!active || active.status !== 'recording') return;
  const running = await Location.hasStartedLocationUpdatesAsync(TRACK_TASK).catch(() => false);
  const expired = Date.now() - active.startedAt >= TRACK_MAX_DURATION_MS;
  if (running && !expired) return;
  if (running) await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => undefined);
  await cancelIdleReminder();
  await saveActiveAsTrack(active.last?.t ?? active.startedAt);
}
