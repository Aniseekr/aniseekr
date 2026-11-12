// Check-ins made before stamps existed carry no spot snapshot, so they cannot
// be grouped by work or placed on the footprint map. This looks the missing
// facts up in Atlas. Whatever Atlas cannot answer stays unknown — never guessed.
import { atlasClient, atlasSpotShardOf } from './atlas/atlas-client';
import type { AtlasSpotShard, AtlasWorkDetail } from './atlas/types';
import type { StampDetailMap, StampMeta } from './stamp-details';
import { fillStampMeta, loadStampDetailsSync, loadVisitedAtSync } from './visited-prefs';

const STAMP_STOP_PREFIX = 'locality:stamp-stop-role:';

export interface StampBackfillClient {
  spotShard(shard: string): Promise<AtlasSpotShard>;
  work(key: string): Promise<AtlasWorkDetail | null>;
}

/** Visited spots whose snapshot is missing, or lacks the municipality. */
export function stampsNeedingMeta(
  visitedAt: Readonly<Record<string, number>>,
  details: Readonly<StampDetailMap>
): string[] {
  return Object.keys(visitedAt).filter(
    (id) => !id.startsWith(STAMP_STOP_PREFIX) && !details[id]?.meta?.muniCd
  );
}

export async function resolveStampMeta(
  ids: readonly string[],
  known: Readonly<StampDetailMap>,
  client: StampBackfillClient
): Promise<Record<string, StampMeta>> {
  const found: Record<string, StampMeta> = {};
  for (const id of ids) {
    const meta = known[id]?.meta;
    if (meta) found[id] = meta;
  }
  const byShard = new Map<string, string[]>();
  for (const id of ids) {
    if (found[id]) continue;
    const shard = atlasSpotShardOf(id);
    byShard.set(shard, [...(byShard.get(shard) ?? []), id]);
  }
  for (const [shard, shardIds] of byShard) {
    const rows = await client.spotShard(shard).then((s) => s.rows).catch(() => null);
    if (!rows) continue;
    for (const id of shardIds) {
      const row = rows[id];
      if (row) found[id] = { workKey: row[1], name: row[2], lat: row[3], lon: row[4] };
    }
  }
  const works = new Set(Object.values(found).filter((m) => !m.muniCd).map((m) => m.workKey));
  for (const key of works) {
    const detail = await client.work(key).catch(() => null);
    if (!detail) continue;
    for (const spot of detail.spots) {
      const meta = found[spot.id];
      if (meta && !meta.muniCd && spot.location?.muniCd) {
        found[spot.id] = { ...meta, muniCd: spot.location.muniCd };
      }
    }
  }
  return found;
}

let running: Promise<number> | null = null;

/** Fills what Atlas knows; resolves to how many snapshots were written. One run at a time. */
export function backfillStampMeta(): Promise<number> {
  running ??= (async () => {
    const details = loadStampDetailsSync();
    const ids = stampsNeedingMeta(loadVisitedAtSync(), details);
    if (ids.length === 0) return 0;
    const metas = await resolveStampMeta(ids, details, atlasClient);
    return fillStampMeta(metas);
  })().finally(() => {
    running = null;
  });
  return running;
}
