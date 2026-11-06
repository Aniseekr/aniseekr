export interface TargetLocation {
  latitude: number;
  longitude: number;
}

function toCoordinate(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Spot coordinates from route params. Spots without geo arrive as '' — and
 * `Number('')` is 0, which silently aimed the alignment HUD at (0, 0). Blank or
 * non-numeric input is an unknown target instead.
 */
export function resolveTargetLocation(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined
): TargetLocation | null {
  const latitude = toCoordinate(lat);
  const longitude = toCoordinate(lng);
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}
