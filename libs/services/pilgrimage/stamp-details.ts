// What we know about a visited spot beyond "visited at": whether it was
// stamped on-site and how, plus a snapshot of the spot so stamp books and the
// footprint map work offline and across works. A visited spot with no detail
// is a manual note (補記) — that is what every pre-stamp check-in is.

export type StampVia = 'gps' | 'photo' | 'track';

export interface StampMeta {
  workKey: string;
  name: string;
  muniCd?: string;
  lat?: number;
  lon?: number;
}

export interface StampDetail {
  /** Epoch ms the user was proven to be at the spot. Absent = manual note. */
  onsiteAt?: number;
  via?: StampVia;
  meta?: StampMeta;
}

export type StampDetailMap = Record<string, StampDetail>;

export interface Stamp {
  spotId: string;
  /** Epoch ms of the first check-in; 0 when unknown (migrated). */
  at: number;
  /** null = manual note. */
  onsiteAt: number | null;
  via: StampVia | null;
  meta: StampMeta | null;
}

const VIAS = new Set<string>(['gps', 'photo', 'track']);
const STAMP_STOP_PREFIX = 'locality:stamp-stop-role:';

function sanitizeMeta(value: unknown): StampMeta | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const m = value as Record<string, unknown>;
  if (typeof m.workKey !== 'string' || !m.workKey || typeof m.name !== 'string') return undefined;
  const meta: StampMeta = { workKey: m.workKey, name: m.name };
  if (typeof m.muniCd === 'string' && m.muniCd) meta.muniCd = m.muniCd;
  if (typeof m.lat === 'number' && typeof m.lon === 'number' && Number.isFinite(m.lat + m.lon)) {
    meta.lat = m.lat;
    meta.lon = m.lon;
  }
  return meta;
}

export function sanitizeStampDetails(parsed: unknown): StampDetailMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: StampDetailMap = {};
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const detail: StampDetail = {};
    if (typeof v.onsiteAt === 'number' && Number.isFinite(v.onsiteAt) && v.onsiteAt > 0) {
      detail.onsiteAt = v.onsiteAt;
      if (typeof v.via === 'string' && VIAS.has(v.via)) detail.via = v.via as StampVia;
    }
    const meta = sanitizeMeta(v.meta);
    if (meta) detail.meta = meta;
    if (detail.onsiteAt !== undefined || detail.meta) out[id] = detail;
  }
  return out;
}

/** Joins the visited map with its details. Official rally stops are not spot stamps. */
export function buildStamps(
  visitedAt: Readonly<Record<string, number>>,
  details: Readonly<StampDetailMap>
): Stamp[] {
  const stamps: Stamp[] = [];
  for (const [spotId, at] of Object.entries(visitedAt)) {
    if (spotId.startsWith(STAMP_STOP_PREFIX)) continue;
    const detail = details[spotId];
    stamps.push({
      spotId,
      at,
      onsiteAt: detail?.onsiteAt ?? null,
      via: detail?.onsiteAt ? (detail.via ?? null) : null,
      meta: detail?.meta ?? null,
    });
  }
  return stamps;
}

/**
 * The detail after a check-in. An on-site proof upgrades a manual note and is
 * never downgraded or re-dated by a later check-in; meta is filled once.
 */
export function applyCheckIn(
  existing: StampDetail | undefined,
  input: { onsiteAt?: number; via?: StampVia; meta?: StampMeta }
): StampDetail | undefined {
  const next: StampDetail = { ...existing };
  if (input.onsiteAt !== undefined && next.onsiteAt === undefined) {
    next.onsiteAt = input.onsiteAt;
    next.via = input.via;
  }
  if (input.meta && (!next.meta || (!next.meta.muniCd && input.meta.muniCd))) next.meta = input.meta;
  return next.onsiteAt !== undefined || next.meta ? next : undefined;
}

/**
 * Restoring a backup must never lose a stamp: every spot in either side stays,
 * the earlier known check-in time wins (0 = unknown loses to a real time), an
 * on-site proof beats a manual note and the earlier proof is kept.
 */
export function mergeStampRecords(
  local: { visitedAt: Readonly<Record<string, number>>; details: Readonly<StampDetailMap> },
  incoming: { visitedAt: Readonly<Record<string, number>>; details: Readonly<StampDetailMap> }
): { visitedAt: Record<string, number>; details: StampDetailMap } {
  const visitedAt: Record<string, number> = { ...local.visitedAt };
  for (const [id, at] of Object.entries(incoming.visitedAt)) {
    const mine = visitedAt[id];
    if (mine === undefined || mine === 0 || (at > 0 && at < mine)) visitedAt[id] = at;
  }
  const details: StampDetailMap = {};
  for (const id of Object.keys(visitedAt)) {
    const a = local.details[id];
    const b = incoming.details[id];
    const proof = [a, b]
      .filter((d): d is StampDetail => d?.onsiteAt !== undefined)
      .sort((x, y) => (x.onsiteAt as number) - (y.onsiteAt as number))[0];
    const meta = a?.meta?.muniCd ? a.meta : (b?.meta?.muniCd ? b.meta : (a?.meta ?? b?.meta));
    const detail: StampDetail = {};
    if (proof) {
      detail.onsiteAt = proof.onsiteAt;
      if (proof.via) detail.via = proof.via;
    }
    if (meta) detail.meta = meta;
    if (detail.onsiteAt !== undefined || detail.meta) details[id] = detail;
  }
  return { visitedAt, details };
}
