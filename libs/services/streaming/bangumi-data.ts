/**
 * bangumi-data (https://github.com/bangumi-data/bangumi-data) — the open,
 * community-maintained index of where each anime streams. For every title it
 * lists the real per-platform page id (巴哈姆特動畫瘋, Netflix, bilibili, …)
 * and, for most, that platform's own weekly release slot. We use it for:
 *
 *   1. Official "where to watch" links instead of a title search.
 *   2. Schedule times on the user's platform (巴哈 often drops hours or a day
 *      after the JP TV slot AniList reports).
 *
 * The 8 MB upstream file is downloaded from jsDelivr at most every
 * FRESHNESS_MS, compacted to AniList id → catalog-platform entries, and kept
 * on disk. Everything here degrades to "no data" — callers keep their
 * existing AniList-only behaviour when a title isn't indexed.
 */

// Legacy filesystem API, same as id-mapping-service (proven on device).
import * as FileSystem from 'expo-file-system/legacy';
import type { StreamingPlatformId } from './streaming-platforms';

// Pinned to the 0.3 major: the schema (items[].sites[], siteMeta) is stable
// within it. jsDelivr serves the latest 0.3.x, which upstream updates daily.
const DATA_URL = 'https://cdn.jsdelivr.net/npm/bangumi-data@0.3/dist/data.json';
const INDEX_FILENAME = 'bangumi-data-index.json';
const RAW_FILENAME = 'bangumi-data-raw.json';
const FRESHNESS_MS = 3 * 24 * 60 * 60 * 1000;
const INDEX_VERSION = 1;

/**
 * bangumi-data site key → our streaming catalog id. Earlier keys win when a
 * title lists several variants of one platform (TW region first: this index
 * matters most to zh-Hant users).
 */
const SITE_TO_PLATFORM: readonly (readonly [string, StreamingPlatformId])[] = [
  ['gamer', 'bahamut'],
  ['gamer_hk', 'bahamut'],
  ['netflix', 'netflix'],
  ['bilibili_tw', 'bilibili'],
  ['bilibili_hk_mo_tw', 'bilibili'],
  ['bilibili', 'bilibili'],
  ['muse_tw', 'muse-asia'],
  ['muse_hk', 'muse-asia'],
  ['crunchyroll', 'crunchyroll'],
  ['disneyplus', 'disneyplus'],
  ['prime', 'amazonprime'],
  ['abema', 'abema'],
  ['iqiyi', 'iqiyi'],
  ['youku', 'youku'],
  ['viu', 'viu'],
  ['youtube', 'youtube'],
];

export interface PlatformSite {
  platform: StreamingPlatformId;
  url: string;
  /** ISO-8601 repeating interval, e.g. `R/2026-10-14T16:30:00.000Z/P7D`. */
  broadcast?: string;
}

/** AniList id → one entry per catalog platform. */
export type BangumiDataIndex = Record<string, PlatformSite[]>;

interface RawSite {
  site: string;
  id?: string;
  url?: string;
  begin?: string;
  broadcast?: string;
}
interface RawItem {
  sites?: RawSite[];
}
interface RawData {
  siteMeta?: Record<string, { urlTemplate?: string }>;
  items?: RawItem[];
}

/** Compact the upstream file to the fields and platforms we actually use. */
export function compactBangumiData(raw: RawData): BangumiDataIndex {
  const meta = raw.siteMeta ?? {};
  const index: BangumiDataIndex = {};
  for (const item of raw.items ?? []) {
    const sites = item.sites ?? [];
    const anilistId = sites.find((s) => s.site === 'aniList')?.id;
    if (!anilistId) continue;
    const out: PlatformSite[] = [];
    const seen = new Set<StreamingPlatformId>();
    for (const [siteKey, platform] of SITE_TO_PLATFORM) {
      if (seen.has(platform)) continue;
      const site = sites.find((s) => s.site === siteKey);
      if (!site) continue;
      const template = meta[siteKey]?.urlTemplate;
      const url = site.url || (site.id && template ? template.replace('{{id}}', site.id) : '');
      if (!url) continue;
      seen.add(platform);
      // Per-site `broadcast` is the platform's own slot; `begin` alone means
      // a weekly cadence from that first release.
      const broadcast = site.broadcast || (site.begin ? `R/${site.begin}/P7D` : undefined);
      out.push(broadcast ? { platform, url, broadcast } : { platform, url });
    }
    if (out.length > 0) index[anilistId] = out;
  }
  return index;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse `R/<start>/P<n>D`. Anything else (one-off, monthly) → null. */
export function parseWeeklyBroadcast(
  broadcast: string | undefined
): { startMs: number; periodMs: number } | null {
  if (!broadcast) return null;
  const match = /^R\/([^/]+)\/P(\d+)D$/.exec(broadcast);
  if (!match) return null;
  const startMs = Date.parse(match[1]);
  const days = Number(match[2]);
  if (!Number.isFinite(startMs) || days !== 7) return null;
  return { startMs, periodMs: days * DAY_MS };
}

/**
 * When the platform releases the episode AniList says airs at `jpAiringAt`
 * (unix seconds). Simulcasts land from a few hours before (global drops) to a
 * few days after the JP slot, so we take the first platform slot no earlier
 * than one day before it. Returns null when the platform has no weekly slot,
 * or its run hasn't reached this week (a delayed or not-yet-started release —
 * we can't tell which episode it would be).
 */
export function platformAiringAt(broadcast: string | undefined, jpAiringAt: number): number | null {
  const slot = parseWeeklyBroadcast(broadcast);
  if (!slot) return null;
  const from = jpAiringAt * 1000 - DAY_MS;
  if (slot.startMs >= from + slot.periodMs) return null;
  const k = Math.max(0, Math.ceil((from - slot.startMs) / slot.periodMs));
  return Math.round((slot.startMs + k * slot.periodMs) / 1000);
}

// ── Runtime index ──────────────────────────────────────────────────────────

let index: BangumiDataIndex | null = null;
let version = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getPlatformSites(anilistId: string | number | null | undefined): PlatformSite[] {
  if (anilistId == null || !index) return [];
  return index[String(anilistId)] ?? [];
}

/** Bumps every time a new index is published; use as a memo dependency. */
export function getBangumiDataVersion(): number {
  return version;
}

export function subscribeBangumiData(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface StoredIndex {
  version: number;
  fetchedAt: number;
  index: BangumiDataIndex;
}

type LegacyFs = {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
  downloadAsync(url: string, dest: string): Promise<{ status: number }>;
  readAsStringAsync(path: string): Promise<string>;
  writeAsStringAsync(path: string, data: string): Promise<void>;
  getInfoAsync(path: string): Promise<{ exists: boolean }>;
  deleteAsync(path: string, opts?: { idempotent?: boolean }): Promise<void>;
};

function publish(next: BangumiDataIndex) {
  index = next;
  version += 1;
  for (const l of listeners) l();
}

async function readStored(fs: LegacyFs, path: string): Promise<StoredIndex | null> {
  try {
    if (!(await fs.getInfoAsync(path)).exists) return null;
    const parsed = JSON.parse(await fs.readAsStringAsync(path)) as StoredIndex;
    return parsed.version === INDEX_VERSION && parsed.index ? parsed : null;
  } catch {
    return null;
  }
}

async function download(fs: LegacyFs, indexPath: string): Promise<BangumiDataIndex> {
  const rawPath = `${fs.cacheDirectory}${RAW_FILENAME}`;
  try {
    const res = await fs.downloadAsync(DATA_URL, rawPath);
    if (res.status !== 200) throw new Error(`bangumi-data download failed: ${res.status}`);
    const compact = compactBangumiData(JSON.parse(await fs.readAsStringAsync(rawPath)) as RawData);
    if (Object.keys(compact).length === 0) throw new Error('bangumi-data: empty index');
    const stored: StoredIndex = { version: INDEX_VERSION, fetchedAt: Date.now(), index: compact };
    await fs.writeAsStringAsync(indexPath, JSON.stringify(stored));
    return compact;
  } finally {
    await fs.deleteAsync(rawPath, { idempotent: true }).catch(() => undefined);
  }
}

/**
 * Load the on-disk index (fast), then refresh it in the background when it is
 * older than FRESHNESS_MS. Safe to call repeatedly; never throws.
 */
export function ensureBangumiData(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const fs = FileSystem as unknown as LegacyFs;
    if (!fs.documentDirectory || !fs.cacheDirectory) return;
    const indexPath = `${fs.documentDirectory}${INDEX_FILENAME}`;
    const stored = await readStored(fs, indexPath);
    if (stored) publish(stored.index);
    if (stored && Date.now() - stored.fetchedAt < FRESHNESS_MS) return;
    try {
      publish(await download(fs, indexPath));
    } catch (error) {
      console.warn('[bangumi-data] refresh failed', error);
    }
  })().finally(() => {
    // Allow a later call to retry a failed first download.
    if (!index) loading = null;
  });
  return loading;
}
