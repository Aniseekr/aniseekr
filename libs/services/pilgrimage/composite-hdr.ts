// Real exposure-fusion HDR compositing for the pilgrimage camera.
//
// Pipeline (running on 3 frames captured at REAL different exposures —
// `[under, mid, over]` at e.g. [-2, 0, +2] EV — provided by the bracket hook):
//
//   1. Decode all three JPEGs through Skia.
//   2. Software alignment: downscale each frame to ~128×96 luma, run a
//      coarse-to-fine SAD search against the mid frame, and recover an
//      integer (dx, dy) offset for the under and over frames. Bracket spans
//      ~300ms so handheld shake is typically only a few pixels even at 4K.
//   3. Mertens-style exposure fusion via an SkSL RuntimeEffect. Each pixel
//      of each frame is weighted by a well-exposedness Gaussian (centered on
//      0.5 luma) plus a small contrast bias, then the three frames are
//      blended by those weights per-pixel. The offsets from step 2 are
//      passed as shader uniforms so the candidate frames are sampled at the
//      aligned position.
//   4. Snapshot the offscreen surface, encode JPEG at `quality * 100`, write
//      to `Paths.cache`, then re-embed any caller-supplied EXIF.
//
// CPU fallback (Rule 8 — no fake data):
//   - If RuntimeEffect compilation fails on this device we fall back to an
//     honest weighted draw: compute per-frame mean luma, derive a Gaussian
//     weight that matches the shader's metric, and Plus-blend with those
//     scalar weights. This is still better than the old uniform 1/3 alpha
//     because it actually down-weights the frames whose mean luma is far
//     from 0.5 (i.e. blown highlights or crushed shadows).
//   - If decode, surface allocation, or encoding fails outright, we return
//     the REAL mid frame URI. We never fabricate a result.

import {
  Skia,
  ImageFormat,
  BlendMode,
  TileMode,
  FilterMode,
  MipmapMode,
  AlphaType,
  ColorType,
} from '@shopify/react-native-skia';
import type {
  SkImage,
  SkPaint,
  SkSurface,
  SkRuntimeEffect,
  SkShader,
} from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { embedExifIntoJpegFile } from '../../utils/exif-embed';
import {
  alignTranslation,
  rgbaToLuma,
  scaleOffsetToFullRes,
  type AlignResult,
} from './composite-hdr-align';
import {
  DEFAULT_EV_STOPS as SHADER_DEFAULT_EV_STOPS,
  MERTENS_FUSION_SKSL,
  buildMertensUniforms,
  wellExposedWeight,
} from './composite-hdr-shader';

export interface CompositeHdrInput {
  /** Three captured-frame URIs in order: under, mid, over. */
  frameUris: [string, string, string];
  /** EV stops applied per frame to describe the bracket. Default [-2, 0, +2]. */
  evStops?: [number, number, number];
  /** Output JPEG quality 0..1. Default 0.92. */
  quality?: number;
  /** EXIF metadata to preserve after Skia re-encodes the composite JPEG. */
  exif?: Record<string, unknown> | null;
}

export interface CompositeHdrResult {
  uri: string;
  width: number;
  height: number;
  // Which path actually produced this result — surfaced so the UI never claims
  // full HDR when the device silently fell back (Rule 8).
  //   'gpu'         — SkSL Mertens fusion (full quality)
  //   'cpu'         — scalar weighted fallback (basic, but real fusion)
  //   'passthrough' — decode/surface/encode failed; this is the mid frame, no HDR
  path: 'gpu' | 'cpu' | 'passthrough';
}

/**
 * Whether this device can run the SkSL HDR-fusion shader. Triggers (and caches)
 * the one-time RuntimeEffect compile, so callers can show an honest "basic HDR"
 * indicator up front instead of discovering the CPU fallback only after a shot.
 */
export function probeHdrFusionSupport(): boolean {
  return getFusionEffect() !== null;
}

export const DEFAULT_EV_STOPS: [number, number, number] = [
  SHADER_DEFAULT_EV_STOPS[0],
  SHADER_DEFAULT_EV_STOPS[1],
  SHADER_DEFAULT_EV_STOPS[2],
];
const DEFAULT_QUALITY = 0.92;
const FRAME_COUNT = 3;
const MID_INDEX = 1;

// Alignment grid: 128×96 keeps the brute-force SAD trivial (<20ms in JS) while
// retaining enough detail to register a few-pixel shake at 4K.
const ALIGN_GRID_WIDTH = 128;
const ALIGN_GRID_HEIGHT = 96;
// ±8 px in the downscaled grid maps to ±~256 px at 4K — comfortably above the
// expected 1–4 px handheld shake during a 300ms bracket.
const ALIGN_MAX_RADIUS = 8;

// Cache the compiled effect; SkSL compile is non-trivial and the shader text
// is constant. If the first compile returns null we leave the cache empty so
// every subsequent call hits the CPU fallback path immediately.
let cachedFusionEffect: SkRuntimeEffect | null = null;
let fusionEffectCompileTried = false;
function getFusionEffect(): SkRuntimeEffect | null {
  if (cachedFusionEffect) return cachedFusionEffect;
  if (fusionEffectCompileTried) return null;
  fusionEffectCompileTried = true;
  const effect = Skia.RuntimeEffect.Make(MERTENS_FUSION_SKSL);
  if (!effect) {
    console.warn('[compositeHdr] Mertens fusion SkSL failed to compile');
    return null;
  }
  cachedFusionEffect = effect;
  return effect;
}

/**
 * Downscale an SkImage onto a small offscreen surface and read back the
 * luma channel. Returns null if any step in the chain fails — callers must
 * fall back to a zero-offset alignment in that case.
 */
function extractLumaGrid(
  image: SkImage,
  gridWidth: number,
  gridHeight: number
): Uint8Array | null {
  let smallSurface: SkSurface | null = null;
  let snapshot: SkImage | null = null;
  let paint: SkPaint | null = null;
  try {
    smallSurface = Skia.Surface.MakeOffscreen(gridWidth, gridHeight);
    if (!smallSurface) return null;
    const canvas = smallSurface.getCanvas();
    // Sample the source with a linear filter scaled to fit the small grid.
    const fullW = image.width();
    const fullH = image.height();
    if (!fullW || !fullH) return null;
    const sx = gridWidth / fullW;
    const sy = gridHeight / fullH;
    canvas.save();
    canvas.scale(sx, sy);
    paint = Skia.Paint();
    canvas.drawImage(image, 0, 0, paint);
    canvas.restore();
    smallSurface.flush();
    snapshot = smallSurface.makeImageSnapshot();
    const pixels = snapshot.readPixels(0, 0, {
      width: gridWidth,
      height: gridHeight,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels || !(pixels instanceof Uint8Array)) return null;
    return rgbaToLuma(pixels, gridWidth, gridHeight);
  } catch (error) {
    console.warn('[compositeHdr] luma extraction failed', error);
    return null;
  } finally {
    paint?.dispose();
    snapshot?.dispose();
    smallSurface?.dispose();
  }
}

interface FullResAlignment {
  under: { dx: number; dy: number };
  mid: { dx: number; dy: number };
  over: { dx: number; dy: number };
  underCost: number;
  overCost: number;
}

/**
 * Run the alignment math on the three decoded frames. Returns zero offsets
 * (which is a no-op shift) when luma extraction fails for any frame — the
 * fusion path still produces a real composite, just without translation
 * correction.
 */
function alignFrames(
  underImg: SkImage,
  midImg: SkImage,
  overImg: SkImage,
  fullWidth: number,
  fullHeight: number
): FullResAlignment {
  const zero: FullResAlignment = {
    under: { dx: 0, dy: 0 },
    mid: { dx: 0, dy: 0 },
    over: { dx: 0, dy: 0 },
    underCost: Number.POSITIVE_INFINITY,
    overCost: Number.POSITIVE_INFINITY,
  };

  const midLuma = extractLumaGrid(midImg, ALIGN_GRID_WIDTH, ALIGN_GRID_HEIGHT);
  if (!midLuma) return zero;
  const underLuma = extractLumaGrid(underImg, ALIGN_GRID_WIDTH, ALIGN_GRID_HEIGHT);
  const overLuma = extractLumaGrid(overImg, ALIGN_GRID_WIDTH, ALIGN_GRID_HEIGHT);

  const underAligned: AlignResult = underLuma
    ? alignTranslation({
        refLuma: midLuma,
        candidateLuma: underLuma,
        width: ALIGN_GRID_WIDTH,
        height: ALIGN_GRID_HEIGHT,
        maxRadius: ALIGN_MAX_RADIUS,
      })
    : { dx: 0, dy: 0, cost: Number.POSITIVE_INFINITY };
  const overAligned: AlignResult = overLuma
    ? alignTranslation({
        refLuma: midLuma,
        candidateLuma: overLuma,
        width: ALIGN_GRID_WIDTH,
        height: ALIGN_GRID_HEIGHT,
        maxRadius: ALIGN_MAX_RADIUS,
      })
    : { dx: 0, dy: 0, cost: Number.POSITIVE_INFINITY };

  const underFull = scaleOffsetToFullRes(
    underAligned.dx,
    underAligned.dy,
    ALIGN_GRID_WIDTH,
    ALIGN_GRID_HEIGHT,
    fullWidth,
    fullHeight
  );
  const overFull = scaleOffsetToFullRes(
    overAligned.dx,
    overAligned.dy,
    ALIGN_GRID_WIDTH,
    ALIGN_GRID_HEIGHT,
    fullWidth,
    fullHeight
  );

  return {
    under: underFull,
    mid: { dx: 0, dy: 0 },
    over: overFull,
    underCost: underAligned.cost,
    overCost: overAligned.cost,
  };
}

/**
 * Honest CPU fallback when the SkSL RuntimeEffect fails to compile. We
 * compute a per-frame Gaussian weight from each frame's mean luma (cheap,
 * one readPixels per frame at the small grid) and Plus-blend the three
 * frames with those scalar alphas. This is NOT a per-pixel fusion — the
 * shader path does that — but it is an honest weighted average that
 * down-weights the most over/under-exposed frame, which is the point.
 */
function meanLumaOf(image: SkImage): number {
  // Reuse the alignment grid path to avoid a second readPixels surface.
  const luma = extractLumaGrid(image, ALIGN_GRID_WIDTH, ALIGN_GRID_HEIGHT);
  if (!luma) return 0.5;
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  // Normalize to [0, 1] for use with `wellExposedWeight`.
  return sum / luma.length / 255;
}

function drawCpuFallback(
  surface: SkSurface,
  decoded: SkImage[],
  alignment: FullResAlignment
): SkPaint[] {
  const paints: SkPaint[] = [];
  const canvas = surface.getCanvas();
  // Per-frame Gaussian weight on mean luma. The shader uses this same
  // Gaussian per-pixel; the fallback averages it per-frame.
  const weights = decoded.map((img) => wellExposedWeight(meanLumaOf(img)));
  const sum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const offsets = [alignment.under, alignment.mid, alignment.over];
  for (let i = 0; i < decoded.length; i++) {
    const img = decoded[i];
    const alpha = weights[i] / sum;
    const paint = Skia.Paint();
    paint.setAlphaf(alpha);
    paint.setBlendMode(BlendMode.Plus);
    paints.push(paint);
    canvas.drawImage(img, -offsets[i].dx, -offsets[i].dy, paint);
  }
  return paints;
}

function drawShaderFusion(
  effect: SkRuntimeEffect,
  surface: SkSurface,
  width: number,
  height: number,
  decoded: SkImage[],
  alignment: FullResAlignment
): { paint: SkPaint; shaders: SkShader[] } | null {
  const shaders: SkShader[] = [];
  for (const img of decoded) {
    const shader = img.makeShaderOptions(
      TileMode.Clamp,
      TileMode.Clamp,
      FilterMode.Linear,
      MipmapMode.None
    );
    shaders.push(shader);
  }
  // Negative offset moves the SAMPLE position to match the reference, i.e.
  // if the candidate frame was shifted +2 px to the right relative to mid,
  // we sample 2 px to the right to undo it.
  const uniforms = buildMertensUniforms(
    { dx: -alignment.under.dx, dy: -alignment.under.dy },
    { dx: -alignment.mid.dx, dy: -alignment.mid.dy },
    { dx: -alignment.over.dx, dy: -alignment.over.dy }
  );
  const fused = effect.makeShaderWithChildren(uniforms, shaders);
  if (!fused) {
    for (const s of shaders) s.dispose();
    return null;
  }
  const paint = Skia.Paint();
  paint.setShader(fused);
  const canvas = surface.getCanvas();
  canvas.drawRect({ x: 0, y: 0, width, height }, paint);
  return { paint, shaders };
}

/**
 * Composite 3 bracketed frames into a single LDR HDR-style JPEG. See the
 * file header for the full algorithm.
 *
 * On any unrecoverable failure (decode, surface allocation, empty encoding)
 * returns the mid-frame URI verbatim. The output dimensions track the MID
 * frame's dimensions, which the orchestrator already aligns to the capture
 * resolution.
 */
export async function compositeHdr(input: CompositeHdrInput): Promise<CompositeHdrResult> {
  const { frameUris } = input;
  const _evStops = input.evStops ?? DEFAULT_EV_STOPS;
  // evStops is part of the public contract — we accept it so the bracket
  // hook can document its choice and future iterations of the algorithm
  // can use it for radiance recovery — but the Mertens path does not need
  // per-frame EV values (the per-pixel Gaussian implicitly handles them).
  void _evStops;
  const quality = input.quality ?? DEFAULT_QUALITY;
  const exif = input.exif;
  const midUri = frameUris[MID_INDEX];

  async function withExif(
    uri: string,
    width: number,
    height: number,
    path: CompositeHdrResult['path'] = 'passthrough'
  ): Promise<CompositeHdrResult> {
    if (exif && typeof exif === 'object') {
      try {
        await embedExifIntoJpegFile(uri, exif);
      } catch (embedError) {
        console.warn('[compositeHdr] EXIF embed failed', embedError);
      }
    }
    return { uri, width, height, path };
  }

  const decoded: (SkImage | null)[] = [null, null, null];
  let surface: SkSurface | null = null;
  let snapshot: SkImage | null = null;
  let fusedPaint: SkPaint | null = null;
  let fusedShaders: SkShader[] = [];
  let cpuPaints: SkPaint[] = [];

  try {
    for (let i = 0; i < FRAME_COUNT; i++) {
      const data = await Skia.Data.fromURI(frameUris[i]);
      if (!data) {
        console.warn(`[compositeHdr] frame ${i} data load failed`);
        return withExif(midUri, 0, 0);
      }
      const img = Skia.Image.MakeImageFromEncoded(data);
      if (!img) {
        console.warn(`[compositeHdr] frame ${i} decode failed`);
        return withExif(midUri, 0, 0);
      }
      decoded[i] = img;
    }

    const underImg = decoded[0];
    const midImg = decoded[1];
    const overImg = decoded[2];
    if (!underImg || !midImg || !overImg) {
      return withExif(midUri, 0, 0);
    }

    // Output dimensions track the MID frame — it is the geometric reference
    // for the alignment offsets we just computed.
    const width = midImg.width();
    const height = midImg.height();
    if (!width || !height) {
      console.warn('[compositeHdr] mid frame has zero dimensions');
      return withExif(midUri, 0, 0);
    }

    const alignment = alignFrames(underImg, midImg, overImg, width, height);

    surface = Skia.Surface.MakeOffscreen(width, height);
    if (!surface) {
      console.warn('[compositeHdr] failed to allocate offscreen surface');
      return withExif(midUri, 0, 0);
    }

    let fusionPath: 'gpu' | 'cpu' = 'cpu';
    const effect = getFusionEffect();
    if (effect) {
      const drawn = drawShaderFusion(effect, surface, width, height, [underImg, midImg, overImg], alignment);
      if (drawn) {
        fusedPaint = drawn.paint;
        fusedShaders = drawn.shaders;
        fusionPath = 'gpu';
      } else {
        console.warn('[compositeHdr] shader path unavailable, using CPU-weight fallback');
        cpuPaints = drawCpuFallback(surface, [underImg, midImg, overImg], alignment);
      }
    } else {
      console.warn('[compositeHdr] shader path unavailable, using CPU-weight fallback');
      cpuPaints = drawCpuFallback(surface, [underImg, midImg, overImg], alignment);
    }

    surface.flush();
    snapshot = surface.makeImageSnapshot();
    const jpegBytes = snapshot.encodeToBytes(ImageFormat.JPEG, Math.round(quality * 100));
    if (!jpegBytes || jpegBytes.length === 0) {
      console.warn('[compositeHdr] encoded JPEG was empty');
      return withExif(midUri, width, height);
    }

    const filename = `hdr-${Date.now()}.jpg`;
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(jpegBytes);

    return withExif(file.uri, width, height, fusionPath);
  } catch (error) {
    console.warn('[compositeHdr]', error);
    return withExif(midUri, 0, 0);
  } finally {
    for (const s of fusedShaders) s.dispose();
    fusedPaint?.dispose();
    for (const p of cpuPaints) p.dispose();
    snapshot?.dispose();
    surface?.dispose();
    for (const img of decoded) img?.dispose();
  }
}
