// Frame match scoring — pure math, no Skia (see frame-match.ts for the loader).
//
// Does the user's photo actually look like the anime reference frame? The
// first version compared whole-frame statistics (luminance histogram, total
// edge density, brightness/contrast). Any two outdoor photos share those, so
// a waterfall scored 91% against a train station: a number that looked
// measured and meant nothing (CLAUDE.md Rule 8).
//
// Version 2 compares *where* things are. Both images are reduced to the same
// 16×16 grid of luminance and of edge strength, and each pair of grids is
// compared with Pearson correlation: sky-above-rooftops-left-of-a-pole lines
// up, an unrelated scene doesn't. Correlation ignores overall exposure and
// contrast, which legitimately differ between an anime still and a photo.

import type { SceneAnalysis } from './scene-analysis';

/** Bumped when the score's meaning changes; older stored scores are not shown. */
export const FRAME_MATCH_VERSION = 2;

export type FrameMatchReason = 'dark' | 'lowDetail' | 'lowContrast' | 'analysisFailed';

export interface FrameMatch {
  /** 0..1, correlation of the luminance layout (where light and dark sit). */
  layout: number | null;
  /** 0..1, correlation of where edges and detail sit. */
  edge: number | null;
  /** 0..1, brightness + contrast similarity (a modifier; day/night drift is legitimate). */
  lighting: number | null;
  /** 0..1, weighted total. Capped at 0.10 when validity gate trips. */
  total: number | null;
  /**
   * False when the user shot looks "obviously broken" (lens covered, completely
   * flat, no detail). UI must surface a red banner instead of letting the
   * (capped) score look like a real match.
   */
  valid: boolean;
  /** Why the validity gate tripped, or null when valid. */
  reason: FrameMatchReason | null;
}

/** User-image features below these thresholds trigger the validity gate. */
export const DARK_BRIGHTNESS_FLOOR = 0.05;
export const LOW_DETAIL_EDGE_FLOOR = 0.03;
export const LOW_CONTRAST_FLOOR = 0.05;

/**
 * Structure decides the score (layout + edge = 1); lighting only scales it by
 * up to 15%, so similar exposure can never make unrelated frames "match".
 */
export const FRAME_MATCH_WEIGHTS = { layout: 0.6, edge: 0.4, lighting: 0.15 };

/** Cap applied to `total` when the validity gate trips. */
export const INVALID_MAX_TOTAL = 0.1;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * Pearson correlation of two equal-length grids, or null when either is flat
 * (no variation means no structure to compare).
 */
export function gridCorrelation(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= n;
  meanB /= n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA < 1e-9 || varB < 1e-9) return null;
  const r = cov / Math.sqrt(varA * varB);
  return Number.isFinite(r) ? r : null;
}

/**
 * Pure scoring step — given two analyses, compute the frame-match score.
 * Negative correlation (inverted layout) counts as no match, not a penalty.
 */
export function scoreFrameMatch(ref: SceneAnalysis, user: SceneAnalysis): FrameMatch {
  const layout = clamp01(gridCorrelation(ref.layoutGrid, user.layoutGrid) ?? 0);
  const edge = clamp01(gridCorrelation(ref.edgeGrid, user.edgeGrid) ?? 0);

  // Lighting — soft signal. Brightness and contrast are both 0..1.
  const dBright = Math.abs(ref.brightness - user.brightness);
  const dContrast = Math.abs(ref.contrast - user.contrast);
  const lighting = clamp01(1 - 0.5 * dBright - 0.5 * dContrast);

  const structure = layout * FRAME_MATCH_WEIGHTS.layout + edge * FRAME_MATCH_WEIGHTS.edge;
  let total = clamp01(
    structure * (1 - FRAME_MATCH_WEIGHTS.lighting + FRAME_MATCH_WEIGHTS.lighting * lighting)
  );

  // Validity gate — only the user image is inspected (reference is, by
  // construction, a real frame). Order: dark → lowDetail → lowContrast so the
  // banner picks the most actionable explanation.
  let valid = true;
  let reason: FrameMatchReason | null = null;
  if (user.brightness < DARK_BRIGHTNESS_FLOOR) {
    valid = false;
    reason = 'dark';
  } else if (user.edgeMagnitude < LOW_DETAIL_EDGE_FLOOR) {
    valid = false;
    reason = 'lowDetail';
  } else if (user.contrast < LOW_CONTRAST_FLOOR) {
    valid = false;
    reason = 'lowContrast';
  }

  if (!valid) total = Math.min(total, INVALID_MAX_TOTAL);

  return { layout, edge, lighting, total, valid, reason };
}
