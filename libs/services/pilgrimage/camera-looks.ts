// Camera film looks. Each look is one 4×5 colour matrix (RGBA rows, the fifth
// column an offset in 0..1). The same matrix tints the live preview (a GPU
// colour filter on the preview layer) and grades the saved JPEG, so what you
// see is what gets saved. A matrix can't do curves, grain or vignettes; the
// set is picked to stay inside what a matrix does well: saturation, contrast,
// white balance and lifted blacks.

export type CameraLookId = 'original' | 'film-warm' | 'mono' | 'cool-dusk' | 'faded-cel' | 'summer';

export type ColorMatrix = readonly number[];

interface LookRecipe {
  saturation: number;
  contrast: number;
  gain: readonly [number, number, number];
  offset: readonly [number, number, number];
}

export interface CameraLook {
  id: CameraLookId;
  /** Free users get these; the rest need Pro. */
  free: boolean;
  /** Full-strength matrix; null for the original (no filter). */
  matrix: ColorMatrix | null;
}

const IDENTITY: ColorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

// Rec. 709 luma: what "grey" means for saturation and mono.
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/** saturation → contrast (pivot 0.5) → per-channel gain → offset. */
function recipeMatrix({ saturation: s, contrast: c, gain, offset }: LookRecipe): ColorMatrix {
  const m: number[] = [];
  for (let row = 0; row < 3; row += 1) {
    const g = gain[row]!;
    for (let col = 0; col < 3; col += 1) {
      const sat = (1 - s) * LUMA[col]! + (row === col ? s : 0);
      m.push(g * c * sat);
    }
    m.push(0, g * (0.5 - 0.5 * c) + offset[row]!);
  }
  m.push(0, 0, 0, 1, 0);
  return m;
}

export const CAMERA_LOOKS: readonly CameraLook[] = [
  { id: 'original', free: true, matrix: null },
  {
    id: 'film-warm',
    free: true,
    matrix: recipeMatrix({
      saturation: 0.95,
      contrast: 1.05,
      gain: [1.06, 1.0, 0.88],
      offset: [0.02, 0.01, 0],
    }),
  },
  {
    id: 'mono',
    free: true,
    matrix: recipeMatrix({ saturation: 0, contrast: 1.12, gain: [1, 1, 1], offset: [0, 0, 0] }),
  },
  {
    id: 'cool-dusk',
    free: false,
    matrix: recipeMatrix({
      saturation: 0.9,
      contrast: 1.04,
      gain: [0.92, 0.98, 1.08],
      offset: [0, 0.01, 0.04],
    }),
  },
  {
    id: 'faded-cel',
    free: false,
    matrix: recipeMatrix({
      saturation: 0.8,
      contrast: 0.84,
      gain: [1, 1, 1],
      offset: [0.05, 0.05, 0.06],
    }),
  },
  {
    id: 'summer',
    free: false,
    matrix: recipeMatrix({
      saturation: 1.25,
      contrast: 1.18,
      gain: [1.02, 1.02, 0.97],
      offset: [0, 0, 0],
    }),
  },
];

export const DEFAULT_LOOK_INTENSITY = 1;

export function isCameraLookId(value: unknown): value is CameraLookId {
  return typeof value === 'string' && CAMERA_LOOKS.some((look) => look.id === value);
}

export function getCameraLook(id: CameraLookId): CameraLook {
  return CAMERA_LOOKS.find((look) => look.id === id) ?? CAMERA_LOOKS[0]!;
}

/**
 * The look the camera actually uses: a Pro look falls back to the original once
 * Pro is gone, and free users always shoot at full strength.
 */
export function resolveActiveLook(
  id: CameraLookId,
  intensity: number,
  isPro: boolean
): { look: CameraLook; intensity: number } {
  const look = getCameraLook(id);
  if (!look.free && !isPro) return { look: CAMERA_LOOKS[0]!, intensity: DEFAULT_LOOK_INTENSITY };
  return { look, intensity: isPro ? clampIntensity(intensity) : DEFAULT_LOOK_INTENSITY };
}

export function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOOK_INTENSITY;
  return Math.max(0, Math.min(1, value));
}

/**
 * The matrix at a given strength: identity + t·(look − identity). Both matrices
 * are affine, so this equals blending the original and fully graded pixels.
 * Null means "no filter" (original, or zero strength).
 */
export function lookMatrixAt(look: CameraLook, intensity: number): ColorMatrix | null {
  if (!look.matrix) return null;
  const t = clampIntensity(intensity);
  if (t === 0) return null;
  return look.matrix.map((v, i) => IDENTITY[i]! + t * (v - IDENTITY[i]!));
}
