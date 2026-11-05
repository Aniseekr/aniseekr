import { describe, expect, it } from 'bun:test';
import {
  PACK_LIMITS,
  planPackTiles,
  tileAt,
} from '../../../libs/services/pilgrimage/offline-pack/pack-plan';
import {
  PACK_MANIFEST_VERSION,
  packStatus,
  parsePackManifest,
  type PackManifest,
} from '../../../libs/services/pilgrimage/offline-pack/pack-manifest';
import { downloadTiles } from '../../../libs/services/pilgrimage/offline-pack/tile-download';
import {
  buildOfflineStyle,
  offlineFontDir,
} from '../../../libs/services/pilgrimage/offline-pack/offline-style';

function spreadSpots(count: number) {
  // A grid across Honshu: worst case for a pack (many far-apart spots).
  return Array.from({ length: count }, (_, i) => ({
    lat: 33 + (i % 20) * 0.35,
    lon: 130 + Math.floor(i / 20) * 0.6,
  }));
}

const manifest: PackManifest = {
  v: PACK_MANIFEST_VERSION,
  workKey: 'hyouka',
  title: '氷菓',
  dataVersion: '20261104-6584d5e',
  downloadedAt: 1_793_836_800_000,
  spotCount: 44,
  tileCount: 420,
  bytes: 12_000_000,
  mapCoverage: 'full',
};

describe('offline trip pack tile plan', () => {
  it('PILG-106 stays inside the OpenFreeMap per-download tile limit for any spot count', () => {
    for (const count of [1, 44, 244, 600]) {
      const plan = planPackTiles(spreadSpots(count));
      expect(plan.tiles.length).toBeLessThanOrEqual(PACK_LIMITS.maxTiles);
      expect(new Set(plan.tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(plan.tiles.length);
    }
  });

  it('PILG-106 always keeps the street-level tile under every located spot, low zooms first', () => {
    const spots = spreadSpots(600);
    const plan = planPackTiles(spots);
    const keys = new Set(plan.tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    for (const spot of spots) {
      const t = tileAt(spot.lat, spot.lon, 14);
      expect(keys.has(`14/${t.x}/${t.y}`)).toBe(true);
    }
    const zooms = plan.tiles.map((t) => t.z);
    expect(zooms).toEqual([...zooms].sort((a, b) => a - b));
    expect(Math.max(...zooms)).toBe(14);
  });

  it('PILG-107 ignores spots without usable coordinates', () => {
    const plan = planPackTiles([
      { lat: null, lon: null },
      { lat: Number.NaN, lon: 135 },
      { lat: 95, lon: 135 },
      { lat: 0, lon: 0 },
    ]);
    expect(plan.tiles).toEqual([]);
    expect(plan.locatedSpots).toBe(0);

    const one = planPackTiles([{ lat: 36.1408, lon: 137.2522 }, { lat: null, lon: 1 }]);
    expect(one.locatedSpots).toBe(1);
    for (const t of one.tiles) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** t.z);
      expect(t.y).toBeLessThan(2 ** t.z);
    }
  });
});

describe('offline trip pack manifest', () => {
  it('PILG-108 parses a stored manifest and rejects malformed or foreign versions', () => {
    expect(parsePackManifest(JSON.parse(JSON.stringify(manifest)))).toEqual(manifest);
    expect(parsePackManifest(null)).toBeNull();
    expect(parsePackManifest({ ...manifest, v: 999 })).toBeNull();
    expect(parsePackManifest({ ...manifest, dataVersion: '' })).toBeNull();
    expect(parsePackManifest({ ...manifest, downloadedAt: 'yesterday' })).toBeNull();
    expect(parsePackManifest({ ...manifest, mapCoverage: 'most' })).toBeNull();
  });

  it('PILG-109 offers an update only when Atlas reports a different dataVersion', () => {
    expect(packStatus(null, null, null)).toEqual({ kind: 'none' });
    expect(packStatus(manifest, manifest.dataVersion, null)).toEqual({ kind: 'ready', manifest });
    // Unknown latest version (offline): never claim the copy is current or outdated.
    expect(packStatus(manifest, null, null)).toEqual({ kind: 'ready', manifest });
    expect(packStatus(manifest, '20261201-abc', null)).toEqual({
      kind: 'update-available',
      manifest,
      latestDataVersion: '20261201-abc',
    });
  });

  it('PILG-109 an active download or failure wins over the stored copy, which stays usable', () => {
    const downloading = { phase: 'downloading' as const, done: 3, total: 10, bytes: 100 };
    expect(packStatus(manifest, '20261201-abc', downloading)).toEqual({
      kind: 'downloading',
      progress: downloading,
      manifest,
    });
    expect(packStatus(null, null, { phase: 'failed', error: 'network' })).toEqual({
      kind: 'failed',
      error: 'network',
      manifest: null,
    });
  });
});

describe('offline trip pack tile download', () => {
  const tiles = Array.from({ length: 40 }, (_, i) => ({ z: 14, x: i, y: 0 }));

  it('PILG-110 never runs more than four tile requests at once', async () => {
    let active = 0;
    let peak = 0;
    const result = await downloadTiles(tiles, {
      fetchTile: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 1));
        active -= 1;
        return 1000;
      },
      existingSize: () => null,
    });
    expect(peak).toBeLessThanOrEqual(PACK_LIMITS.maxParallel);
    expect(peak).toBeGreaterThan(1);
    expect(result).toEqual({ kind: 'complete', bytes: 40_000, downloaded: 40 });
  });

  it('PILG-110 stops before the per-download byte cap and reports partial coverage', async () => {
    const result = await downloadTiles(tiles, {
      fetchTile: async () => 400_000,
      existingSize: () => null,
      maxBytes: 4_000_000,
    });
    expect(result.kind).toBe('partial');
    if (result.kind !== 'partial') return;
    expect(result.bytes).toBeLessThanOrEqual(4_000_000);
    expect(result.downloaded).toBeLessThan(tiles.length);
  });

  it('PILG-110 resumes by skipping tiles already on disk and fails honestly on network errors', async () => {
    const fetched: number[] = [];
    const resumed = await downloadTiles(tiles.slice(0, 4), {
      fetchTile: async (t) => {
        fetched.push(t.x);
        return 10;
      },
      existingSize: (t) => (t.x < 2 ? 5 : null),
    });
    expect(fetched.sort()).toEqual([2, 3]);
    expect(resumed).toEqual({ kind: 'complete', bytes: 30, downloaded: 4 });

    let calls = 0;
    const failed = await downloadTiles(tiles, {
      fetchTile: async () => {
        calls += 1;
        throw new Error('Network request failed');
      },
      existingSize: () => null,
    });
    expect(failed).toEqual({ kind: 'failed', error: 'Network request failed' });
    expect(calls).toBeLessThan(tiles.length);
  });
});

describe('offline trip pack map style', () => {
  const online = {
    version: 8,
    sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      ne2_shaded: {
        type: 'raster',
        tiles: ['https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png'],
      },
      openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    },
    layers: [
      { id: 'background', type: 'background' },
      { id: 'ne2', type: 'raster', source: 'ne2_shaded' },
      {
        id: 'place',
        type: 'symbol',
        source: 'openmaptiles',
        layout: { 'text-font': ['Noto Sans Regular'], 'text-field': '{name}' },
      },
    ],
  };

  it('PILG-111 rewrites every remote resource to the on-device pack', () => {
    const style = buildOfflineStyle(online, 'file:///docs/offline-packs');
    expect(JSON.stringify(style)).not.toMatch(/https?:/);
    expect(style.sources).toEqual({
      openmaptiles: expect.objectContaining({
        type: 'vector',
        tiles: ['file:///docs/offline-packs/tiles/{z}/{x}/{y}.pbf'],
        maxzoom: 14,
      }),
    });
    expect(style.layers.map((l) => l.id)).toEqual(['background', 'place']);
    expect(style.layers[1].layout?.['text-font']).toEqual([offlineFontDir('Noto Sans Regular')]);
    expect(offlineFontDir('Noto Sans Regular')).not.toContain(' ');
    expect(style.glyphs).toBe('file:///docs/offline-packs/glyphs/{fontstack}/{range}.pbf');
    expect(style.sprite).toBe('file:///docs/offline-packs/sprites/ofm');
  });
});

describe('offline trip pack repository fallback', () => {
  const row = {
    key: 'hyouka',
    ja: '氷菓',
    en: 'Hyouka',
    mal: [12189],
    bgm: [27364],
    n: 1,
    conf: { c: 1, s: 0, u: 0 },
    cities: ['21203'],
  };
  const detail = {
    dataVersion: manifest.dataVersion,
    franchiseKey: 'hyouka',
    titleJa: '氷菓',
    spots: [
      {
        id: 'spot-1',
        name_ja: '高山駅',
        address_ja: '岐阜県高山市',
        note_ja: '',
        confidence: 'confirmed',
        location: { lat: 36.1408, lon: 137.2522 },
        scenes: [{ episode: '1' }],
        sources: [],
      },
    ],
  };
  const pack = { readWork: async (key: string) => (key === 'hyouka' ? { manifest, entry: row, detail } : null) };
  const offline = {
    works: async () => ({ works: [row] }),
    work: async () => {
      throw new Error('Network request failed');
    },
  };

  async function repo(client: unknown, offlinePacks: unknown) {
    const { PilgrimageRepository } = await import(
      '../../../libs/services/pilgrimage/pilgrimage-repository'
    );
    return new PilgrimageRepository({ client, offlinePacks } as never);
  }

  it('PILG-112 serves the stored pack, labelled with its download date, when Atlas is unreachable', async () => {
    const r = await repo(offline, pack);
    const work = await r.getSpotsByKey('hyouka');
    expect(work?.spots.map((s) => s.name)).toEqual(['高山駅']);
    expect(work?.offlineCopy).toEqual({ downloadedAt: manifest.downloadedAt });
    const viaIds = await r.getSpotsForAnime({ bangumiId: 27364 });
    expect(viaIds?.offlineCopy).toEqual({ downloadedAt: manifest.downloadedAt });
  });

  it('PILG-112 never labels live Atlas data as an offline copy', async () => {
    const r = await repo({ works: offline.works, work: async () => detail }, pack);
    const work = await r.getSpotsByKey('hyouka');
    expect(work?.offlineCopy).toBeUndefined();
  });

  it('PILG-113 without a pack, an unreachable Atlas stays an error', async () => {
    const r = await repo(offline, { readWork: async () => null });
    await expect(r.getSpotsByKey('hyouka')).rejects.toThrow('Network request failed');
  });
});
