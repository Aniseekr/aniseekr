// Offline trip packs (Pro): one work's Atlas JSON plus the OpenFreeMap tiles
// around its spots, stored under Documents/offline-packs so "Clear cache"
// never removes them. Manifests live in MMKV for a synchronous first frame.
//
// Layout (shared tiles are de-duplicated across packs):
//   offline-packs/works/<key>.json        { entry, detail } Atlas payload
//   offline-packs/works/<key>.tiles.json  tile keys this pack needs
//   offline-packs/tiles/<z>/<x>/<y>.pbf   vector tiles
//   offline-packs/glyphs/<font>/<range>.pbf, sprites/*, styles/<mode>.json
import { Directory, File, Paths } from 'expo-file-system';
import * as Application from 'expo-application';
import { kvGet, kvRemove, kvSet } from '../../storage/app-storage';
import { OFFLINE_PACKS_STORAGE_KEY } from '../../storage/keys';
import { Logger } from '../../../utils/logger';
import { atlasClient } from '../atlas/atlas-client';
import type { AtlasWork, AtlasWorkDetail } from '../atlas/types';
import { DEFAULT_MAP_STYLE_URLS } from '../map-source-prefs';
import { keyOf, planPackTiles, type TileId } from './pack-plan';
import {
  PACK_MANIFEST_VERSION,
  parsePackManifest,
  type PackManifest,
  type PackRuntime,
} from './pack-manifest';
import { downloadTiles } from './tile-download';
import {
  buildOfflineStyle,
  offlineFontDir,
  OFFLINE_GLYPH_RANGES,
  spriteName,
  styleFonts,
  type StyleLike,
} from './offline-style';

export type MapStyleMode = keyof typeof DEFAULT_MAP_STYLE_URLS;

export interface StoredPackWork {
  manifest: PackManifest;
  entry: AtlasWork;
  detail: AtlasWorkDetail;
}

export interface OfflinePackSnapshot {
  manifests: Readonly<Record<string, PackManifest>>;
  runtime: Readonly<Record<string, PackRuntime>>;
}

const PROGRESS_THROTTLE_MS = 250;

/** OpenFreeMap requires a User-Agent that identifies the app for offline downloads. */
function userAgent(): string {
  const version = Application.nativeApplicationVersion ?? 'dev';
  return `Aniseekr/${version} (offline trip pack; +https://aniseekr.moe)`;
}

function rootDir(): Directory {
  return new Directory(Paths.document, 'offline-packs');
}

function ensureDir(dir: Directory): Directory {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function loadManifests(): Record<string, PackManifest> {
  const raw = kvGet(OFFLINE_PACKS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, PackManifest> = {};
    for (const [key, value] of Object.entries(parsed ?? {})) {
      const manifest = parsePackManifest(value);
      if (manifest && manifest.workKey === key) out[key] = manifest;
    }
    return out;
  } catch {
    return {};
  }
}

class OfflinePackStore {
  private snapshot: OfflinePackSnapshot | null = null;
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private styleCache = new Map<MapStyleMode, string | null>();
  private createdDirs = new Set<string>();
  private bytesCache: number | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): OfflinePackSnapshot => {
    this.snapshot ??= { manifests: loadManifests(), runtime: {} };
    return this.snapshot;
  };

  hasAnyPack(): boolean {
    return Object.keys(this.getSnapshot().manifests).length > 0;
  }

  /**
   * Downloads (or updates) one work's pack. Packs download one at a time so
   * the 4-parallel-request limit holds across the whole app.
   */
  download(workKey: string): Promise<void> {
    if (this.getSnapshot().runtime[workKey]?.phase === 'downloading') return this.queue;
    this.setRuntime(workKey, { phase: 'downloading', done: 0, total: 0, bytes: 0 });
    const run = this.queue.then(() => this.runDownload(workKey));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async readWork(workKey: string): Promise<StoredPackWork | null> {
    const manifest = this.getSnapshot().manifests[workKey];
    if (!manifest) return null;
    try {
      const file = new File(rootDir(), 'works', `${workKey}.json`);
      if (!file.exists) return null;
      const doc = JSON.parse(await file.text()) as { entry?: AtlasWork; detail?: AtlasWorkDetail };
      if (!doc.entry || !doc.detail || !Array.isArray(doc.detail.spots)) return null;
      return { manifest, entry: doc.entry, detail: doc.detail };
    } catch (error) {
      Logger.warn('[OfflinePack] read failed', error);
      return null;
    }
  }

  /** file:// URL of the stored offline map style for `mode`, or null. Sync. */
  offlineStyleUri(mode: MapStyleMode): string | null {
    if (this.styleCache.has(mode)) return this.styleCache.get(mode) ?? null;
    let uri: string | null = null;
    try {
      const file = new File(rootDir(), 'styles', `${mode}.json`);
      if (file.exists) uri = file.uri;
    } catch (error) {
      Logger.warn('[OfflinePack] style lookup failed', error);
    }
    this.styleCache.set(mode, uri);
    return uri;
  }

  /** Bytes of everything under offline-packs (tiles, data, fonts, styles). */
  totalBytes(): number {
    if (this.bytesCache === null) {
      const root = rootDir();
      this.bytesCache = root.exists ? (root.size ?? 0) : 0;
    }
    return this.bytesCache;
  }

  async remove(workKey: string): Promise<void> {
    const manifests = { ...this.getSnapshot().manifests };
    if (!manifests[workKey]) return;
    delete manifests[workKey];
    const keep = new Set<string>();
    for (const key of Object.keys(manifests)) for (const t of this.readTileKeys(key)) keep.add(t);
    for (const t of this.readTileKeys(workKey)) {
      if (keep.has(t)) continue;
      const file = new File(rootDir(), 'tiles', `${t}.pbf`);
      if (file.exists) file.delete();
    }
    for (const name of [`${workKey}.json`, `${workKey}.tiles.json`]) {
      const file = new File(rootDir(), 'works', name);
      if (file.exists) file.delete();
    }
    if (Object.keys(manifests).length === 0) {
      const root = rootDir();
      if (root.exists) root.delete();
      this.styleCache.clear();
      this.createdDirs.clear();
      kvRemove(OFFLINE_PACKS_STORAGE_KEY);
    } else {
      kvSet(OFFLINE_PACKS_STORAGE_KEY, JSON.stringify(manifests));
    }
    const runtime = { ...this.getSnapshot().runtime };
    delete runtime[workKey];
    this.emit({ manifests, runtime });
  }

  private async runDownload(workKey: string): Promise<void> {
    try {
      const index = await atlasClient.works();
      const entry = index.works.find((w) => w.key === workKey);
      const detail = await atlasClient.work(workKey);
      if (!entry || !detail) throw new Error('Atlas work not found');

      const root = ensureDir(rootDir());
      ensureDir(new Directory(root, 'works'));
      const workJson = JSON.stringify({ entry, detail });
      await writeText(new File(root, 'works', `${workKey}.json`), workJson);

      const tileTemplate = await this.ensureStyleAssets(root);
      const plan = planPackTiles(
        detail.spots.map((s) => ({ lat: s.location?.lat ?? null, lon: s.location?.lon ?? null }))
      );
      await writeText(
        new File(root, 'works', `${workKey}.tiles.json`),
        JSON.stringify(plan.tiles.map(keyOf))
      );

      let lastEmit = 0;
      const result = await downloadTiles(plan.tiles, {
        fetchTile: (tile) => this.fetchTile(root, tileTemplate, tile),
        existingSize: (tile) => {
          const file = new File(root, 'tiles', `${keyOf(tile)}.pbf`);
          return file.exists ? file.size : null;
        },
        onProgress: ({ done, total, bytes }) => {
          const now = Date.now();
          if (done < total && now - lastEmit < PROGRESS_THROTTLE_MS) return;
          lastEmit = now;
          this.setRuntime(workKey, { phase: 'downloading', done, total, bytes });
        },
      });
      if (result.kind === 'failed') throw new Error(result.error);
      if (result.kind === 'cancelled') throw new Error('cancelled');

      const manifest: PackManifest = {
        v: PACK_MANIFEST_VERSION,
        workKey,
        title: detail.titleJa,
        dataVersion: detail.dataVersion,
        downloadedAt: Date.now(),
        spotCount: detail.spots.length,
        tileCount: result.downloaded,
        bytes: result.bytes + workJson.length,
        mapCoverage:
          plan.tiles.length === 0 ? 'none' : result.kind === 'partial' ? 'partial' : 'full',
      };
      const manifests = { ...this.getSnapshot().manifests, [workKey]: manifest };
      kvSet(OFFLINE_PACKS_STORAGE_KEY, JSON.stringify(manifests));
      const runtime = { ...this.getSnapshot().runtime };
      delete runtime[workKey];
      this.emit({ manifests, runtime });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.warn('[OfflinePack] download failed', workKey, message);
      this.setRuntime(workKey, { phase: 'failed', error: message });
      throw error;
    }
  }

  /**
   * Stores both map themes' styles, the sprite and the glyph ranges once, and
   * returns the vector tile URL template from the TileJSON.
   */
  private async ensureStyleAssets(root: Directory): Promise<string> {
    const headers = { 'User-Agent': userAgent() };
    ensureDir(new Directory(root, 'styles'));
    let tileTemplate: string | null = null;
    for (const mode of Object.keys(DEFAULT_MAP_STYLE_URLS) as MapStyleMode[]) {
      const online = (await fetchJson(DEFAULT_MAP_STYLE_URLS[mode], headers)) as StyleLike;
      if (!tileTemplate) {
        const vector = Object.values(online.sources).find((s) => s.type === 'vector');
        if (typeof vector?.url !== 'string') throw new Error('Map style has no vector source');
        const tileJson = (await fetchJson(vector.url, headers)) as { tiles?: string[] };
        tileTemplate = tileJson.tiles?.[0] ?? null;
        if (!tileTemplate) throw new Error('TileJSON has no tile URL');
      }
      const sprite = spriteName(online);
      if (sprite && typeof online.sprite === 'string') {
        const spriteDir = ensureDir(new Directory(root, 'sprites'));
        for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) {
          const file = new File(spriteDir, `${sprite}${suffix}`);
          if (!file.exists) await downloadTo(`${online.sprite}${suffix}`, file, headers);
        }
      }
      if (typeof online.glyphs === 'string') {
        for (const font of styleFonts(online)) {
          const fontDir = ensureDir(new Directory(root, 'glyphs', offlineFontDir(font)));
          for (const range of OFFLINE_GLYPH_RANGES) {
            const file = new File(fontDir, `${range}.pbf`);
            if (file.exists) continue;
            const url = online.glyphs
              .replace('{fontstack}', encodeURIComponent(font))
              .replace('{range}', range);
            // A missing range only drops those characters; it never blocks the pack.
            await downloadTo(url, file, headers).catch((e: unknown) =>
              Logger.warn('[OfflinePack] glyph skipped', url, e)
            );
          }
        }
      }
      await writeText(
        new File(root, 'styles', `${mode}.json`),
        JSON.stringify(buildOfflineStyle(online, root.uri.replace(/\/$/, '')))
      );
      this.styleCache.delete(mode);
    }
    return tileTemplate as string;
  }

  private async fetchTile(root: Directory, template: string, tile: TileId): Promise<number> {
    const dir = new Directory(root, 'tiles', String(tile.z), String(tile.x));
    if (!this.createdDirs.has(dir.uri)) {
      ensureDir(dir);
      this.createdDirs.add(dir.uri);
    }
    const url = template
      .replace('{z}', String(tile.z))
      .replace('{x}', String(tile.x))
      .replace('{y}', String(tile.y));
    const file = new File(dir, `${tile.y}.pbf`);
    const headers = { 'User-Agent': userAgent() };
    try {
      await downloadTo(url, file, headers);
    } catch {
      await downloadTo(url, file, headers); // one retry for a transient blip
    }
    return new File(dir, `${tile.y}.pbf`).size;
  }

  private readTileKeys(workKey: string): string[] {
    try {
      const file = new File(rootDir(), 'works', `${workKey}.tiles.json`);
      if (!file.exists) return [];
      const keys = JSON.parse(file.textSync()) as unknown;
      return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }

  private setRuntime(workKey: string, runtime: PackRuntime) {
    const snap = this.getSnapshot();
    this.emit({ manifests: snap.manifests, runtime: { ...snap.runtime, [workKey]: runtime } });
  }

  private emit(next: OfflinePackSnapshot) {
    if (next.manifests !== this.snapshot?.manifests) this.bytesCache = null;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
}

async function writeText(file: File, text: string) {
  if (!file.exists) file.create({ intermediates: true });
  await file.write(text);
}

async function downloadTo(url: string, file: File, headers: Record<string, string>) {
  await File.downloadFileAsync(url, file, { headers, idempotent: true });
}

export const offlinePackStore = new OfflinePackStore();
