// Aspect helpers for the share pipeline. The captured `width/height` is the
// orientation truth carried from capture → preview → share → ShareCard. These
// pure helpers turn that truth into (a) a sensible default share ratio and
// (b) a per-cell `contentFit`, so a portrait shot dropped into a landscape
// cell letterboxes (`contain`) instead of being cropped (`cover`). The anime
// reference image is NOT routed through this — it always uses `cover`.

import type { ShareRatio } from '../../../components/pilgrimage/ShareCard';

export type ShotOrientation = 'portrait' | 'landscape' | 'square' | 'unknown';

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Classify a shot's orientation from its real pixel dimensions. */
export function shotOrientation(
  width: number | null | undefined,
  height: number | null | undefined
): ShotOrientation {
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) return 'unknown';
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * Default share ratio for a freshly opened share screen. Portrait shots open
 * on the 9:16 "story" ratio so the whole frame fits; everything else (and the
 * unknown case) opens on the square "feed" ratio. The user can still change it.
 */
export function shareRatioForShot(
  width: number | null | undefined,
  height: number | null | undefined
): ShareRatio {
  return shotOrientation(width, height) === 'portrait' ? '9:16' : '1:1';
}

function orientationFromAspect(aspect: number | null | undefined): ShotOrientation {
  if (!isPositiveFinite(aspect)) return 'unknown';
  if (aspect > 1) return 'landscape';
  if (aspect < 1) return 'portrait';
  return 'square';
}

/**
 * `contentFit` for the user-shot cell: `contain` (letterbox, no crop) when the
 * shot and the cell have different orientations, otherwise `cover` (fill). When
 * either aspect is unknown we fall back to `cover` — we never invent a
 * letterbox we can't justify. `square` matches every orientation (no crop risk
 * either way), so it stays `cover`.
 */
export function shotContentFitForCell(
  shotAspect: number | null | undefined,
  cellAspect: number | null | undefined
): 'cover' | 'contain' {
  const shot = orientationFromAspect(shotAspect);
  const cell = orientationFromAspect(cellAspect);
  if (shot === 'unknown' || cell === 'unknown') return 'cover';
  if (shot === 'square' || cell === 'square') return 'cover';
  return shot === cell ? 'cover' : 'contain';
}
