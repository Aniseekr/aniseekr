// The stored record of one downloaded offline trip pack, and how it reads
// against the live Atlas dataVersion.

export const PACK_MANIFEST_VERSION = 1;

export interface PackManifest {
  v: typeof PACK_MANIFEST_VERSION;
  workKey: string;
  /** Display title at download time (Japanese Atlas title). */
  title: string;
  /** Atlas dataVersion of the stored work JSON. */
  dataVersion: string;
  /** Epoch ms when the download finished. */
  downloadedAt: number;
  spotCount: number;
  tileCount: number;
  /** Bytes on disk for this pack (work JSON + its tiles). */
  bytes: number;
  /** 'partial' when the 50 MB per-download cap stopped the tile download. */
  mapCoverage: 'full' | 'partial' | 'none';
}

export type PackRuntime =
  | { phase: 'downloading'; done: number; total: number; bytes: number }
  | { phase: 'failed'; error: string };

export type PackStatus =
  | { kind: 'none' }
  | { kind: 'ready'; manifest: PackManifest }
  | { kind: 'update-available'; manifest: PackManifest; latestDataVersion: string }
  | {
      kind: 'downloading';
      progress: Extract<PackRuntime, { phase: 'downloading' }>;
      manifest: PackManifest | null;
    }
  | { kind: 'failed'; error: string; manifest: PackManifest | null };

const COVERAGES = new Set(['full', 'partial', 'none']);

export function parsePackManifest(value: unknown): PackManifest | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.v !== PACK_MANIFEST_VERSION) return null;
  if (!nonEmpty(v.workKey) || !nonEmpty(v.dataVersion) || typeof v.title !== 'string') return null;
  if (!count(v.downloadedAt) || v.downloadedAt === 0) return null;
  if (!count(v.spotCount) || !count(v.tileCount) || !count(v.bytes)) return null;
  if (typeof v.mapCoverage !== 'string' || !COVERAGES.has(v.mapCoverage)) return null;
  return {
    v: PACK_MANIFEST_VERSION,
    workKey: v.workKey,
    title: v.title,
    dataVersion: v.dataVersion,
    downloadedAt: v.downloadedAt,
    spotCount: v.spotCount,
    tileCount: v.tileCount,
    bytes: v.bytes,
    mapCoverage: v.mapCoverage as PackManifest['mapCoverage'],
  };
}

/**
 * `latestDataVersion` is the Atlas meta version when it is known; null means
 * we could not check (offline), so the copy is shown as what it is — a dated
 * offline copy — without claiming it is current or outdated.
 */
export function packStatus(
  manifest: PackManifest | null,
  latestDataVersion: string | null,
  runtime: PackRuntime | null
): PackStatus {
  if (runtime?.phase === 'downloading') return { kind: 'downloading', progress: runtime, manifest };
  if (runtime?.phase === 'failed') return { kind: 'failed', error: runtime.error, manifest };
  if (!manifest) return { kind: 'none' };
  if (latestDataVersion && latestDataVersion !== manifest.dataVersion) {
    return { kind: 'update-available', manifest, latestDataVersion };
  }
  return { kind: 'ready', manifest };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function count(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
