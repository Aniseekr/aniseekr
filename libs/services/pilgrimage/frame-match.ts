// Frame match — does the user's captured photo actually look like the anime
// reference frame? Complements alignment-scoring.ts (which only tells us if
// the user stood in the right spot and faced the right direction). The scoring
// math lives in frame-match-score.ts (pure, testable without Skia); this file
// only decodes both images through the existing 64×64 Skia sampler.

import { scoreFrameMatch, type FrameMatch } from './frame-match-score';
import { analyzeImagePair } from './scene-analysis-skia';

export * from './frame-match-score';

/**
 * Compute the frame match between an anime reference URL and a captured photo
 * URI. Both images are decoded + downsampled to 64×64 via Skia.
 * Returns a `FrameMatch` whose fields are all null and `valid = false` if
 * either decode fails (CLAUDE.md Rule 8 — never invent a number on failure).
 */
export async function computeFrameMatch(
  refImageUrl: string,
  userShotUri: string
): Promise<FrameMatch> {
  // The shot is centre-cropped to the reference's aspect before sampling.
  const [ref, user] = await analyzeImagePair(refImageUrl, userShotUri);
  if (!ref || !user) {
    return {
      layout: null,
      edge: null,
      lighting: null,
      total: null,
      valid: false,
      reason: 'analysisFailed',
    };
  }
  return scoreFrameMatch(ref, user);
}
