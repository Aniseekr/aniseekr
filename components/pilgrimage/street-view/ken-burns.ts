export interface MapillaryKenBurnsMotionInput {
  isPano: boolean;
  width: number;
  reducedMotion: boolean;
}

export interface MapillaryKenBurnsMotion {
  shouldAnimate: boolean;
  fromScale: number;
  toScale: number;
  fromTranslateX: number;
  toTranslateX: number;
  durationMs: number;
  imageWidthMultiplier: number;
}

const FROM_SCALE = 1.05;
const TO_SCALE = 1.12;
const STANDARD_SHIFT_RATIO = 0.04;
const PANO_SHIFT_RATIO = 0.16;
const PANO_WIDTH_MULTIPLIER = 1.32;
const STANDARD_DURATION_MS = 18_000;
const PANO_DURATION_MS = 24_000;

export function resolveMapillaryKenBurnsMotion({
  isPano,
  width,
  reducedMotion,
}: MapillaryKenBurnsMotionInput): MapillaryKenBurnsMotion {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const shift = Math.round(safeWidth * (isPano ? PANO_SHIFT_RATIO : STANDARD_SHIFT_RATIO));
  const imageWidthMultiplier = isPano ? PANO_WIDTH_MULTIPLIER : 1;

  if (reducedMotion) {
    return {
      shouldAnimate: false,
      fromScale: FROM_SCALE,
      toScale: FROM_SCALE,
      fromTranslateX: 0,
      toTranslateX: 0,
      durationMs: 0,
      imageWidthMultiplier,
    };
  }

  return {
    shouldAnimate: true,
    fromScale: FROM_SCALE,
    toScale: TO_SCALE,
    fromTranslateX: -shift,
    toTranslateX: shift,
    durationMs: isPano ? PANO_DURATION_MS : STANDARD_DURATION_MS,
    imageWidthMultiplier,
  };
}
