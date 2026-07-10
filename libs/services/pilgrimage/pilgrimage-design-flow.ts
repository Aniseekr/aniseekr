export type PilgrimageMapInitialMode = 'list' | 'map';
export interface PilgrimageMapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function resolvePilgrimageMapInitialMode(
  raw: string | string[] | null | undefined
): PilgrimageMapInitialMode {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'list' ? 'list' : 'map';
}

export function shouldLoadPilgrimageMapBounds(bounds: PilgrimageMapBounds): boolean {
  // Bounds queries hit the local offline index (getAnimeInBounds) / local
  // SQLite spot index — there's no third-party API to rate-limit, so the old
  // 4°×5° span gate (which permanently blocked the whole-Japan default view,
  // see spec 2026-07-03 §1.3) is gone. Only reject a malformed box.
  return (
    Number.isFinite(bounds.north) &&
    Number.isFinite(bounds.south) &&
    Number.isFinite(bounds.east) &&
    Number.isFinite(bounds.west) &&
    bounds.north >= bounds.south
  );
}
