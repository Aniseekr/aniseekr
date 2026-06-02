export interface SubjectCompositeTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotationRad: number;
  flipScaleX: -1 | 1;
}

export interface SubjectCompositePlanInput {
  photoWidth: number;
  photoHeight: number;
  previewWidth: number;
  previewHeight: number;
  subjectWidth: number;
  subjectHeight: number;
  opacity: number;
  transform: SubjectCompositeTransform;
}

export interface SubjectCompositePlan {
  srcRect: { x: number; y: number; width: number; height: number };
  dstRect: { x: number; y: number; width: number; height: number };
  centerX: number;
  centerY: number;
  translateX: number;
  translateY: number;
  scale: number;
  rotationDeg: number;
  flipScaleX: -1 | 1;
  opacity: number;
}

export interface SubjectCompositeGateInput {
  mode: string;
  enabled: boolean;
  subjectReady: boolean;
}

function validPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundLayout(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function fitContainRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { x: number; y: number; width: number; height: number } | null {
  if (
    !validPositive(sourceWidth) ||
    !validPositive(sourceHeight) ||
    !validPositive(targetWidth) ||
    !validPositive(targetHeight)
  ) {
    return null;
  }
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: roundLayout((targetWidth - width) / 2),
    y: roundLayout((targetHeight - height) / 2),
    width: roundLayout(width),
    height: roundLayout(height),
  };
}

export function shouldCompositeSubjectOverlay(input: SubjectCompositeGateInput): boolean {
  return input.mode === 'subject' && input.enabled && input.subjectReady;
}

export function resolveSubjectCompositePlan(
  input: SubjectCompositePlanInput
): SubjectCompositePlan | null {
  if (
    !validPositive(input.photoWidth) ||
    !validPositive(input.photoHeight) ||
    !validPositive(input.previewWidth) ||
    !validPositive(input.previewHeight) ||
    !validPositive(input.subjectWidth) ||
    !validPositive(input.subjectHeight)
  ) {
    return null;
  }

  // VisionCamera renders the live preview "cover": the photo is scaled to FILL
  // the winW×winH preview (overflow cropped), centered. So the visible photo
  // region is (previewW×previewH) scaled by a single uniform factor
  // k = min(photoW/previewW, photoH/previewH), centered in the photo. Mapping the
  // overlay through that SAME transform (uniform k, not independent per-axis
  // ratios) is what makes the baked placement match what the user saw — any
  // pan/scale/rotate away from centre used to drift on the non-limiting axis.
  const k = Math.min(
    input.photoWidth / input.previewWidth,
    input.photoHeight / input.previewHeight
  );
  const visibleW = input.previewWidth * k;
  const visibleH = input.previewHeight * k;
  const fit = fitContainRect(input.subjectWidth, input.subjectHeight, visibleW, visibleH);
  if (!fit) return null;

  // The visible region is centred in the photo and fitContainRect centres the
  // subject within it, so the net dstRect is photo-centred.
  const dstRect = {
    x: roundLayout((input.photoWidth - fit.width) / 2),
    y: roundLayout((input.photoHeight - fit.height) / 2),
    width: fit.width,
    height: fit.height,
  };

  const scale = validPositive(input.transform.scale) ? input.transform.scale : 1;
  return {
    srcRect: { x: 0, y: 0, width: input.subjectWidth, height: input.subjectHeight },
    dstRect,
    centerX: input.photoWidth / 2,
    centerY: input.photoHeight / 2,
    translateX: input.transform.translateX * k,
    translateY: input.transform.translateY * k,
    scale,
    rotationDeg: roundLayout((input.transform.rotationRad * 180) / Math.PI),
    flipScaleX: input.transform.flipScaleX,
    opacity: clampUnit(input.opacity),
  };
}
