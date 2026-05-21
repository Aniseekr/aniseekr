// Decides which downstream analysis pipelines may run on a captured photo
// based on which physical lens produced it.
//
// Why this exists: the compare-screen analysis (frame-match, HDR composite,
// scene-analyzer histogram) assumes the captured frame and the reference
// frame share the SAME optical signature — same field of view, same lens
// distortion, comparable noise floor. The reference frame is always the
// wide-angle anime still. If the user captures on the ultra-wide standalone
// (because they tapped the dial's 0.5 island) or a telephoto sibling, the
// optical signature differs enough that cross-lens analysis surfaces
// meaningless deltas: "you're 30% darker than the reference" might just be
// the ultra-wide's lower lens transmission.
//
// Per CLAUDE.md Rule 8: never show analysis results that pretend to know
// something they don't. When the lens doesn't match the reference, the
// gate switches every analysis off and surfaces a localized banner so the
// user understands why the analytics card is missing.
//
// Back-compat: when `lensType` is `undefined` (every iOS capture, every
// pre-cohort Android capture) the gate is permissive — analysis runs as
// before. Only Android captures explicitly stamped with a non-wide lens
// trip the gate. This keeps the existing flow working unchanged.

import type { EnginePhoto, EnginePhysicalLensType } from '../../../components/pilgrimage/camera/camera-engine';

interface LensRecord {
  lensType?: EnginePhysicalLensType;
}

export interface CaptureAnalysisGate {
  readonly allowHdrComposite: boolean;
  readonly allowFrameMatch: boolean;
  readonly allowSceneAnalysis: boolean;
  /** Localized banner string for the camera HUD, or null when no banner is
   *  needed (wide-angle / unknown). */
  readonly bannerMessage: string | null;
}

const ULTRA_WIDE_BANNER = '已切換到超廣角鏡頭 — 構圖比對僅限主鏡頭';
const TELEPHOTO_BANNER = '已切換到望遠鏡頭 — 構圖比對僅限主鏡頭';

/**
 * Returns `true` when the photo was captured on the wide-angle lens
 * (the analysis baseline) OR when the lens identity is unknown (back-compat).
 * Returns `false` only when the engine explicitly tagged the capture as
 * ultra-wide or telephoto.
 */
export function capturedOnWideAngle(photo: LensRecord | EnginePhoto): boolean {
  const lens = photo.lensType;
  return lens === undefined || lens === 'wide-angle';
}

/**
 * Derives the per-capture analysis policy from the photo's lens tag.
 * Callers pass the EnginePhoto returned by `takePhoto` straight in; the
 * gate object's booleans describe which pipelines may run.
 */
export function captureAnalysisGate(photo: LensRecord | EnginePhoto): CaptureAnalysisGate {
  if (capturedOnWideAngle(photo)) {
    return {
      allowHdrComposite: true,
      allowFrameMatch: true,
      allowSceneAnalysis: true,
      bannerMessage: null,
    };
  }
  const lens = photo.lensType;
  return {
    allowHdrComposite: false,
    allowFrameMatch: false,
    allowSceneAnalysis: false,
    bannerMessage: lens === 'telephoto' ? TELEPHOTO_BANNER : ULTRA_WIDE_BANNER,
  };
}
