// Pure, Skia-free logic for the cutout editor (去背編輯板): the edit-op stack
// (brush strokes + whole-mask filters with undo/redo), contain-fit view math,
// screen↔image coordinate mapping, and bounding-box scans over pixel buffers.
// Kept free of react-native / Skia imports so `bun test` covers it directly.

export type BrushTool = 'erase' | 'restore';
export type MaskFilterKind = 'feather' | 'smooth' | 'shrink' | 'expand';

export interface StrokePoint {
  x: number;
  y: number;
}

export interface StrokeOp {
  kind: 'stroke';
  tool: BrushTool;
  /** Mask-space (editing resolution) coordinates. */
  points: StrokePoint[];
  /** Brush diameter in mask pixels. */
  size: number;
  /** 0..1 — 1 = hard edge; lower values blur the brush edge. */
  hardness: number;
}

export interface FilterOp {
  kind: 'filter';
  filter: MaskFilterKind;
  /** Radius/sigma in mask pixels. */
  amount: number;
}

export type EditOp = StrokeOp | FilterOp;

export interface OpStack {
  ops: EditOp[];
  /** ops[0, cursor) are applied; the rest is the redo tail. */
  cursor: number;
}

export function createOpStack(): OpStack {
  return { ops: [], cursor: 0 };
}

export function pushOp(stack: OpStack, op: EditOp): OpStack {
  const ops = stack.ops.slice(0, stack.cursor);
  ops.push(op);
  return { ops, cursor: ops.length };
}

export function undoOp(stack: OpStack): OpStack {
  return stack.cursor === 0 ? stack : { ops: stack.ops, cursor: stack.cursor - 1 };
}

export function redoOp(stack: OpStack): OpStack {
  return stack.cursor >= stack.ops.length ? stack : { ops: stack.ops, cursor: stack.cursor + 1 };
}

export function appliedOps(stack: OpStack): EditOp[] {
  return stack.ops.slice(0, stack.cursor);
}

export function canUndo(stack: OpStack): boolean {
  return stack.cursor > 0;
}

export function canRedo(stack: OpStack): boolean {
  return stack.cursor < stack.ops.length;
}

/** Image→screen mapping: screen = image * scale + off. */
export interface ViewTransform {
  scale: number;
  offX: number;
  offY: number;
}

/** Contain-fit an image into a viewport, centred. */
export function fitContain(
  imgW: number,
  imgH: number,
  viewW: number,
  viewH: number
): ViewTransform {
  if (imgW <= 0 || imgH <= 0 || viewW <= 0 || viewH <= 0) {
    return { scale: 1, offX: 0, offY: 0 };
  }
  const scale = Math.min(viewW / imgW, viewH / imgH);
  return { scale, offX: (viewW - imgW * scale) / 2, offY: (viewH - imgH * scale) / 2 };
}

export function screenToImage(sx: number, sy: number, view: ViewTransform): StrokePoint {
  return { x: (sx - view.offX) / view.scale, y: (sy - view.offY) / view.scale };
}

/** Zoom by `factor` around a screen-space focal point, clamped to [min, max]. */
export function zoomAround(
  view: ViewTransform,
  focalX: number,
  focalY: number,
  factor: number,
  minScale: number,
  maxScale: number
): ViewTransform {
  const next = Math.min(maxScale, Math.max(minScale, view.scale * factor));
  const k = next / view.scale;
  return {
    scale: next,
    offX: focalX - (focalX - view.offX) * k,
    offY: focalY - (focalY - view.offY) * k,
  };
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of pixels whose channel value exceeds `threshold` in a strided
 * buffer (e.g. RGBA bytes with stride 4). Returns null when nothing exceeds it.
 */
export function alphaBBox(
  data: ArrayLike<number>,
  w: number,
  h: number,
  opts: { stride?: number; offset?: number; threshold?: number } = {}
): BBox | null {
  const stride = opts.stride ?? 1;
  const offset = opts.offset ?? 0;
  const threshold = opts.threshold ?? 8;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (data[(row + x) * stride + offset] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Scale a bbox by `factor`, pad by `padFrac` of its scaled size, clamp to bounds. */
export function scalePadBBox(
  bbox: BBox,
  factor: number,
  padFrac: number,
  boundsW: number,
  boundsH: number
): BBox {
  const padX = bbox.width * factor * padFrac;
  const padY = bbox.height * factor * padFrac;
  const x = Math.max(0, Math.floor(bbox.x * factor - padX));
  const y = Math.max(0, Math.floor(bbox.y * factor - padY));
  const right = Math.min(boundsW, Math.ceil((bbox.x + bbox.width) * factor + padX));
  const bottom = Math.min(boundsH, Math.ceil((bbox.y + bbox.height) * factor + padY));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/** Long edge of the editing-resolution working mask/preview. */
export const EDIT_MAX_DIM = 2048;

/** Downscale factor to bring an image within the editing cap (≤1). */
export function editScale(w: number, h: number, maxDim: number = EDIT_MAX_DIM): number {
  const long = Math.max(w, h);
  return long <= maxDim ? 1 : maxDim / long;
}
