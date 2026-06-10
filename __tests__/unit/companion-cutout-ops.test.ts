// Pure logic for the cutout editor: op stack (undo/redo), view math, bbox scans.

import { describe, expect, test } from 'bun:test';
import {
  alphaBBox,
  appliedOps,
  canRedo,
  canUndo,
  createOpStack,
  editScale,
  fitContain,
  pushOp,
  redoOp,
  scalePadBBox,
  screenToImage,
  undoOp,
  zoomAround,
  type EditOp,
} from '../../libs/services/companion/cutout-ops';

function stroke(x: number): EditOp {
  return { kind: 'stroke', tool: 'erase', points: [{ x, y: 1 }], size: 10, hardness: 1 };
}

describe('op stack', () => {
  test('push applies, undo/redo move the cursor', () => {
    let s = createOpStack();
    expect(canUndo(s)).toBe(false);
    s = pushOp(s, stroke(1));
    s = pushOp(s, stroke(2));
    expect(appliedOps(s)).toHaveLength(2);
    expect(canUndo(s)).toBe(true);
    s = undoOp(s);
    expect(appliedOps(s)).toHaveLength(1);
    expect(canRedo(s)).toBe(true);
    s = redoOp(s);
    expect(appliedOps(s)).toHaveLength(2);
    expect(canRedo(s)).toBe(false);
  });

  test('pushing after undo truncates the redo tail', () => {
    let s = createOpStack();
    s = pushOp(s, stroke(1));
    s = pushOp(s, stroke(2));
    s = undoOp(s);
    s = pushOp(s, { kind: 'filter', filter: 'feather', amount: 3 });
    expect(appliedOps(s)).toHaveLength(2);
    expect(appliedOps(s)[1]).toEqual({ kind: 'filter', filter: 'feather', amount: 3 });
    expect(canRedo(s)).toBe(false);
  });

  test('undo at bottom and redo at top are no-ops', () => {
    let s = createOpStack();
    expect(undoOp(s)).toBe(s);
    s = pushOp(s, stroke(1));
    expect(redoOp(s)).toBe(s);
  });
});

describe('view math', () => {
  test('fitContain centres a wide image in a square viewport', () => {
    const v = fitContain(100, 50, 200, 200);
    expect(v.scale).toBe(2);
    expect(v.offX).toBe(0);
    expect(v.offY).toBe(50);
  });

  test('fitContain degrades safely on zero dimensions', () => {
    expect(fitContain(0, 50, 200, 200)).toEqual({ scale: 1, offX: 0, offY: 0 });
  });

  test('screenToImage inverts the transform', () => {
    const v = { scale: 2, offX: 10, offY: 50 };
    const p = screenToImage(110, 150, v);
    expect(p.x).toBe(50);
    expect(p.y).toBe(50);
  });

  test('zoomAround keeps the focal point fixed', () => {
    const v = { scale: 1, offX: 0, offY: 0 };
    const next = zoomAround(v, 100, 100, 2, 0.5, 8);
    const before = screenToImage(100, 100, v);
    const after = screenToImage(100, 100, next);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(next.scale).toBe(2);
  });

  test('zoomAround clamps to min/max', () => {
    const v = { scale: 4, offX: 0, offY: 0 };
    expect(zoomAround(v, 0, 0, 100, 0.5, 8).scale).toBe(8);
    expect(zoomAround(v, 0, 0, 0.0001, 0.5, 8).scale).toBe(0.5);
  });
});

describe('alphaBBox', () => {
  test('returns null for an empty buffer', () => {
    const data = new Uint8Array(4 * 4);
    expect(alphaBBox(data, 4, 4)).toBeNull();
  });

  test('finds a centred square (stride 4, RGBA red channel)', () => {
    const w = 8;
    const h = 8;
    const data = new Uint8Array(w * h * 4);
    for (let y = 2; y <= 5; y++) {
      for (let x = 3; x <= 4; x++) data[(y * w + x) * 4] = 255;
    }
    const bb = alphaBBox(data, w, h, { stride: 4, offset: 0 });
    expect(bb).toEqual({ x: 3, y: 2, width: 2, height: 4 });
  });

  test('values at or below the threshold are ignored', () => {
    const data = new Uint8Array(9);
    data[4] = 8; // == default threshold → not counted
    expect(alphaBBox(data, 3, 3)).toBeNull();
    data[4] = 9;
    expect(alphaBBox(data, 3, 3)).toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });

  test('scalePadBBox scales, pads, and clamps to bounds', () => {
    const bb = { x: 1, y: 1, width: 2, height: 2 };
    const out = scalePadBBox(bb, 10, 0.1, 25, 40);
    // x: 1*10 - 2 = 8; right: 3*10 + 2 = 32 → clamped to 25
    expect(out.x).toBe(8);
    expect(out.y).toBe(8);
    expect(out.width).toBe(25 - 8);
    expect(out.height).toBe(32 - 8);
  });
});

describe('editScale', () => {
  test('caps the long edge at the editing max', () => {
    expect(editScale(4096, 3072, 2048)).toBe(0.5);
    expect(editScale(1000, 800, 2048)).toBe(1);
  });
});
