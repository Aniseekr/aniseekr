import { describe, expect, it } from 'bun:test';
import {
  capturedOnWideAngle,
  captureAnalysisGate,
} from '../../../libs/services/pilgrimage/capture-lens-gate';

describe('capturedOnWideAngle', () => {
  it('returns true when lensType is exactly wide-angle', () => {
    expect(capturedOnWideAngle({ lensType: 'wide-angle' })).toBe(true);
  });

  it('returns true when lensType is undefined (legacy / unknown)', () => {
    // Pre-cohort callers and iOS captures may not surface lensType. We
    // optimistically treat unknown as "wide" so existing wide-only flows
    // keep working without any code changes.
    expect(capturedOnWideAngle({ lensType: undefined })).toBe(true);
    expect(capturedOnWideAngle({})).toBe(true);
  });

  it('returns false when lensType is ultra-wide-angle', () => {
    expect(capturedOnWideAngle({ lensType: 'ultra-wide-angle' })).toBe(false);
  });

  it('returns false when lensType is telephoto', () => {
    expect(capturedOnWideAngle({ lensType: 'telephoto' })).toBe(false);
  });
});

describe('captureAnalysisGate', () => {
  it('wide-angle capture allows every downstream analysis', () => {
    const gate = captureAnalysisGate({ lensType: 'wide-angle' });
    expect(gate.allowHdrComposite).toBe(true);
    expect(gate.allowFrameMatch).toBe(true);
    expect(gate.allowSceneAnalysis).toBe(true);
    expect(gate.bannerMessage).toBeNull();
  });

  it('ultra-wide capture skips HDR / frame-match / scene-analysis and emits a banner', () => {
    // Rule 8: ultra-wide capture has a different optical signature than the
    // reference shot (always wide). Cross-lens analysis would surface
    // meaningless deltas; we instead show the user a banner explaining why
    // the analytics card is missing.
    const gate = captureAnalysisGate({ lensType: 'ultra-wide-angle' });
    expect(gate.allowHdrComposite).toBe(false);
    expect(gate.allowFrameMatch).toBe(false);
    expect(gate.allowSceneAnalysis).toBe(false);
    expect(gate.bannerMessage).not.toBeNull();
    expect(gate.bannerMessage).toMatch(/超廣角|ultra/i);
  });

  it('telephoto capture also blocks the analysis pipelines', () => {
    const gate = captureAnalysisGate({ lensType: 'telephoto' });
    expect(gate.allowHdrComposite).toBe(false);
    expect(gate.allowFrameMatch).toBe(false);
    expect(gate.allowSceneAnalysis).toBe(false);
    expect(gate.bannerMessage).toMatch(/望遠|telephoto/i);
  });

  it('unknown lens (legacy capture) opts into analysis (back-compat)', () => {
    // Captures from before the cohort plumbing landed have undefined
    // lensType. Defaulting them to "wide-angle" preserves the existing
    // behaviour — the alternative (gating them all) would silently break
    // every existing user's compare screen.
    const gate = captureAnalysisGate({});
    expect(gate.allowHdrComposite).toBe(true);
    expect(gate.bannerMessage).toBeNull();
  });
});
