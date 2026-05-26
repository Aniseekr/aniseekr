// Track B of the composer pipeline plan (docs/superpowers/plans/2026-05-26-composer-pipeline.md):
//   #4 — Photo filter presets (Skia ColorMatrix)
//   #5 — Auto color match (used by Track C, the math lives here so the helper
//        stays self-contained)
//   #7 — Center-crop region for expo-image-manipulator
//
// Everything here is pure math. The Skia / image-manipulator integrations
// consume these outputs in the components/screens layer.

// ----- ColorMatrix presets (#4) -----

export type FilterPresetId =
  | 'none'
  | 'cinematic'
  | 'soft'
  | 'anime'
  | 'contrast'
  | 'warm'
  | 'cool';

export type FilterPreset = {
  id: FilterPresetId;
  label: string;
  hint: string;
  matrix: number[]; // 4×5 row-major (Skia convention)
};

/**
 * 4×5 row-major identity matrix. The last column is the additive bias
 * (offset) so the matrix can shift channels as well as scale them.
 */
export const IDENTITY_COLOR_MATRIX: number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

// Matrices were tuned by hand against a 24-patch macbeth-style swatch under
// daylight. Stay light-handed — at intensity 1 they should look "applied"
// but never crush highlights or shadows past usable.
const CINEMATIC_MATRIX = [
  1.10, 0.05, -0.05, 0, -8,
  -0.02, 1.05, 0.02, 0, -4,
  -0.05, 0.05, 1.10, 0, 6,
  0, 0, 0, 1, 0,
];

const SOFT_MATRIX = [
  0.95, 0.02, 0.02, 0, 12,
  0.02, 0.95, 0.02, 0, 12,
  0.02, 0.02, 0.95, 0, 12,
  0, 0, 0, 1, 0,
];

const ANIME_MATRIX = [
  1.15, -0.05, -0.05, 0, 4,
  -0.05, 1.15, -0.05, 0, 4,
  -0.05, -0.05, 1.20, 0, 6,
  0, 0, 0, 1, 0,
];

const CONTRAST_MATRIX = [
  1.30, 0, 0, 0, -32,
  0, 1.30, 0, 0, -32,
  0, 0, 1.30, 0, -32,
  0, 0, 0, 1, 0,
];

const WARM_MATRIX = [
  1.10, 0, 0, 0, 6,
  0, 1.02, 0, 0, 2,
  0, 0, 0.90, 0, -6,
  0, 0, 0, 1, 0,
];

const COOL_MATRIX = [
  0.90, 0, 0, 0, -6,
  0, 0.98, 0, 0, 0,
  0, 0, 1.12, 0, 8,
  0, 0, 0, 1, 0,
];

export const FILTER_PRESETS: FilterPreset[] = [
  { id: 'none', label: 'Original', hint: 'No filter', matrix: IDENTITY_COLOR_MATRIX },
  { id: 'cinematic', label: 'Cinematic', hint: 'Teal/orange', matrix: CINEMATIC_MATRIX },
  { id: 'soft', label: 'Soft', hint: 'Lifted shadows', matrix: SOFT_MATRIX },
  { id: 'anime', label: 'Anime', hint: 'Punchy + cool', matrix: ANIME_MATRIX },
  { id: 'contrast', label: 'Contrast', hint: 'Crunchy', matrix: CONTRAST_MATRIX },
  { id: 'warm', label: 'Warm', hint: 'Golden hour', matrix: WARM_MATRIX },
  { id: 'cool', label: 'Cool', hint: 'Overcast', matrix: COOL_MATRIX },
];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function getFilterMatrix(id: FilterPresetId, intensity: number): number[] {
  const preset = FILTER_PRESETS.find((p) => p.id === id);
  if (!preset) return IDENTITY_COLOR_MATRIX;
  if (id === 'none') return IDENTITY_COLOR_MATRIX;
  return blendColorMatrix(preset.matrix, intensity);
}

/**
 * Linearly interpolate between the identity matrix and `target` by `t`.
 * t is clamped to [0, 1]. At 0 the user sees the unaltered image, at 1
 * they see the full preset.
 */
export function blendColorMatrix(target: number[], t: number): number[] {
  const clamped = clamp(t, 0, 1);
  if (clamped === 0) return IDENTITY_COLOR_MATRIX.slice();
  if (clamped === 1) return target.slice();
  const out = new Array<number>(20);
  for (let i = 0; i < 20; i++) {
    out[i] = IDENTITY_COLOR_MATRIX[i] + (target[i] - IDENTITY_COLOR_MATRIX[i]) * clamped;
  }
  return out;
}

// ----- Auto color match (#5) -----

export type RgbMean = { r: number; g: number; b: number };

/**
 * Per-channel gain clamp. Without this, a near-black user photo would push
 * the gain into the hundreds — burning highlights and saturating noise.
 * 3× covers a 1.5-stop correction which is the most we want auto-mode to do.
 */
const AUTO_GAIN_MIN = 0.5;
const AUTO_GAIN_MAX = 3.0;

/**
 * Build a 4×5 ColorMatrix that nudges `user` toward `ref` per channel.
 * Refuses to render anything if either side is missing — we'd rather show
 * the user the original than apply a guess.
 */
export function applyAutoColorMatrix(
  ref: RgbMean | null | undefined,
  user: RgbMean | null | undefined
): number[] {
  if (!ref || !user) return IDENTITY_COLOR_MATRIX.slice();
  const r = clamp(safeGain(ref.r, user.r), AUTO_GAIN_MIN, AUTO_GAIN_MAX);
  const g = clamp(safeGain(ref.g, user.g), AUTO_GAIN_MIN, AUTO_GAIN_MAX);
  const b = clamp(safeGain(ref.b, user.b), AUTO_GAIN_MIN, AUTO_GAIN_MAX);
  return [
    r, 0, 0, 0, 0,
    0, g, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

function safeGain(refValue: number, userValue: number): number {
  if (!Number.isFinite(userValue) || userValue <= 0) return 1;
  if (!Number.isFinite(refValue) || refValue <= 0) return 1;
  return refValue / userValue;
}

// ----- Crop region (#7) -----

export type CropAspectId = 'free' | 'square' | 'portrait' | 'landscape' | 'matchReference';

export type CropRegion = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

/**
 * Resolve a crop aspect ratio. `null` means "no crop" — leave the image
 * untouched. `matchReference` returns null if the reference dimensions are
 * missing so the caller can fall back gracefully (no hidden default).
 */
export function resolveCropAspect(
  id: CropAspectId,
  refW: number,
  refH: number
): number | null {
  if (id === 'free') return null;
  if (id === 'square') return 1;
  if (id === 'portrait') return 9 / 16;
  if (id === 'landscape') return 16 / 9;
  // matchReference
  if (!Number.isFinite(refW) || !Number.isFinite(refH) || refW <= 0 || refH <= 0) return null;
  return refW / refH;
}

/**
 * Compute a center-cropped region (x/y/w/h in source pixels) for an image
 * of `srcW × srcH` so that the output matches the target aspect. Passing
 * `aspect = null` is a no-op (full image).
 */
export function centerCropRegion(srcW: number, srcH: number, aspect: number | null): CropRegion {
  if (srcW <= 0 || srcH <= 0) throw new Error('share-filters: srcW/srcH must be positive');
  if (aspect == null) return { originX: 0, originY: 0, width: srcW, height: srcH };
  if (aspect <= 0) throw new Error('share-filters: aspect must be positive');
  const srcAspect = srcW / srcH;
  if (srcAspect > aspect) {
    // Source is wider than target — clip width.
    const width = srcH * aspect;
    return { originX: (srcW - width) / 2, originY: 0, width, height: srcH };
  }
  // Source is taller than (or matches) target — clip height.
  const height = srcW / aspect;
  return { originX: 0, originY: (srcH - height) / 2, width: srcW, height };
}

/**
 * Translate a pan offset (in viewport pixels, where (0,0) means image
 * centered in frame) into a source-pixel crop region. Used by the
 * interactive CropSheet so the math lives in test-friendly code rather
 * than the gesture handler.
 *
 * Assumes the image is displayed at the cover scale of `frame` — i.e. the
 * larger of (frame.w / image.w, frame.h / image.h).
 */
export function panToCropRegion(
  image: { w: number; h: number },
  frame: { w: number; h: number },
  pan: { x: number; y: number }
): CropRegion {
  if (image.w <= 0 || image.h <= 0) {
    throw new Error('share-filters: image dimensions must be positive');
  }
  if (frame.w <= 0 || frame.h <= 0) {
    throw new Error('share-filters: frame dimensions must be positive');
  }
  const scale = Math.max(frame.w / image.w, frame.h / image.h);
  const cropW = Math.min(image.w, frame.w / scale);
  const cropH = Math.min(image.h, frame.h / scale);
  const rawX = image.w / 2 - pan.x / scale - cropW / 2;
  const rawY = image.h / 2 - pan.y / scale - cropH / 2;
  const originX = clamp(rawX, 0, image.w - cropW);
  const originY = clamp(rawY, 0, image.h - cropH);
  return { originX, originY, width: cropW, height: cropH };
}
