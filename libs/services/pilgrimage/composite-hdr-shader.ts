// SkSL shader source for the Mertens-style HDR fusion pass.
//
// Mertens et al. (2007, "Exposure Fusion") weight each pixel of each
// bracketed frame by a product of quality metrics — typically contrast,
// saturation, and well-exposedness — then blend the frames by those weights
// per-pixel. The result is a single LDR image that pulls highlight detail
// from the under-exposed frame and shadow detail from the over-exposed
// frame without ever needing a real radiance map.
//
// For our latency budget (~400ms total composite) we keep the metric small:
//   - Well-exposedness: a Gaussian centered on 0.5 luma (sigma ≈ 0.2). This
//     is the workhorse: it strongly down-weights blown-out highlights from
//     the over-exposed frame and crushed shadows from the under-exposed
//     frame.
//   - Contrast: a cheap proxy — distance of luma from 0.5 with a small
//     gain. We deliberately avoid a 4-tap Laplacian (which would require
//     extra texture samples) because the well-exposedness term dominates.
//
// Per-image (dx, dy) uniforms shift the sampled UV in pixel space to undo
// the small camera shake measured by `alignTranslation`. With Skia's
// `image.makeShaderOptions(...)` the child shader's `eval` takes pixel-space
// coordinates, so offsets are passed in pixels (not normalized UVs).
//
// `1e-6` epsilon on each weight keeps the normalization stable when all
// three frames are heavily over- or under-exposed at the same pixel.

/**
 * Default EV stops for the bracket: the under-exposed, mid, and over-exposed
 * frames are shot at -2, 0, +2 EV. Kept here (rather than `composite-hdr.ts`)
 * so unit tests can assert against it without loading Skia.
 */
export const DEFAULT_EV_STOPS: readonly [number, number, number] = [-2, 0, 2];

export const MERTENS_FUSION_SKSL = `
uniform shader samp0;
uniform shader samp1;
uniform shader samp2;
uniform float2 off0;
uniform float2 off1;
uniform float2 off2;

half wellExposed(half3 c) {
    half3 d = (c - half3(0.5)) / half3(0.2);
    half3 gauss = exp(-half3(0.5) * d * d);
    return gauss.r * gauss.g * gauss.b;
}

half contrast(half3 c) {
    half luma = dot(c, half3(0.299, 0.587, 0.114));
    half dev = abs(luma - half(0.5));
    return dev * half(0.25);
}

half4 main(float2 coord) {
    half4 c0 = samp0.eval(coord + off0);
    half4 c1 = samp1.eval(coord + off1);
    half4 c2 = samp2.eval(coord + off2);
    half w0 = wellExposed(c0.rgb) + contrast(c0.rgb) + half(1e-6);
    half w1 = wellExposed(c1.rgb) + contrast(c1.rgb) + half(1e-6);
    half w2 = wellExposed(c2.rgb) + contrast(c2.rgb) + half(1e-6);
    half sum = w0 + w1 + w2;
    half3 outColor = (c0.rgb * w0 + c1.rgb * w1 + c2.rgb * w2) / sum;
    return half4(outColor, 1.0);
}
`;

/**
 * Build the uniforms array for `MERTENS_FUSION_SKSL`. Uniform layout must
 * match the declared order at the top of the shader: off0 (float2), off1
 * (float2), off2 (float2) — 6 floats total. The three child shaders are
 * supplied separately via `makeShaderWithChildren`.
 */
export function buildMertensUniforms(
  off0: { dx: number; dy: number },
  off1: { dx: number; dy: number },
  off2: { dx: number; dy: number }
): number[] {
  return [off0.dx, off0.dy, off1.dx, off1.dy, off2.dx, off2.dy];
}

/**
 * Gaussian well-exposedness weight, mirrored from the SkSL shader so that the
 * CPU fallback (when RuntimeEffect compilation fails) uses the SAME math.
 * Operates on a normalised luma in [0, 1].
 *
 * Note: the shader applies the Gaussian per RGB channel and multiplies the
 * three together. On luma we approximate that as Gaussian³ at the same
 * argument — equivalent when R≈G≈B (grey midtones) and a reasonable proxy
 * otherwise. The fallback only needs to bias the weight in the right
 * direction; it is intentionally cheaper than the shader path.
 */
export function wellExposedWeight(luma: number): number {
  const clamped = Math.max(0, Math.min(1, luma));
  const d = (clamped - 0.5) / 0.2;
  const g = Math.exp(-0.5 * d * d);
  return g * g * g;
}
