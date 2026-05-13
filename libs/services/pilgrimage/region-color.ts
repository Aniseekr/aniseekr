/**
 * Stable per-city color palette. Used to tint markers, cluster bubbles, and
 * the region chip on AnimePilgrimageCard so the same "Tokyo is orange, Kyoto
 * is cyan" mapping holds whether the user is looking at the card list or the
 * map. Hash-based on city name so we don't have to maintain a lookup table —
 * a city always lands on the same swatch across mounts.
 *
 * Brand-pure hues (not theme-derived) on purpose: region identity is part of
 * the content, not a chrome surface that should repaint with the user's
 * accent.
 */
const CITY_PALETTE: readonly string[] = [
  '#FF9F0A', // primary orange
  '#22D3EE', // cyan
  '#BF5AF2', // purple
  '#34D399', // emerald
  '#F472B6', // pink
  '#FBBF24', // amber
  '#60A5FA', // blue
  '#A3E635', // lime
];

export function cityToColor(city: string | null | undefined, fallback: string): string {
  const trimmed = (city ?? '').trim();
  if (!trimmed) return fallback;
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = ((hash << 5) - hash + trimmed.charCodeAt(i)) | 0;
  }
  return CITY_PALETTE[Math.abs(hash) % CITY_PALETTE.length];
}
