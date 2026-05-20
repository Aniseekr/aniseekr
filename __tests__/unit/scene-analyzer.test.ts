// Tests for the scene-analyzer math used by `hooks/useSceneAnalyzer.ts`.
//
// The worklet wrapper isn't unit-testable without a full vision-camera
// runtime, but the histogram + hysteresis math lives in plain TypeScript at
// `libs/services/pilgrimage/scene-analyzer.ts` exactly so we can pin it here.

import { describe, expect, it } from 'bun:test';
import {
  advanceHysteresis,
  analyzeLumaHistogram,
  createHysteresisState,
  SCENE_HIGHLIGHT_CLIP_THRESHOLD,
  SCENE_HYSTERESIS_COUNT,
  SCENE_SHADOW_CLIP_THRESHOLD,
} from '../../libs/services/pilgrimage/scene-analyzer';

function fillLuma(value: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  out.fill(value);
  return out;
}

function mixedLuma({
  shadow,
  highlight,
  mid,
}: {
  shadow: number;
  highlight: number;
  mid: number;
}): Uint8Array {
  const out = new Uint8Array(shadow + highlight + mid);
  let i = 0;
  for (let k = 0; k < shadow; k++) out[i++] = 0;
  for (let k = 0; k < highlight; k++) out[i++] = 255;
  for (let k = 0; k < mid; k++) out[i++] = 128;
  return out;
}

describe('analyzeLumaHistogram', () => {
  it('reports zero clip on an empty buffer and does not recommend HDR', () => {
    const result = analyzeLumaHistogram(new Uint8Array(0));
    expect(result.shadowClip).toBe(0);
    expect(result.highlightClip).toBe(0);
    expect(result.needsHdr).toBe(false);
  });

  it('flags every pixel as shadow-clipped on an all-dark frame, but does not recommend HDR alone', () => {
    const result = analyzeLumaHistogram(fillLuma(0, 4096));
    expect(result.shadowClip).toBe(1);
    expect(result.highlightClip).toBe(0);
    // No highlight clipping → not a high-DR scene, just a dark scene.
    expect(result.needsHdr).toBe(false);
  });

  it('flags every pixel as highlight-clipped on an all-bright frame, but does not recommend HDR alone', () => {
    const result = analyzeLumaHistogram(fillLuma(255, 4096));
    expect(result.shadowClip).toBe(0);
    expect(result.highlightClip).toBe(1);
    expect(result.needsHdr).toBe(false);
  });

  it('reports zero clipping on a balanced mid-grey frame', () => {
    const result = analyzeLumaHistogram(fillLuma(128, 4096));
    expect(result.shadowClip).toBe(0);
    expect(result.highlightClip).toBe(0);
    expect(result.needsHdr).toBe(false);
  });

  it('recommends HDR on a real high-DR scene: deep shadow + clipped highlight', () => {
    // 12% shadow, 8% highlight, rest midtones — both exceed thresholds.
    const result = analyzeLumaHistogram(
      mixedLuma({ shadow: 120, highlight: 80, mid: 800 })
    );
    expect(result.shadowClip).toBeGreaterThan(0.08);
    expect(result.highlightClip).toBeGreaterThan(0.05);
    expect(result.needsHdr).toBe(true);
  });

  it('does NOT recommend HDR when only one tail clips', () => {
    // 12% shadow, 1% highlight — fails the highlight test.
    const shadowOnly = analyzeLumaHistogram(
      mixedLuma({ shadow: 120, highlight: 10, mid: 870 })
    );
    expect(shadowOnly.needsHdr).toBe(false);
    // 1% shadow, 8% highlight — fails the shadow test.
    const highlightOnly = analyzeLumaHistogram(
      mixedLuma({ shadow: 10, highlight: 80, mid: 910 })
    );
    expect(highlightOnly.needsHdr).toBe(false);
  });

  it('treats pixels EXACTLY at the threshold as not-clipped (strict inequality)', () => {
    // luma === SCENE_SHADOW_CLIP_THRESHOLD is NOT a shadow clip (< check).
    const exactly = new Uint8Array([
      SCENE_SHADOW_CLIP_THRESHOLD,
      SCENE_HIGHLIGHT_CLIP_THRESHOLD,
    ]);
    const result = analyzeLumaHistogram(exactly);
    expect(result.shadowClip).toBe(0);
    expect(result.highlightClip).toBe(0);
  });
});

describe('advanceHysteresis', () => {
  it('only flips after SCENE_HYSTERESIS_COUNT consecutive contrary observations', () => {
    const state = createHysteresisState(false);
    const flips: boolean[] = [];
    for (let i = 0; i < SCENE_HYSTERESIS_COUNT - 1; i++) {
      const r = advanceHysteresis(state, true);
      flips.push(r.flipped);
      expect(r.current).toBe(false);
    }
    // The Nth same-direction observation flips.
    const final = advanceHysteresis(state, true);
    expect(final.flipped).toBe(true);
    expect(final.current).toBe(true);
    // And no earlier observation flipped.
    expect(flips).toEqual(new Array(SCENE_HYSTERESIS_COUNT - 1).fill(false));
  });

  it('resets the streak when an observation matches the current value', () => {
    const state = createHysteresisState(false);
    advanceHysteresis(state, true); // pending=true, count=1
    advanceHysteresis(state, false); // matches current → reset
    const r = advanceHysteresis(state, true); // count=1 again, not flipping
    expect(r.flipped).toBe(false);
    expect(r.current).toBe(false);
    expect(state.agreeCount).toBe(1);
  });

  it('resets the streak when an observation flips direction mid-stream', () => {
    const state = createHysteresisState(false);
    advanceHysteresis(state, true); // pending=true, count=1
    advanceHysteresis(state, true); // count=2 (still need 3 to flip)
    // A contrary "true→false" then back to "true" should NOT skip to flip.
    // Here the new observation matches current(false) so the streak resets.
    const reset = advanceHysteresis(state, false);
    expect(reset.flipped).toBe(false);
    expect(state.agreeCount).toBe(0);
  });

  it('flips both ways: true→false also requires SCENE_HYSTERESIS_COUNT', () => {
    const state = createHysteresisState(true);
    for (let i = 0; i < SCENE_HYSTERESIS_COUNT - 1; i++) {
      const r = advanceHysteresis(state, false);
      expect(r.flipped).toBe(false);
      expect(r.current).toBe(true);
    }
    const final = advanceHysteresis(state, false);
    expect(final.flipped).toBe(true);
    expect(final.current).toBe(false);
  });
});
