// Unit tests for the composite-hdr module.
//
// The full end-to-end pipeline (decode → align → fuse via SkSL → encode JPEG
// → write file) depends on Skia's native bindings and a real GPU surface,
// neither of which is available under bun. Manually verify those paths on
// device:
//   1. Run the pilgrimage camera, trigger an HDR capture, and confirm the
//      written file at `Paths.cache/hdr-<ts>.jpg` is a valid JPEG with
//      visibly fused highlights/shadows.
//   2. Force the SkSL effect to fail compilation (temporarily mangle the
//      shader source) and confirm the CPU fallback path runs without
//      crashing and still produces a real JPEG.
//
// What we test here are the pure helpers that compose the algorithm — the
// uniform layout for the shader, the Gaussian metric (which both the
// shader and the CPU fallback use), and the public defaults.

import { describe, expect, it } from 'bun:test';
import {
  buildMertensUniforms,
  wellExposedWeight,
  MERTENS_FUSION_SKSL,
  DEFAULT_EV_STOPS,
} from '../../libs/services/pilgrimage/composite-hdr-shader';

describe('DEFAULT_EV_STOPS', () => {
  it('is the agreed ±2 stops bracket', () => {
    // Locked design decision from the HDR redesign step 2: brackets capture
    // at -2, 0, +2 EV. The bracket hook ships these as defaults to its
    // SharedValue exposure target between shots.
    expect(DEFAULT_EV_STOPS).toEqual([-2, 0, 2]);
  });
});

describe('buildMertensUniforms', () => {
  it('flattens three (dx, dy) offsets in declared order', () => {
    const out = buildMertensUniforms(
      { dx: 1, dy: 2 },
      { dx: 3, dy: 4 },
      { dx: 5, dy: 6 }
    );
    expect(out).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles negative and zero offsets', () => {
    const out = buildMertensUniforms(
      { dx: -8, dy: 0 },
      { dx: 0, dy: 0 },
      { dx: 0, dy: -3 }
    );
    expect(out).toEqual([-8, 0, 0, 0, 0, -3]);
  });
});

describe('wellExposedWeight', () => {
  it('peaks at luma = 0.5 with weight = 1', () => {
    // Gaussian centered on 0.5; the cubed-Gaussian factor in the shader is
    // also 1^3 = 1 at the center.
    expect(wellExposedWeight(0.5)).toBeCloseTo(1, 6);
  });

  it('down-weights blown highlights (luma ≈ 1)', () => {
    // At luma=1, |x-0.5|/0.2 = 2.5 → e^(-3.125) ≈ 0.0439 per axis, cubed.
    const w = wellExposedWeight(1.0);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(0.001);
  });

  it('down-weights crushed shadows (luma ≈ 0)', () => {
    // Symmetric to the highlight case.
    const w = wellExposedWeight(0.0);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(0.001);
  });

  it('weights a near-midtone luma higher than a blown frame', () => {
    expect(wellExposedWeight(0.45)).toBeGreaterThan(wellExposedWeight(0.95));
    expect(wellExposedWeight(0.55)).toBeGreaterThan(wellExposedWeight(0.05));
  });

  it('clamps out-of-range luma without throwing', () => {
    expect(() => wellExposedWeight(-0.5)).not.toThrow();
    expect(() => wellExposedWeight(2.5)).not.toThrow();
    // Out-of-range inputs are clamped to [0, 1], so the result matches the
    // boundary value (0 or 1 → tiny weight).
    expect(wellExposedWeight(-0.5)).toBe(wellExposedWeight(0));
    expect(wellExposedWeight(2.5)).toBe(wellExposedWeight(1));
  });
});

describe('MERTENS_FUSION_SKSL', () => {
  it('declares three child samplers and three float2 offset uniforms', () => {
    // The uniform layout is load-bearing — `buildMertensUniforms` packs the
    // values in this exact order. If the shader source ever drifts out of
    // sync we want this test to catch it.
    expect(MERTENS_FUSION_SKSL).toContain('uniform shader samp0;');
    expect(MERTENS_FUSION_SKSL).toContain('uniform shader samp1;');
    expect(MERTENS_FUSION_SKSL).toContain('uniform shader samp2;');
    expect(MERTENS_FUSION_SKSL).toContain('uniform float2 off0;');
    expect(MERTENS_FUSION_SKSL).toContain('uniform float2 off1;');
    expect(MERTENS_FUSION_SKSL).toContain('uniform float2 off2;');
  });

  it('exports a half4 main entry point that returns opaque pixels', () => {
    expect(MERTENS_FUSION_SKSL).toContain('half4 main(float2 coord)');
    // Final return is half4(outColor, 1.0) — alpha is forced to opaque so
    // the encoded JPEG never carries pre-multiplied edge cases.
    expect(MERTENS_FUSION_SKSL).toContain('return half4(outColor, 1.0);');
  });
});
