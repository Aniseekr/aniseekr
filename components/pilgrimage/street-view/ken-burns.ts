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
const STANDARD_SHIFT_RATIO = 0.02;
const PANO_SHIFT_RATIO = 0.16;
const PANO_WIDTH_MULTIPLIER = 1.32;
const STANDARD_DURATION_MS = 18_000;
const PANO_DURATION_MS = 24_000;

// The scaled, shifted image must always cover the card. Transforms compose
// scale∘translate, so at progress 0 (minimum scale, maximum offset) the
// constraint is |translateX| ≤ imageWidth/2 − cardWidth/(2·FROM_SCALE).
function maxSafeShift(width: number, imageWidthMultiplier: number): number {
  return Math.floor(width * (imageWidthMultiplier / 2 - 1 / (2 * FROM_SCALE)));
}

export function resolveMapillaryKenBurnsMotion({
  isPano,
  width,
  reducedMotion,
}: MapillaryKenBurnsMotionInput): MapillaryKenBurnsMotion {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const imageWidthMultiplier = isPano ? PANO_WIDTH_MULTIPLIER : 1;
  const desiredShift = Math.round(safeWidth * (isPano ? PANO_SHIFT_RATIO : STANDARD_SHIFT_RATIO));
  const shift = Math.max(0, Math.min(desiredShift, maxSafeShift(safeWidth, imageWidthMultiplier)));

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
