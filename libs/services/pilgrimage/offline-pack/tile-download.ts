// Bounded tile downloader for offline trip packs. Enforces the OpenFreeMap
// offline terms that the planner cannot: at most 4 parallel requests and at
// most 50 MB per download (see pack-plan.ts).
import { PACK_LIMITS, type TileId } from './pack-plan';

/**
 * Space held back for every in-flight request so the running total can never
 * cross the cap. OpenMapTiles z14 tiles stay well under this (the densest
 * central-Tokyo sample was 400 KB).
 */
const IN_FLIGHT_RESERVE_BYTES = 1_000_000;

export type TileDownloadResult =
  | { kind: 'complete'; bytes: number; downloaded: number }
  | { kind: 'partial'; bytes: number; downloaded: number }
  | { kind: 'failed'; error: string }
  | { kind: 'cancelled' };

export interface TileDownloadOptions {
  /** Downloads one tile to disk; resolves to its byte size. */
  fetchTile: (tile: TileId) => Promise<number>;
  /** Byte size of a tile already on disk, or null. Lets retries resume. */
  existingSize: (tile: TileId) => number | null;
  maxBytes?: number;
  onProgress?: (progress: { done: number; total: number; bytes: number }) => void;
  isCancelled?: () => boolean;
}

export async function downloadTiles(
  tiles: readonly TileId[],
  options: TileDownloadOptions
): Promise<TileDownloadResult> {
  const maxBytes = options.maxBytes ?? PACK_LIMITS.maxBytes;
  let bytes = 0;
  let done = 0;
  let next = 0;
  let inFlight = 0;
  let error: string | null = null;
  let capped = false;

  const report = () => options.onProgress?.({ done, total: tiles.length, bytes });

  // Tiles already on disk (a resumed download) count first and cost no request.
  const pending: TileId[] = [];
  for (const tile of tiles) {
    const size = options.existingSize(tile);
    if (size === null) pending.push(tile);
    else {
      bytes += size;
      done += 1;
    }
  }
  report();

  const canStart = () =>
    error === null &&
    !options.isCancelled?.() &&
    bytes + (inFlight + 1) * IN_FLIGHT_RESERVE_BYTES <= maxBytes;

  await new Promise<void>((resolve) => {
    const pump = () => {
      while (next < pending.length && inFlight < PACK_LIMITS.maxParallel && canStart()) {
        const tile = pending[next];
        next += 1;
        inFlight += 1;
        options
          .fetchTile(tile)
          .then((size) => {
            bytes += size;
            done += 1;
            report();
          })
          .catch((e: unknown) => {
            error ??= e instanceof Error ? e.message : String(e);
          })
          .finally(() => {
            inFlight -= 1;
            pump();
          });
      }
      if (inFlight === 0) {
        if (next < pending.length && error === null && !options.isCancelled?.()) capped = true;
        resolve();
      }
    };
    pump();
  });

  if (options.isCancelled?.()) return { kind: 'cancelled' };
  if (error !== null) return { kind: 'failed', error };
  if (capped) return { kind: 'partial', bytes, downloaded: done };
  return { kind: 'complete', bytes, downloaded: done };
}
