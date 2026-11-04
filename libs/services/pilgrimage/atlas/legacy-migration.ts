import { CacheService } from '../../cache-service';
import { LocalDB } from '../../../db';
import { kvGet, kvRemove, kvSet } from '../../storage/app-storage';
import {
  CAPTURES_STORAGE_KEY_V2,
  SPOT_INTENTS_STORAGE_KEY_V2,
  VISITED_SPOTS_LEGACY_KEY,
  VISITED_SPOTS_STORAGE_KEY_V2,
} from '../../storage/keys';
import {
  invalidateCapturesCache,
  loadCapturesV2Sync,
  type CapturesIndexV2,
  type PilgrimageCapture,
} from '../captures';
import { loadSpotIntentsSync, type SpotIntent, type SpotIntentMap } from '../spot-intents';
import {
  loadLegacyVisitedSpotIdsSync,
  loadVisitedAtSync,
  type VisitedAtMap,
} from '../visited-prefs';
import { resolveAtlasWork } from './atlas-resolver';
import { atlasClient, atlasSpotShardOf } from './atlas-client';
import { rehomeNearestSpot } from './rehome';
import type { AtlasSpot, AtlasWorkDetail, AtlasWorkIndex } from './types';

export const LEGACY_MIGRATION_DONE_KEY = 'pilgrimage.legacyMigration.v1';
const LEGACY_MIGRATION_JOURNAL_KEY = 'pilgrimage.legacyMigration.v1.journal';
const LEGACY_DETAIL_PREFIX = 'anitabi_detail_';
const LEGACY_POINTS_PREFIX = 'anitabi_points_v2_';
const CACHE_GRACE_MS = Number.MAX_SAFE_INTEGER;

type CacheEntry<T> = { value: T; age?: number; isStale?: boolean };
export interface LegacyMigrationDependencies {
  atlas?: Pick<typeof atlasClient, 'works' | 'work' | 'moved' | 'spotShard'>;
  cache?: Pick<typeof CacheService, 'getWithMeta' | 'getEntriesByPrefix' | 'deleteByPrefix'>;
  legacyDb?: Pick<typeof LocalDB, 'getDatabase'>;
}

type LegacyGeo = readonly [number, number];
type LegacyContext = {
  animeId?: number;
  geo?: LegacyGeo;
  animeTitle?: string;
  animeTitleCn?: string;
  name?: string;
};
type LegacyPoint = { id?: unknown; name?: unknown; geo?: unknown };
type LegacyPilgrimageRow = {
  bangumi_id: number;
  title: string;
  title_cn: string | null;
  lite_points_json: string | null;
};
type LegacySpotRow = {
  point_id: string;
  bangumi_id: number;
  lat: number;
  lng: number;
  name: string | null;
};
type IdDecision =
  | { kind: 'atlas'; targetId: string; spot?: AtlasSpot; workKey?: string }
  | { kind: 'legacy' };

/**
 * One-time, restartable migration of user records from retired spot ids to Atlas.
 * Each MMKV value is replaced with one synchronous write; the done flag is last.
 */
export async function migrateLegacyPilgrimageRecords(
  dependencies: LegacyMigrationDependencies = {}
): Promise<'migrated' | 'postponed' | 'already-done'> {
  if (kvGet(LEGACY_MIGRATION_DONE_KEY) === 'done') {
    kvRemove(LEGACY_MIGRATION_JOURNAL_KEY);
    return 'already-done';
  }
  const atlas = dependencies.atlas ?? atlasClient;
  const cache = dependencies.cache ?? CacheService;
  const legacyDb = dependencies.legacyDb ?? LocalDB;

  try {
    const workIndex = await atlas.works();
    const initialCaptures = loadCapturesV2Sync();
    const initialVisited = loadVisitedAtSync();
    const initialIntents = loadSpotIntentsSync();
    const moved = await atlas.moved();
    const workCache = new Map<string, AtlasWorkDetail | null>();
    const legacyPoints = new Map<string, LegacyContext>();
    const cachedPointRows = await cache.getEntriesByPrefix<unknown>(LEGACY_POINTS_PREFIX);
    for (const entry of cachedPointRows) {
      const animeId = finiteNumber(entry.key.slice(LEGACY_POINTS_PREFIX.length));
      if (!animeId || !Array.isArray(entry.value)) continue;
      addLegacyPoints(legacyPoints, animeId, entry.value as LegacyPoint[]);
    }
    let legacyDbHandle: Awaited<ReturnType<typeof legacyDb.getDatabase>> | null = null;
    legacyDbHandle = await legacyDb.getDatabase();
    try {
      const rows = await legacyDbHandle.getAllAsync<LegacyPilgrimageRow>(
        'SELECT bangumi_id, title, title_cn, lite_points_json FROM pilgrimage_spots'
      );
      for (const row of rows) {
        if (!row.lite_points_json) continue;
        const points = JSON.parse(row.lite_points_json) as unknown;
        if (Array.isArray(points)) addLegacyPoints(legacyPoints, row.bangumi_id, points as LegacyPoint[]);
      }
    } catch (error) {
      if (!isMissingLegacyTable(error, 'pilgrimage_spots')) throw error;
    }
    try {
      const rows = await legacyDbHandle.getAllAsync<LegacySpotRow>(
        'SELECT point_id, bangumi_id, lat, lng, name FROM anitabi_spots'
      );
      for (const row of rows) {
        if (!row.point_id || !Number.isFinite(row.bangumi_id)) continue;
        if (!legacyPoints.has(row.point_id)) {
          legacyPoints.set(row.point_id, {
            animeId: row.bangumi_id,
            ...(Number.isFinite(row.lat) && Number.isFinite(row.lng)
              ? { geo: [row.lat, row.lng] as const }
              : {}),
            ...(row.name ? { name: row.name } : {}),
          });
        }
      }
    } catch (error) {
      if (!isMissingLegacyTable(error, 'anitabi_spots')) throw error;
    }
    const ids = new Set([
      ...Object.keys(initialCaptures.spots),
      ...Object.keys(initialVisited),
      ...Object.keys(initialIntents),
    ]);
    const knownIds = new Set(readMigrationJournal());
    const shardCache = new Map<string, Set<string>>();
    const shardForId = async (id: string): Promise<Set<string>> => {
      const shard = atlasSpotShardOf(id);
      let found = shardCache.get(shard);
      if (!found) {
        const response = await atlas.spotShard(shard);
        found = new Set(Object.keys(response.rows ?? {}));
        shardCache.set(shard, found);
      }
      return found;
    };
    for (const id of ids) {
      if ((await shardForId(id)).has(id)) knownIds.add(id);
    }
    for (const target of Object.values(moved.moved)) {
      if (target) knownIds.add(target);
    }

    const contexts = new Map<string, LegacyContext>();
    for (const [id, list] of Object.entries(initialCaptures.spots)) {
      const capture = list.find(
        (item) => item.spotGeo && (item.animeId || item.animeTitle || item.animeTitleCn)
      ) ?? list.find(
        (item) => item.animeId || item.spotGeo || item.animeTitle || item.animeTitleCn
      );
      if (capture) contexts.set(id, {
        animeId: capture.animeId,
        geo: capture.spotGeo,
        animeTitle: capture.animeTitle,
        animeTitleCn: capture.animeTitleCn,
      });
    }
    for (const [id, intent] of Object.entries(initialIntents)) {
      if (!intent.meta) continue;
      const current = contexts.get(id) ?? {};
      contexts.set(id, {
        ...current,
        ...(!current.animeId && intent.meta.animeId ? { animeId: intent.meta.animeId } : {}),
        ...(!current.geo && intent.meta.geo ? { geo: intent.meta.geo } : {}),
      });
    }
    for (const id of ids) {
      if (knownIds.has(id)) continue;
      const current = contexts.get(id) ?? {};
      const point = legacyPoints.get(id);
      let recovered: LegacyContext = {
        ...current,
        ...(!current.animeId && point?.animeId ? { animeId: point.animeId } : {}),
        ...(!current.geo && point?.geo ? { geo: point.geo } : {}),
        ...(!current.name && point?.name ? { name: point.name } : {}),
      };
      if (!recovered.animeId || !recovered.geo) {
        const oldCache = await readOldSpotCache(cache, id);
        const fallback = oldCache ? legacyContextFrom(oldCache, id) : {};
        recovered = {
          ...recovered,
          ...(!recovered.animeId && fallback.animeId ? { animeId: fallback.animeId } : {}),
          ...(!recovered.geo && fallback.geo ? { geo: fallback.geo } : {}),
          ...(!recovered.name && fallback.name ? { name: fallback.name } : {}),
        };
      }
      contexts.set(id, recovered);
    }

    const workForContext = new Map<string, { key: string; detail: AtlasWorkDetail | null } | null>();
    const detailFor = async (context: LegacyContext) => {
      if (!context.animeId && !context.animeTitle && !context.animeTitleCn) return null;
      const contextKey = JSON.stringify(context);
      if (workForContext.has(contextKey)) return workForContext.get(contextKey) ?? null;
      const key = await resolveAtlasWork({
        bgmId: context.animeId,
        titleJa: context.animeTitle,
        title: context.animeTitleCn,
      }, workIndex.works);
      if (!key) {
        workForContext.set(contextKey, null);
        return null;
      }
      if (!workCache.has(key)) workCache.set(key, await atlas.work(key));
      const result = { key, detail: workCache.get(key) ?? null };
      workForContext.set(contextKey, result);
      return result;
    };

    const decisions = new Map<string, IdDecision>();
    for (const id of ids) {
      if (knownIds.has(id)) {
        decisions.set(id, { kind: 'atlas', targetId: id });
        continue;
      }
      const context = contexts.get(id) ?? {};
      const work = await detailFor(context);
      const explicitId = moved.moved[id];
      if (explicitId) {
        const explicitSpot = work?.detail?.spots.find((spot) => spot.id === explicitId);
        decisions.set(id, {
          kind: 'atlas',
          targetId: explicitId,
          ...(explicitSpot ? { spot: explicitSpot, workKey: work?.key } : {}),
        });
        continue;
      }
      if (!work?.detail || !context.geo) {
        decisions.set(id, { kind: 'legacy' });
        continue;
      }
      const target = rehomeNearestSpot(context.geo, work.detail.spots);
      decisions.set(id, target
        ? { kind: 'atlas', targetId: target.id, spot: target, workKey: work.key }
        : { kind: 'legacy' });
    }

    // Async preparation is complete. Reload and transform all live stores before
    // the first write; this synchronous section cannot yield to user interactions.
    const captures = loadCapturesV2Sync();
    const visited = loadVisitedAtSync();
    const intents = loadSpotIntentsSync();
    const nextCaptures = applyCaptureDecisions(captures, decisions);
    const { nextVisited, legacyVisited } = applyVisitedDecisions(visited, decisions);
    const nextIntents = applyIntentDecisions(intents, decisions, workIndex.works);
    const rehomedSpotIds = new Set(readMigrationJournal());
    for (const decision of decisions.values()) {
      if (decision.kind === 'atlas' && decision.spot) rehomedSpotIds.add(decision.targetId);
    }

    kvSet(LEGACY_MIGRATION_JOURNAL_KEY, JSON.stringify([...rehomedSpotIds]));
    kvSet(CAPTURES_STORAGE_KEY_V2, JSON.stringify(nextCaptures));
    invalidateCapturesCache();
    kvSet(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify(nextVisited));
    kvSet(VISITED_SPOTS_LEGACY_KEY, JSON.stringify(legacyVisited));
    kvSet(SPOT_INTENTS_STORAGE_KEY_V2, JSON.stringify(nextIntents));
    await cache.deleteByPrefix(LEGACY_POINTS_PREFIX);
    await cache.deleteByPrefix(LEGACY_DETAIL_PREFIX);
    await legacyDbHandle.execAsync('DROP TABLE IF EXISTS pilgrimage_spots');
    await legacyDbHandle.execAsync('DROP TABLE IF EXISTS anitabi_spots');
    kvSet(LEGACY_MIGRATION_DONE_KEY, 'done');
    kvRemove(LEGACY_MIGRATION_JOURNAL_KEY);
    return 'migrated';
  } catch (error) {
    console.warn('[LegacyMigration] postponed; records will retry next launch', error);
    return 'postponed';
  }
}

function applyCaptureDecisions(
  source: CapturesIndexV2,
  decisions: Map<string, IdDecision>
): CapturesIndexV2 {
  const spots: CapturesIndexV2['spots'] = {};
  for (const [id, list] of Object.entries(source.spots)) {
    const decision = decisions.get(id);
    const targetId = decision?.kind === 'atlas' ? decision.targetId : id;
    for (const capture of list) {
      const next = decision?.kind === 'legacy'
        ? markCaptureLegacy(capture)
        : decision?.kind === 'atlas' && decision.spot
          ? rehomeCapture(capture, decision.spot)
          : decision?.kind === 'atlas' && decision.targetId !== id
            ? rekeyCapture(capture, decision.targetId)
          : capture;
      (spots[targetId] ??= []).push(next);
    }
  }
  for (const [id, list] of Object.entries(spots)) {
    const seen = new Set<string>();
    spots[id] = list
      .sort((a, b) => b.capturedAt - a.capturedAt)
      .filter((capture) => !seen.has(capture.uri) && !!seen.add(capture.uri));
  }
  return { spots, free: source.free };
}

function applyVisitedDecisions(
  source: VisitedAtMap,
  decisions: Map<string, IdDecision>
): { nextVisited: VisitedAtMap; legacyVisited: string[] } {
  const nextVisited: VisitedAtMap = {};
  const legacy = new Set(loadLegacyVisitedSpotIdsSync());
  for (const [id, stamp] of Object.entries(source)) {
    const decision = decisions.get(id);
    const targetId = decision?.kind === 'atlas' ? decision.targetId : id;
    nextVisited[targetId] = targetId in nextVisited
      ? Math.min(nextVisited[targetId], stamp)
      : stamp;
    if (decision?.kind === 'atlas') legacy.delete(id);
    else if (decision?.kind === 'legacy') legacy.add(id);
  }
  return { nextVisited, legacyVisited: [...legacy] };
}

function applyIntentDecisions(
  source: SpotIntentMap,
  decisions: Map<string, IdDecision>,
  works: AtlasWorkIndex['works']
): SpotIntentMap {
  const next: SpotIntentMap = {};
  for (const [id, intent] of Object.entries(source)) {
    const decision = decisions.get(id);
    const targetId = decision?.kind === 'atlas' ? decision.targetId : id;
    const prior = next[targetId] ?? {};
    const merged: SpotIntent = {
      ...(prior.saved || intent.saved ? { saved: true } : {}),
      ...(prior.planned || intent.planned ? { planned: true } : {}),
      ...(decision?.kind !== 'atlas' && (prior.legacy || intent.legacy || decision?.kind === 'legacy')
        ? { legacy: true }
        : {}),
    };
    if (decision?.kind === 'atlas' && decision.spot) {
      const title = works.find((work) => work.key === decision.workKey)?.ja;
      const meta = atlasIntentMeta(intent.meta, decision.spot, decision.workKey, title);
      if (meta) merged.meta = meta;
    } else {
      const meta = decision?.kind === 'legacy' ||
        (decision?.kind === 'atlas' && decision.targetId !== id)
        ? withoutIntentImage(intent.meta)
        : intent.meta;
      if (meta ?? prior.meta) merged.meta = prior.meta ?? meta;
    }
    next[targetId] = merged;
  }
  return next;
}

function readMigrationJournal(): string[] {
  try {
    const parsed = JSON.parse(kvGet(LEGACY_MIGRATION_JOURNAL_KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rehomeCapture(capture: PilgrimageCapture, spot: AtlasSpot): PilgrimageCapture {
  const next: PilgrimageCapture = { ...capture, spotId: spot.id };
  delete next.legacy;
  delete next.spotImage;
  next.spotName = spot.name_ja;
  if (spot.location) next.spotGeo = [spot.location.lat, spot.location.lon];
  else delete next.spotGeo;
  const scene = spot.scenes[0];
  const episode = scene ? Number(scene.episode.match(/\d+/)?.[0]) : NaN;
  if (Number.isFinite(episode)) next.spotEp = episode;
  else delete next.spotEp;
  const second = scene?.time ? parseTime(scene.time) : null;
  if (second !== null) next.spotSecond = second;
  else delete next.spotSecond;
  return next;
}

function rekeyCapture(capture: PilgrimageCapture, targetId: string): PilgrimageCapture {
  const next = { ...capture, spotId: targetId };
  delete next.legacy;
  delete next.spotImage;
  return next;
}

function markCaptureLegacy(capture: PilgrimageCapture): PilgrimageCapture {
  const next = { ...capture };
  delete next.spotImage;
  next.legacy = true;
  return next;
}

function parseTime(value: string): number | null {
  const match = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (match) return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : null;
}

function atlasIntentMeta(
  meta: SpotIntent['meta'],
  spot: AtlasSpot,
  workKey: string | null | undefined,
  workTitle: string | undefined
): SpotIntent['meta'] {
  if (!meta) return undefined;
  const base = { ...meta };
  delete base.image;
  const next = {
    ...base,
    workKey: workKey ?? meta.workKey,
    workTitle: workTitle ?? meta.workTitle,
    spotName: spot.name_ja,
    address: spot.address_ja,
  };
  if (spot.location) next.geo = [spot.location.lat, spot.location.lon];
  else delete next.geo;
  return next;
}

function withoutIntentImage(meta: SpotIntent['meta']): SpotIntent['meta'] {
  if (!meta) return undefined;
  const next = { ...meta };
  delete next.image;
  return next;
}

function addLegacyPoints(
  target: Map<string, LegacyContext>,
  animeId: number,
  points: LegacyPoint[]
): void {
  for (const raw of points) {
    const point = record(raw);
    if (!point || typeof point.id !== 'string') continue;
    const geo = readGeo(point.geo);
    const name = typeof point.name === 'string' ? point.name : undefined;
    if (!target.has(point.id)) {
      target.set(point.id, {
        animeId,
        ...(geo ? { geo } : {}),
        ...(name ? { name } : {}),
      });
    }
  }
}

function isMissingLegacyTable(error: unknown, tableName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return new RegExp(
    `no such table:\\s*${tableName}|${tableName}.*(?:does not exist|not found)`,
    'i'
  ).test(message);
}

async function readOldSpotCache(
  cache: Pick<typeof CacheService, 'getWithMeta'>,
  id: string
): Promise<unknown | null> {
  try {
    const entry = (await cache.getWithMeta<unknown>(
      `${LEGACY_DETAIL_PREFIX}${id}`,
      CACHE_GRACE_MS
    )) as CacheEntry<unknown> | null;
    return entry?.value ?? null;
  } catch {
    return null;
  }
}

function legacyContextFrom(value: unknown, spotId: string): LegacyContext {
  const root = record(value);
  if (!root) {
    const point = Array.isArray(value)
      ? value.map(record).find((item) => item?.id === spotId || item?.point_id === spotId)
      : null;
    if (!point) return {};
    const anime = record(point.anime) ?? record(point.bangumi) ?? record(point.subject);
    const animeId = finiteNumber(
      point.animeId ??
        point.anime_id ??
        point.bgmId ??
        point.bangumiId ??
        point.bangumi_id ??
        anime?.id
    );
    const geo = readGeo(point.geo ?? point.spotGeo ?? point.location ?? point.coordinates);
    return {
      ...(animeId ? { animeId } : {}),
      ...(geo ? { geo } : {}),
      ...(typeof point.name === 'string' ? { name: point.name } : {}),
    };
  }
  const point = findLegacyPoint(root, spotId) ?? root;
  const anime =
    record(point.anime) ??
    record(point.bangumi) ??
    record(point.subject) ??
    record(root.anime) ??
    record(root.bangumi) ??
    record(root.subject);
  const animeId = finiteNumber(
    point.animeId ??
      point.anime_id ??
      point.bgmId ??
      point.bangumiId ??
      point.bangumi_id ??
      root.animeId ??
      root.anime_id ??
      root.bgmId ??
      anime?.id
  );
  const geo = readGeo(
    point.geo ?? point.spotGeo ?? point.location ?? point.coordinates ?? root.geo
  );
  return {
    ...(animeId ? { animeId } : {}),
    ...(geo ? { geo } : {}),
    ...(typeof point.name === 'string' ? { name: point.name } : {}),
  };
}

function findLegacyPoint(
  root: Record<string, unknown>,
  spotId: string
): Record<string, unknown> | null {
  const lists = [root.points, root.spots, root.data];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const candidates = list.map(record).filter((item): item is Record<string, unknown> => !!item);
    const matching = candidates.find(
      (item) => String(item.id ?? item.point_id ?? item.spotId ?? '') === spotId
    );
    if (matching) return matching;
    if (candidates.length === 1) return candidates[0];
  }
  const nested = record(root.point) ?? record(root.spot);
  return nested;
}

function readGeo(value: unknown): LegacyGeo | undefined {
  if (Array.isArray(value) && value.length >= 2) {
    const first = finiteNumber(value[0]);
    const second = finiteNumber(value[1]);
    if (first !== undefined && second !== undefined) return [first, second];
  }
  const object = record(value);
  if (!object) return undefined;
  const lat = finiteNumber(object.lat ?? object.latitude);
  const lon = finiteNumber(object.lon ?? object.lng ?? object.longitude);
  return lat !== undefined && lon !== undefined ? [lat, lon] : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value);
  return undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
