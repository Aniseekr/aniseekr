// Shared coordinate guards for the street-view stack. Kept here (not in a
// generic geo util) because the validity rules — finite, in-range — are the
// contract every street-view entry point enforces before touching cache keys
// or provider URLs.

export function isFiniteCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}
