// Skia-side mask operations for the cutout editor. The working mask is a
// LUMINANCE image (white = keep, black = removed) at editing resolution
// (≤ EDIT_MAX_DIM long edge). Strokes paint white/black; whole-mask filters
// run as ImageFilter passes. The final composite multiplies the mask into the
// full-res original's alpha via MakeLumaColorFilter + BlendMode.DstIn.
//
// The two hex literals below are mask luminance values (data), not UI colors.

import {
  BlendMode,
  BlurStyle,
  ImageFormat,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
} from '@shopify/react-native-skia';
import type { SkImage, SkPaint, SkPath, SkSurface } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import {
  alphaBBox,
  scalePadBBox,
  type EditOp,
  type FilterOp,
  type StrokeOp,
} from './cutout-ops';

const MASK_WHITE = '#FFFFFF';
const MASK_BLACK = '#000000';

/** How much of the brush diameter the soft edge occupies at hardness 0. */
const BRUSH_SOFTNESS = 0.25;
/** Crop padding around the subject bbox, as a fraction of its size. */
const CROP_PAD_FRAC = 0.02;
/** Resolution of the cheap bbox scan. */
const BBOX_SCAN_DIM = 256;

export async function loadSkImage(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  if (!data) throw new Error(`cutout-mask: failed to load data from ${uri}`);
  const img = Skia.Image.MakeImageFromEncoded(data);
  if (!img) throw new Error(`cutout-mask: failed to decode image at ${uri}`);
  return img;
}

/** Snapshot a surface into a CPU image that outlives the surface. */
function snapshotDetached(surface: SkSurface): SkImage {
  surface.flush();
  const snap = surface.makeImageSnapshot();
  const detached = snap.makeNonTextureImage();
  if (detached && detached !== snap) {
    snap.dispose();
    surface.dispose();
    return detached;
  }
  surface.dispose();
  return snap;
}

function makeSurface(w: number, h: number): SkSurface {
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
  return surface;
}

/** Draw `src` scaled into a fresh w×h image. */
export function scaleImage(src: SkImage, w: number, h: number): SkImage {
  const surface = makeSurface(w, h);
  surface
    .getCanvas()
    .drawImageRect(
      src,
      { x: 0, y: 0, width: src.width(), height: src.height() },
      { x: 0, y: 0, width: w, height: h },
      Skia.Paint()
    );
  return snapshotDetached(surface);
}

/** Solid white mask — manual mode starts from "keep everything". */
export function makeWhiteMask(w: number, h: number): SkImage {
  const surface = makeSurface(w, h);
  surface.getCanvas().drawColor(Skia.Color(MASK_WHITE));
  return snapshotDetached(surface);
}

export function strokePath(op: StrokeOp): SkPath {
  const path = Skia.Path.Make();
  const pts = op.points;
  if (pts.length === 0) return path;
  path.moveTo(pts[0].x, pts[0].y);
  // A single tap still draws a dot thanks to the round cap.
  if (pts.length === 1) path.lineTo(pts[0].x + 0.01, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  return path;
}

export function strokePaint(op: StrokeOp): SkPaint {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(op.tool === 'restore' ? MASK_WHITE : MASK_BLACK));
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(op.size);
  paint.setStrokeCap(StrokeCap.Round);
  paint.setStrokeJoin(StrokeJoin.Round);
  paint.setAntiAlias(true);
  if (op.hardness < 1) {
    const sigma = Math.max(0.5, op.size * (1 - op.hardness) * BRUSH_SOFTNESS);
    paint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, sigma, true));
  }
  return paint;
}

/** One whole-mask filter pass (feather / smooth / shrink / expand). */
function filterPass(mask: SkImage, op: FilterOp, w: number, h: number): SkImage {
  const surface = makeSurface(w, h);
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color(MASK_BLACK));
  const paint = Skia.Paint();
  const r = Math.max(1, op.amount);
  switch (op.filter) {
    case 'feather':
      paint.setImageFilter(Skia.ImageFilter.MakeBlur(r, r, TileMode.Clamp, null));
      break;
    case 'shrink':
      paint.setImageFilter(Skia.ImageFilter.MakeErode(r, r, null));
      break;
    case 'expand':
      paint.setImageFilter(Skia.ImageFilter.MakeDilate(r, r, null));
      break;
    case 'smooth': {
      // Morphological closing (fill notches) then opening (shave spikes):
      // Erode(Dilate(x)) → Dilate(Erode(·)). Translate-free and binary-safe.
      const closing = Skia.ImageFilter.MakeErode(r, r, Skia.ImageFilter.MakeDilate(r, r, null));
      paint.setImageFilter(
        Skia.ImageFilter.MakeDilate(r, r, Skia.ImageFilter.MakeErode(r, r, closing))
      );
      break;
    }
  }
  canvas.drawImage(mask, 0, 0, paint);
  return snapshotDetached(surface);
}

/** Replay `ops` on top of `base`, returning the resulting mask. */
export function rebuildMask(base: SkImage, ops: EditOp[], w: number, h: number): SkImage {
  let surface = makeSurface(w, h);
  let canvas = surface.getCanvas();
  canvas.clear(Skia.Color(MASK_BLACK));
  canvas.drawImageRect(
    base,
    { x: 0, y: 0, width: base.width(), height: base.height() },
    { x: 0, y: 0, width: w, height: h },
    Skia.Paint()
  );
  for (const op of ops) {
    if (op.kind === 'stroke') {
      canvas.drawPath(strokePath(op), strokePaint(op));
    } else {
      const current = snapshotDetached(surface); // consumes the surface
      const filtered = filterPass(current, op, w, h);
      current.dispose();
      surface = makeSurface(w, h);
      canvas = surface.getCanvas();
      canvas.clear(Skia.Color(MASK_BLACK));
      canvas.drawImage(filtered, 0, 0);
      surface.flush();
      filtered.dispose();
    }
  }
  return snapshotDetached(surface);
}

/** Apply a single op on top of the current mask (incremental commit). */
export function applyOpToMask(current: SkImage, op: EditOp, w: number, h: number): SkImage {
  return rebuildMask(current, [op], w, h);
}

/** Checker tile for the transparency backdrop; colors come from the theme. */
export function makeCheckerImage(cell: number, colorA: string, colorB: string): SkImage {
  const surface = makeSurface(cell * 2, cell * 2);
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color(colorA));
  const paint = Skia.Paint();
  paint.setColor(Skia.Color(colorB));
  canvas.drawRect({ x: cell, y: 0, width: cell, height: cell }, paint);
  canvas.drawRect({ x: 0, y: cell, width: cell, height: cell }, paint);
  return snapshotDetached(surface);
}

// ── Persistence ──────────────────────────────────────────────────────────────

function companionDir(): Directory {
  const dir = new Directory(Paths.document, 'companion');
  if (!dir.exists) dir.create();
  return dir;
}

function writeBytes(name: string, bytes: Uint8Array): string {
  const file = new File(companionDir(), name);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return file.uri;
}

/** Copy an arbitrary file:// uri into the durable companion dir. */
export function copyIntoCompanionDir(uri: string, name: string): string {
  const src = new File(uri);
  const dest = new File(companionDir(), name);
  if (dest.exists) dest.delete();
  src.copy(dest);
  return dest.uri;
}

/** Best-effort cleanup of files we previously wrote into the companion dir. */
export function tryDeleteOwnedFile(uri: string | undefined): void {
  if (!uri || !uri.includes('/companion/')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignore — a stale file is the worst case
  }
}

export interface SaveCutoutInput {
  /** EXIF-normalized full-res original (file:// uri). */
  originalUri: string;
  /** Final editing-resolution luminance mask. */
  mask: SkImage;
  /** Stem for output filenames, e.g. the entry id. */
  fileStem: string;
}

export interface SaveCutoutResult {
  cutoutUri: string;
  maskUri: string;
  width: number;
  height: number;
}

/**
 * Full-res composite: original × mask (luma → alpha), cropped to the subject
 * bbox (+2% pad). Writes cutout PNG + editing-res mask PNG into the companion
 * dir and returns their uris with the cropped pixel size.
 */
export async function renderAndSaveCutout(input: SaveCutoutInput): Promise<SaveCutoutResult> {
  const original = await loadSkImage(input.originalUri);
  try {
    const fullW = original.width();
    const fullH = original.height();
    const maskW = input.mask.width();
    const maskH = input.mask.height();

    // 1. Composite at full resolution.
    const surface = makeSurface(fullW, fullH);
    const canvas = surface.getCanvas();
    canvas.drawImage(original, 0, 0);
    const maskPaint = Skia.Paint();
    maskPaint.setBlendMode(BlendMode.DstIn);
    maskPaint.setColorFilter(Skia.ColorFilter.MakeLumaColorFilter());
    const upscale = fullW / maskW;
    if (upscale > 1.05) {
      // Hide mask upscaling steps with a slight blur (deliberate softness).
      const sigma = upscale * 0.5;
      maskPaint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
    }
    canvas.drawImageRect(
      input.mask,
      { x: 0, y: 0, width: maskW, height: maskH },
      { x: 0, y: 0, width: fullW, height: fullH },
      maskPaint
    );
    const composited = snapshotDetached(surface);

    // 2. Subject bbox from a small scan of the mask.
    const scanScale = Math.min(1, BBOX_SCAN_DIM / Math.max(maskW, maskH));
    const scanW = Math.max(1, Math.round(maskW * scanScale));
    const scanH = Math.max(1, Math.round(maskH * scanScale));
    const small = scaleImage(input.mask, scanW, scanH);
    const pixels = small.readPixels();
    small.dispose();
    let crop = { x: 0, y: 0, width: fullW, height: fullH };
    if (pixels) {
      // readPixels yields RGBA; floats (rare) are normalized 0..1.
      const isFloat = pixels instanceof Float32Array;
      const bb = alphaBBox(pixels as ArrayLike<number>, scanW, scanH, {
        stride: 4,
        offset: 0,
        threshold: isFloat ? 8 / 255 : 8,
      });
      if (bb) crop = scalePadBBox(bb, fullW / scanW, CROP_PAD_FRAC, fullW, fullH);
    }

    // 3. Crop into the output surface and encode.
    const out = makeSurface(crop.width, crop.height);
    out
      .getCanvas()
      .drawImageRect(
        composited,
        { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
        { x: 0, y: 0, width: crop.width, height: crop.height },
        Skia.Paint()
      );
    const cropped = snapshotDetached(out);
    composited.dispose();
    const cutoutPng = cropped.encodeToBytes(ImageFormat.PNG, 100);
    cropped.dispose();
    if (!cutoutPng || cutoutPng.length === 0) {
      throw new Error('cutout-mask: encoded cutout PNG was empty');
    }
    const maskPng = input.mask.encodeToBytes(ImageFormat.PNG, 100);
    if (!maskPng || maskPng.length === 0) {
      throw new Error('cutout-mask: encoded mask PNG was empty');
    }

    const ts = Date.now();
    const cutoutUri = writeBytes(`cutout-${input.fileStem}-${ts}.png`, cutoutPng);
    const maskUri = writeBytes(`mask-${input.fileStem}-${ts}.png`, maskPng);
    return { cutoutUri, maskUri, width: crop.width, height: crop.height };
  } finally {
    original.dispose();
  }
}
