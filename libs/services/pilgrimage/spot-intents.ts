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
import {
  SPOT_INTENTS_STORAGE_KEY,
  SPOT_INTENTS_STORAGE_KEY_V2,
} from '../storage/keys';
import { Logger } from '../../utils/logger';
import type { AnitabiPoint } from './types';
import type { PilgrimageSeriesPoint } from './pilgrimage-series';

export type SpotIntentKind = 'saved' | 'planned';

/**
 * Snapshot captured the moment a user toggles an intent. `animeId`/`name`/`cn`
 * describe the ANIME the point belongs to (so the plan page can label a group
 * offline); `geo`/`image` describe THIS point (so the trip map can draw markers
 * + a route line and show a scene thumbnail without any network).
 */
export interface SpotIntentMeta {
  animeId: number;
  name: string;
  cn?: string;
  geo: [number, number];
  image: string;
}

export interface SpotIntent {
  saved?: true;
  planned?: true;
  meta?: SpotIntentMeta;
}

export type SpotIntentMap = Record<string, SpotIntent>;

/** Synchronous read — safe to seed `useState` with on the first-paint path. */
export function loadSpotIntentsSync(): SpotIntentMap {
  try {
    const rawV2 = kvGet(SPOT_INTENTS_STORAGE_KEY_V2);
    if (rawV2) return sanitizeSpotIntents(JSON.parse(rawV2) as unknown);
    // Migrate a v1 payload on first read: preserve flags, meta stays undefined.
    const rawV1 = kvGet(SPOT_INTENTS_STORAGE_KEY);
    if (rawV1) return sanitizeSpotIntents(JSON.parse(rawV1) as unknown);
    return {};
  } catch (err) {
    Logger.warn('[SpotIntents] load failed, returning empty', err);
    return {};
  }
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

/** Screen-level anime metadata, used only when a point carries no source of its own. */
export interface SpotIntentMetaFallback {
  animeId: number;
  name: string;
  cn?: string;
}

/**
 * Build the meta snapshot for ONE point at toggle time.
 *
 * In the "All" series view, `pilgrimage-series.ts` merges points from every
 * season into one list, and each merged point carries its OWN
 * `sourceBangumiId`/`sourceAnimeTitle` (see `PilgrimageSeriesPoint`). A point
 * pulled in from S2 must snapshot S2's anime — stamping every point with the
 * screen-level anime would mislabel S2 scenes as S1 (or vice versa) the
 * moment the user saves/plans from the merged view (Rule 8).
 *
 * `geo`/`image` always come from the point itself (real per-point data).
 * `animeId`/`name` prefer the point's own source annotation and fall back to
 * the screen-level `fallback` when the point carries none (single-season
 * view, where every point already belongs to the anime being shown).
 * `cn` is only ever taken from `fallback`, and only when `fallback` actually
 * describes this point's anime (no source override) — `PilgrimageSeriesPoint`
 * doesn't carry a Chinese title per source anime, so fabricating one from an
 * unrelated fallback would misattribute it (Rule 8: omit rather than guess).
 */
export function buildSpotIntentMeta(
  point: AnitabiPoint,
  fallback: SpotIntentMetaFallback
): SpotIntentMeta {
  const sourceBangumiId = getPointSourceBangumiId(point);
  const sourceAnimeTitle = getPointSourceAnimeTitle(point);
  const hasSource = sourceBangumiId !== null && sourceAnimeTitle !== null;
  const meta: SpotIntentMeta = {
    animeId: hasSource ? sourceBangumiId : fallback.animeId,
    name: hasSource ? sourceAnimeTitle : fallback.name,
    geo: point.geo,
    image: point.image,
  };
  if (!hasSource && fallback.cn) meta.cn = fallback.cn;
  return meta;
}

// Typed field access for the optional series-merge annotation. Mirrors
// `getPointSourceBangumiId`/`getPointSourceLabel` in
// `components/pilgrimage/detail/_helpers.ts` — duplicated here (rather than
// imported) because a service must not import from `components/`.
function getPointSourceBangumiId(point: AnitabiPoint): number | null {
  const source = (point as Partial<PilgrimageSeriesPoint>).sourceBangumiId;
  return typeof source === 'number' && Number.isFinite(source) && source > 0 ? source : null;
}

function getPointSourceAnimeTitle(point: AnitabiPoint): string | null {
  const title = (point as Partial<PilgrimageSeriesPoint>).sourceAnimeTitle;
  return typeof title === 'string' && title.length > 0 ? title : null;
}

function sanitizeMeta(value: unknown): SpotIntentMeta | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const m = value as Record<string, unknown>;
  const geo = m.geo;
  if (
    typeof m.animeId !== 'number' ||
    !Number.isFinite(m.animeId) ||
    typeof m.name !== 'string' ||
    typeof m.image !== 'string' ||
    m.image.length === 0 ||
    !Array.isArray(geo) ||
    geo.length < 2 ||
    typeof geo[0] !== 'number' ||
    typeof geo[1] !== 'number'
  ) {
    return undefined;
  }
  const out: SpotIntentMeta = {
    animeId: m.animeId,
    name: m.name,
    geo: [geo[0], geo[1]],
    image: m.image,
  };
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
