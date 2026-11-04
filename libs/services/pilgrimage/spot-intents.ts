// Local-only persistence for pilgrimage spot intents (saved / planned).
// v2 schema: a single MMKV key holding `Record<spotId, SpotIntent>` where each
// intent may carry a `meta` snapshot captured at toggle time — the anime it
// belongs to plus this point's own geo/image. That snapshot is what lets the
// plan page group planned spots offline (Rule 8: it's real data the user saw
// when they tapped, not a guess). v1 payloads (flag-only, no meta) migrate on
// read: flags are preserved, `meta` stays undefined, and the plan page files
// those under "uncategorized" until the user re-toggles them.
//
// The synchronous read lets the map / spot list / plan page seed markers and
// lists on the first frame instead of popping them in after an async resolve.

import { kvGet, kvSet } from '../storage/app-storage';
import { SPOT_INTENTS_STORAGE_KEY, SPOT_INTENTS_STORAGE_KEY_V2 } from '../storage/keys';
import { Logger } from '../../utils/logger';
import type { PilgrimageSpot, PilgrimageWork } from './types';

export type SpotIntentKind = 'saved' | 'planned';

/**
 * Snapshot captured when a user toggles an intent. Legacy fields remain
 * readable for Phase 3 migration; newly created metadata uses Atlas fields.
 */
export interface SpotIntentMeta {
  workKey: string;
  workTitle: string;
  spotName: string;
  address: string;
  geo?: [number, number];
  animeId?: number;
  name?: string;
  cn?: string;
  image?: string;
}

export interface SpotIntent {
  saved?: true;
  planned?: true;
  meta?: SpotIntentMeta;
}

export type SpotIntentMap = Record<string, SpotIntent>;

/**
 * Parse a stored v2 blob. Returns `null` if the string isn't valid JSON
 * (corrupted) — the caller falls through to the v1 migration path instead
 * of masking real v1 data behind an empty map. Mirrors `parseV2` in
 * captures.ts.
 */
function parseV2(raw: string): SpotIntentMap | null {
  try {
    return sanitizeSpotIntents(JSON.parse(raw) as unknown);
  } catch (err) {
    Logger.warn('[SpotIntents] v2 blob corrupted, falling back to v1', err);
    return null;
  }
}

/** Migrate a v1 payload: preserve flags, meta stays undefined. Never throws. */
function migrateV1(raw: string | null): SpotIntentMap {
  if (!raw) return {};
  try {
    return sanitizeSpotIntents(JSON.parse(raw) as unknown);
  } catch (err) {
    Logger.warn('[SpotIntents] v1 blob corrupted, returning empty', err);
    return {};
  }
}

/** Synchronous read — safe to seed `useState` with on the first-paint path. */
export function loadSpotIntentsSync(): SpotIntentMap {
  const rawV2 = kvGet(SPOT_INTENTS_STORAGE_KEY_V2);
  return (rawV2 ? parseV2(rawV2) : null) ?? migrateV1(kvGet(SPOT_INTENTS_STORAGE_KEY));
}

/** Async read kept for callers that want a `Promise` signature. */
export async function loadSpotIntents(): Promise<SpotIntentMap> {
  return loadSpotIntentsSync();
}

export async function saveSpotIntents(map: SpotIntentMap): Promise<void> {
  try {
    kvSet(SPOT_INTENTS_STORAGE_KEY_V2, JSON.stringify(sanitizeSpotIntents(map)));
  } catch (err) {
    Logger.warn('[SpotIntents] save failed', err);
  }
}

/**
 * Add or remove a single intent for one spot id, optionally attaching a meta
 * snapshot on add. The single source of truth for intent mutation — the hook's
 * grouped toggle and the compat `toggleSpotIntent` both funnel through here.
 */
export function applySpotIntent(
  map: SpotIntentMap,
  spotId: string,
  intent: SpotIntentKind,
  op: 'add' | 'remove',
  meta?: SpotIntentMeta
): SpotIntentMap {
  const current = map[spotId] ?? {};
  const nextIntent: SpotIntent = { ...current };
  if (op === 'add') {
    nextIntent[intent] = true;
    if (meta) nextIntent.meta = meta;
  } else {
    delete nextIntent[intent];
  }
  const next: SpotIntentMap = { ...map };
  if (nextIntent.saved || nextIntent.planned) next[spotId] = nextIntent;
  else delete next[spotId];
  return next;
}

/** Toggle one flag (compat signature). Decides add/remove from current state. */
export function toggleSpotIntent(
  map: SpotIntentMap,
  spotId: string,
  intent: SpotIntentKind,
  meta?: SpotIntentMeta
): SpotIntentMap {
  const isSet = map[spotId]?.[intent] === true;
  return applySpotIntent(map, spotId, intent, isSet ? 'remove' : 'add', meta);
}

/**
 * Read-modify-write ONE spot's intent flag against a FRESH synchronous read
 * of storage, then persist immediately. This is the atomic counterpart to
 * `saveSpotIntents` — mirrors `checkInSpot`/`checkOutSpot` in
 * visited-prefs.ts. A caller driving this from React state (e.g.
 * `usePilgrimageInteractions`) must not persist through an older `prev`
 * snapshot: another surface could have toggled a DIFFERENT spot's intent in
 * the interim (e.g. the map's own grouped toggle, or a second screen), and
 * writing that stale snapshot back would silently drop the other spot's
 * change. Reading fresh here means the write can't stomp anything.
 *
 * Returns the freshly-persisted map so a caller that also drives local React
 * state can adopt it directly instead of drifting from what's on disk.
 */
export function applySpotIntentAtomic(
  spotId: string,
  intent: SpotIntentKind,
  op: 'add' | 'remove',
  meta?: SpotIntentMeta
): SpotIntentMap {
  const next = applySpotIntent(loadSpotIntentsSync(), spotId, intent, op, meta);
  void saveSpotIntents(next);
  return next;
}

/** Screen-level anime metadata, used only when a point carries no source of its own. */
export function buildSpotIntentMeta(
  spot: PilgrimageSpot,
  work: PilgrimageWork
): SpotIntentMeta {
  const meta: SpotIntentMeta = {
    workKey: work.key,
    workTitle: work.titleJa,
    spotName: spot.name,
    address: spot.address,
  };
  if (spot.lat !== null && spot.lon !== null) meta.geo = [spot.lat, spot.lon];
  return meta;
}

function sanitizeMeta(value: unknown): SpotIntentMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const m = value as Record<string, unknown>;
  const geo = m.geo;
  const isAtlas = typeof m.workKey === 'string' && typeof m.workTitle === 'string';
  const isLegacy = typeof m.animeId === 'number' && typeof m.name === 'string';
  if (!isAtlas && !isLegacy) return undefined;
  const out: SpotIntentMeta = isAtlas
    ? {
        workKey: m.workKey as string,
        workTitle: m.workTitle as string,
        spotName: typeof m.spotName === 'string' ? m.spotName : '',
        address: typeof m.address === 'string' ? m.address : '',
      }
    : {
        workKey: '',
        workTitle: '',
        spotName: typeof m.spotName === 'string' ? m.spotName : m.name as string,
        address: typeof m.address === 'string' ? m.address : '',
        animeId: m.animeId as number,
        name: m.name as string,
      };
  if (Array.isArray(geo) && typeof geo[0] === 'number' && typeof geo[1] === 'number') {
    out.geo = [geo[0], geo[1]];
  }
  if (typeof m.image === 'string') out.image = m.image;
  if (typeof m.cn === 'string' && m.cn.length > 0) out.cn = m.cn;
  return out;
}

function sanitizeSpotIntents(value: unknown): SpotIntentMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SpotIntentMap = {};
  for (const [spotId, rawIntent] of Object.entries(value as Record<string, unknown>)) {
    if (!spotId || !rawIntent || typeof rawIntent !== 'object' || Array.isArray(rawIntent)) {
      continue;
    }
    const source = rawIntent as Record<string, unknown>;
    const intent: SpotIntent = {};
    if (source.saved === true) intent.saved = true;
    if (source.planned === true) intent.planned = true;
    if (!intent.saved && !intent.planned) continue;
    const meta = sanitizeMeta(source.meta);
    if (meta) intent.meta = meta;
    out[spotId] = intent;
  }
  return out;
}
