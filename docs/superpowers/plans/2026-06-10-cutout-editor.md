# Companion Cutout Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-screen cutout (去背) editing board for companion characters — erase/restore brush with undo/redo, edge tools (feather/smooth/shrink/expand), manual rescue mode, non-destructive re-edit — backed by a new native `liftWithMask` that returns a full-size mask aligned to the EXIF-normalized original.

**Architecture:** Native module gains `liftWithMask(uri) → {maskUri, sourceUri, width, height, hasAlpha}` (grayscale luminance mask, white = subject). The editor works on `original × mask` at ≤2048px editing resolution: strokes and whole-mask filters are an op stack replayed onto Skia offscreen surfaces; the declarative canvas renders the original through a `<Mask mode="luminance">` with a live `SkPath` bound to a Reanimated SharedValue so painting never touches React state. Save composites full-res original × upscaled mask via `MakeLumaColorFilter` + `BlendMode.DstIn`, crops to the alpha bbox, and persists cutout + mask + normalized source under `documentDirectory/companion/`.

**Tech Stack:** @shopify/react-native-skia 2.6.2 (Mask, ImageFilter.MakeErode/MakeDilate/MakeBlur, MaskFilter, notifyChange), react-native-gesture-handler 2.31, react-native-reanimated 4.3, expo-file-system (File/Directory/Paths), expo-image-manipulator (EXIF normalize fallback), @react-native-community/slider, Vision (iOS) / ML Kit Subject Segmentation (Android), MMKV store, bun test.

**Spec:** `docs/superpowers/specs/2026-06-10-cutout-editor-design.md`

Conventions for every task: imports use relative paths (repo style), all user-facing strings via `useT()`, all colors via `useTheme()` (the only allowed hex literals are mask luminance values `#000000`/`#FFFFFF` inside Skia mask math — they are data, not UI colors — plus Skia checker tile inputs passed in from theme). Run commands from the repo root.

---

### Task 1: Pure op-stack / geometry module `cutout-ops.ts`

**Files:**
- Create: `libs/services/companion/cutout-ops.ts`
- Test: `__tests__/unit/companion-cutout-ops.test.ts`

- [ ] **Step 1.1: Write the failing test**

```ts
// __tests__/unit/companion-cutout-ops.test.ts
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

function stroke(name: string): EditOp {
  return { kind: 'stroke', tool: 'erase', points: [{ x: 1, y: 1 }], size: 10, hardness: 1, ...( { } as object ) } as EditOp & { name?: string };
}

describe('op stack', () => {
  test('push applies, undo/redo move the cursor', () => {
    let s = createOpStack();
    expect(canUndo(s)).toBe(false);
    s = pushOp(s, stroke('a'));
    s = pushOp(s, stroke('b'));
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
    s = pushOp(s, stroke('a'));
    s = pushOp(s, stroke('b'));
    s = undoOp(s);
    s = pushOp(s, { kind: 'filter', filter: 'feather', amount: 3 });
    expect(appliedOps(s)).toHaveLength(2);
    expect(appliedOps(s)[1]).toEqual({ kind: 'filter', filter: 'feather', amount: 3 });
    expect(canRedo(s)).toBe(false);
  });

  test('undo at bottom and redo at top are no-ops', () => {
    let s = createOpStack();
    expect(undoOp(s)).toBe(s);
    s = pushOp(s, stroke('a'));
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

  test('screenToImage inverts the transform', () => {
    const v = { scale: 2, offX: 10, offY: 50 };
    const p = screenToImage(110, 150, v);
    expect(p.x).toBe(50);
    expect(p.y).toBe(50);
  });

  test('zoomAround keeps the focal point fixed', () => {
    const v = { scale: 1, offX: 0, offY: 0 };
    const next = zoomAround(v, 100, 100, 2, 0.5, 8);
    // Image point that was under (100,100) must still be under (100,100).
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
    for (let y = 2; y <= 5; y++)
      for (let x = 3; x <= 4; x++) data[(y * w + x) * 4] = 255;
    const bb = alphaBBox(data, w, h, { stride: 4, offset: 0 });
    expect(bb).toEqual({ x: 3, y: 2, width: 2, height: 4 });
  });

  test('scalePadBBox scales, pads, and clamps to bounds', () => {
    const bb = { x: 1, y: 1, width: 2, height: 2 };
    const out = scalePadBBox(bb, 10, 0.1, 25, 40);
    // x: 1*10 - 2 = 8; right: 3*10 + 2 = 32 → clamped 25
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
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `bun test __tests__/unit/companion-cutout-ops.test.ts`
Expected: FAIL — `Cannot find module '../../libs/services/companion/cutout-ops'`

- [ ] **Step 1.3: Implement the module**

```ts
// libs/services/companion/cutout-ops.ts
//
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
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `bun test __tests__/unit/companion-cutout-ops.test.ts`
Expected: PASS (all describe blocks green)

- [ ] **Step 1.5: Commit**

```bash
git add libs/services/companion/cutout-ops.ts __tests__/unit/companion-cutout-ops.test.ts
git commit -m "feat(companion): pure op-stack and view math for cutout editor"
```

---

### Task 2: `CharacterEntry.maskUri` + cutout-patch reducer + store helpers

**Files:**
- Modify: `libs/services/companion/character-library.ts`
- Modify: `libs/services/companion/character-library-store.ts`
- Test: `__tests__/unit/companion-cutout-entry.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// __tests__/unit/companion-cutout-entry.test.ts
// maskUri round-trips through serialize/parse, and updateEntryCutout patches
// a single entry without disturbing the rest of the list.

import { describe, expect, test } from 'bun:test';
import {
  parseLibraryFromJson,
  serializeLibraryToJson,
  updateEntryCutout,
  type CharacterEntry,
} from '../../libs/services/companion/character-library';

function entry(id: string, extra: Partial<CharacterEntry> = {}): CharacterEntry {
  return {
    id,
    displayName: id,
    sourceUri: `file:///src-${id}.jpg`,
    cutoutUri: `file:///cut-${id}.png`,
    thumbUri: `file:///cut-${id}.png`,
    intrinsicW: 100,
    intrinsicH: 200,
    createdAt: 1,
    ...extra,
  };
}

describe('maskUri persistence', () => {
  test('round-trips through serialize/parse', () => {
    const list = [entry('a', { maskUri: 'file:///mask-a.png', hasAlpha: true })];
    const parsed = parseLibraryFromJson(serializeLibraryToJson(list));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].maskUri).toBe('file:///mask-a.png');
  });

  test('entries without maskUri parse fine (legacy)', () => {
    const parsed = parseLibraryFromJson(serializeLibraryToJson([entry('a')]));
    expect(parsed[0].maskUri).toBeUndefined();
  });

  test('non-string maskUri is dropped, entry kept', () => {
    const raw = JSON.stringify([{ ...entry('a'), maskUri: 42 }]);
    const parsed = parseLibraryFromJson(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].maskUri).toBeUndefined();
  });
});

describe('updateEntryCutout', () => {
  test('patches the matching entry', () => {
    const list = [entry('a'), entry('b')];
    const next = updateEntryCutout(list, 'b', {
      cutoutUri: 'file:///new.png',
      thumbUri: 'file:///new.png',
      intrinsicW: 50,
      intrinsicH: 60,
      hasAlpha: true,
      maskUri: 'file:///m.png',
    });
    expect(next).not.toBe(list);
    expect(next[1].cutoutUri).toBe('file:///new.png');
    expect(next[1].maskUri).toBe('file:///m.png');
    expect(next[0]).toBe(list[0]);
  });

  test('returns the same reference when the id is missing', () => {
    const list = [entry('a')];
    expect(
      updateEntryCutout(list, 'zzz', {
        cutoutUri: 'x',
        thumbUri: 'x',
        intrinsicW: 1,
        intrinsicH: 1,
        hasAlpha: false,
      })
    ).toBe(list);
  });
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `bun test __tests__/unit/companion-cutout-entry.test.ts`
Expected: FAIL — `updateEntryCutout` is not exported / `maskUri` missing from type

- [ ] **Step 2.3: Extend `character-library.ts`**

In the `CharacterEntry` type, after `hasAlpha?: boolean;` add:

```ts
  /** Editing-resolution grayscale mask PNG (white = subject) for re-editing. */
  maskUri?: string;
```

In `parseLibraryFromJson`, next to the other optional fields:

```ts
    if (typeof candidate.maskUri === 'string') entry.maskUri = candidate.maskUri;
```

Add at the end of the file:

```ts
/** Patch applied to an entry when the cutout editor saves. */
export type CutoutPatch = Pick<
  CharacterEntry,
  'cutoutUri' | 'thumbUri' | 'intrinsicW' | 'intrinsicH' | 'hasAlpha'
> &
  Partial<Pick<CharacterEntry, 'maskUri' | 'sourceUri'>>;

/** Replace cutout fields on one entry; same reference when the id is absent. */
export function updateEntryCutout(
  list: CharacterEntry[],
  id: string,
  patch: CutoutPatch
): CharacterEntry[] {
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return list;
  const next = list.slice();
  next[idx] = { ...next[idx], ...patch };
  return next;
}
```

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `bun test __tests__/unit/companion-cutout-entry.test.ts`
Expected: PASS

- [ ] **Step 2.5: Add store wrappers**

In `libs/services/companion/character-library-store.ts`: add `updateEntryCutout` and `type CutoutPatch` to the existing import from `./character-library`, then append:

```ts
export function getCharacterById(id: string): CharacterEntry | null {
  return cache.find((c) => c.id === id) ?? null;
}

/** Apply a cutout-editor save to an existing entry. False when id is unknown. */
export function updateCharacterCutout(id: string, patch: CutoutPatch): boolean {
  const next = updateEntryCutout(cache, id, patch);
  if (next === cache) return false;
  cache = next;
  persist();
  return true;
}
```

(`CharacterEntry` is already imported as a type in that file's import block.)

- [ ] **Step 2.6: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors.

```bash
git add libs/services/companion/character-library.ts libs/services/companion/character-library-store.ts __tests__/unit/companion-cutout-entry.test.ts
git commit -m "feat(companion): persist editable maskUri on character entries"
```

---

### Task 3: Editor session hand-off module

Route params must be strings; the picked-image draft and the `onDone` callback can't ride through them. Openers register a session, pass only its id.

**Files:**
- Create: `libs/services/companion/cutout-editor-session.ts`
- Test: `__tests__/unit/companion-editor-session.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// __tests__/unit/companion-editor-session.test.ts
import { describe, expect, test } from 'bun:test';
import {
  createEditorSession,
  takeEditorSession,
} from '../../libs/services/companion/cutout-editor-session';

describe('cutout editor session', () => {
  test('take returns the registered session exactly once', () => {
    const id = createEditorSession({ mode: 'import', sourceUri: 'file:///a.jpg' });
    const s = takeEditorSession(id);
    expect(s?.sourceUri).toBe('file:///a.jpg');
    expect(takeEditorSession(id)).toBeNull();
  });

  test('ids are unique', () => {
    const a = createEditorSession({ mode: 'edit', characterId: 'x' });
    const b = createEditorSession({ mode: 'edit', characterId: 'y' });
    expect(a).not.toBe(b);
    expect(takeEditorSession(b)?.characterId).toBe('y');
    expect(takeEditorSession(a)?.characterId).toBe('x');
  });

  test('unknown id returns null', () => {
    expect(takeEditorSession('nope')).toBeNull();
  });
});
```

- [ ] **Step 3.2: Run it to verify it fails**

Run: `bun test __tests__/unit/companion-editor-session.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3.3: Implement**

```ts
// libs/services/companion/cutout-editor-session.ts
//
// In-memory hand-off between the screen that opens the cutout editor and the
// editor route. Expo Router params are strings, so the picked-image draft and
// the onDone callback travel through this registry instead; the route carries
// only the session id. Sessions are single-use (taken once on editor mount).

import type { CharacterEntry } from './character-library';

export interface CutoutEditorSession {
  mode: 'import' | 'edit';
  /** import mode — uri of the freshly picked asset. */
  sourceUri?: string;
  /** edit mode — id of the existing entry to re-edit. */
  characterId?: string;
  displayName?: string;
  groupId?: string;
  angleLabel?: string;
  /** Called once: saved entry, or null when the editor was cancelled. */
  onDone?: (entry: CharacterEntry | null) => void;
}

let nextId = 1;
const sessions = new Map<string, CutoutEditorSession>();

export function createEditorSession(session: CutoutEditorSession): string {
  const id = `cutout_${nextId++}`;
  sessions.set(id, session);
  return id;
}

export function takeEditorSession(id: string): CutoutEditorSession | null {
  const s = sessions.get(id) ?? null;
  sessions.delete(id);
  return s;
}
```

- [ ] **Step 3.4: Run the test to verify it passes**

Run: `bun test __tests__/unit/companion-editor-session.test.ts`
Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
git add libs/services/companion/cutout-editor-session.ts __tests__/unit/companion-editor-session.test.ts
git commit -m "feat(companion): single-use session hand-off for the cutout editor route"
```

---

### Task 4: i18n keys

**Files:**
- Modify: `libs/i18n/locales/en.json` (inside the existing `"companion"` object)
- Modify: `libs/i18n/locales/zh-Hant.json` (same position)

- [ ] **Step 4.1: Add the `cutout` block to `en.json`**

Inside `"companion": { … }`, after the `"composer"` block (add a comma after it):

```json
"cutout": {
  "title": "Cutout editor",
  "analyzing": "Detecting subject…",
  "manualBanner": "No subject detected — paint over the character to keep it.",
  "erase": "Erase",
  "restore": "Restore",
  "brushSize": "Brush size",
  "hardness": "Hardness",
  "feather": "Feather",
  "smooth": "Smooth",
  "shrink": "Shrink",
  "expand": "Expand",
  "undoA11y": "Undo",
  "redoA11y": "Redo",
  "compareA11y": "Hold to compare with the original",
  "backgroundA11y": "Cycle preview background",
  "maskView": "Mask",
  "reset": "Reset",
  "useOriginal": "Use original",
  "save": "Done",
  "saving": "Saving…",
  "saveFailed": "Couldn't save the cutout",
  "loadFailed": "Couldn't load this image",
  "edit": "Edit cutout",
  "discardTitle": "Discard changes?",
  "discardBody": "Your unsaved adjustments will be lost.",
  "discardKeep": "Keep editing",
  "discardLeave": "Discard"
}
```

- [ ] **Step 4.2: Add the matching block to `zh-Hant.json`**

Same position inside its `"companion"` object:

```json
"cutout": {
  "title": "去背編輯",
  "analyzing": "偵測主體中…",
  "manualBanner": "未偵測到主體 — 用筆刷塗抹要保留的角色",
  "erase": "擦除",
  "restore": "還原",
  "brushSize": "筆刷大小",
  "hardness": "硬度",
  "feather": "羽化",
  "smooth": "平滑",
  "shrink": "收縮",
  "expand": "擴張",
  "undoA11y": "復原",
  "redoA11y": "重做",
  "compareA11y": "按住對照原圖",
  "backgroundA11y": "切換預覽背景",
  "maskView": "遮罩",
  "reset": "重設",
  "useOriginal": "使用原圖",
  "save": "完成",
  "saving": "儲存中…",
  "saveFailed": "無法儲存去背結果",
  "loadFailed": "無法載入這張圖片",
  "edit": "編輯去背",
  "discardTitle": "捨棄編輯？",
  "discardBody": "尚未儲存的調整將會遺失。",
  "discardKeep": "繼續編輯",
  "discardLeave": "捨棄"
}
```

- [ ] **Step 4.3: Run the parity test**

Run: `bun test __tests__/unit/i18n.test.ts`
Expected: PASS (zh-Hans falls back via OpenCC; ja/ko are allowed to be partial)

- [ ] **Step 4.4: Commit**

```bash
git add libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json
git commit -m "feat(i18n): cutout editor strings"
```

---

### Task 5: JS bridge — `liftWithMask`

**Files:**
- Modify: `libs/services/companion/subject-lifter.ts`

- [ ] **Step 5.1: Add the mask result type and interface method**

After `SubjectLifterResult` add:

```ts
/**
 * Output of `liftWithMask`. The mask is a grayscale PNG (white = subject) at
 * exactly the same pixel size as the EXIF-normalized original; `sourceUri`
 * points at that normalized original (equals the input when no rotation was
 * applied). width/height are the normalized original's dimensions.
 */
export interface SubjectMaskResult {
  maskUri: string;
  sourceUri: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}
```

Extend the interfaces:

```ts
export interface SubjectLifter {
  isSupported(): boolean;
  lift(imageUri: string): Promise<SubjectLifterResult>;
  liftWithMask(imageUri: string): Promise<SubjectMaskResult>;
}

interface NativeSubjectLifterModule {
  isSupported?: boolean;
  lift(imageUri: string): Promise<SubjectLifterResult>;
  liftWithMask?(imageUri: string): Promise<SubjectMaskResult>;
}
```

- [ ] **Step 5.2: Implement fallback + native wiring**

Add a small error helper above `jsSubjectLifter`:

```ts
function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
```

Add to `jsSubjectLifter`:

```ts
  async liftWithMask(): Promise<SubjectMaskResult> {
    // No native segmentation — the editor opens in manual mode instead.
    throw codedError('no_native', 'subject-lifter: native module unavailable');
  },
```

In the object returned by `tryLoadNative()`, add:

```ts
    liftWithMask: (uri: string) => {
      if (!uri || typeof uri !== 'string') {
        return Promise.reject(new Error('subject-lifter: imageUri must be a non-empty string'));
      }
      if (typeof native.liftWithMask !== 'function') {
        // App updated but the native binary predates liftWithMask (needs rebuild).
        return Promise.reject(codedError('no_native', 'subject-lifter: liftWithMask not in this build'));
      }
      return native.liftWithMask(uri);
    },
```

- [ ] **Step 5.3: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors.

```bash
git add libs/services/companion/subject-lifter.ts
git commit -m "feat(companion): liftWithMask JS bridge with honest no_native fallback"
```

---

### Task 6: iOS native — mask export

**Files:**
- Modify: `plugins/templates/AniseekrSubjectLifter.swift`
- Modify: `plugins/templates/AniseekrSubjectLifter.m`

(Templates are copied verbatim by `plugins/with-subject-lifter.js` on prebuild — no plugin JS change needed.)

- [ ] **Step 6.1: Update the Swift header comment**

Extend the "Exposes to JS" comment block (lines 18–20) to:

```swift
//  Exposes to JS (NativeModules.AniseekrSubjectLifter):
//    constant isSupported   : Bool
//    lift(imageUri)         -> { uri, width, height, hasAlpha }
//    liftWithMask(imageUri) -> { maskUri, sourceUri, width, height, hasAlpha }
//      maskUri is a grayscale PNG (white = subject) at exactly the size of the
//      EXIF-normalized original; sourceUri is that normalized original.
```

- [ ] **Step 6.2: Add `liftWithMask` and helpers to the Swift template**

Insert after the existing `lift` method:

```swift
  @objc(liftWithMask:resolver:rejecter:)
  func liftWithMask(_ imageUri: String,
                    resolver resolve: @escaping RCTPromiseResolveBlock,
                    rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let loaded = self.loadNormalizedImage(from: imageUri) else {
        reject("decode_failed", "Could not decode image at \(imageUri)", nil)
        return
      }
      do {
        let maskPNG: Data
        if #available(iOS 17.0, *) {
          maskPNG = try self.foregroundMaskPNG(loaded.cgImage)
        } else {
          maskPNG = try self.personMaskPNG(loaded.cgImage)
        }
        guard let maskURL = self.writeCacheFile(maskPNG, prefix: "subject-mask", ext: "png") else {
          reject("write_failed", "Could not write mask PNG to cache", nil)
          return
        }
        // The mask aligns with the EXIF-normalized pixels; when normalization
        // rotated the image, hand JS a re-encoded copy so Skia (which ignores
        // EXIF) decodes pixels that line up with the mask.
        var sourceUriOut = imageUri
        if loaded.wasRotated {
          guard let jpeg = UIImage(cgImage: loaded.cgImage).jpegData(compressionQuality: 0.95),
                let srcURL = self.writeCacheFile(jpeg, prefix: "subject-source", ext: "jpg") else {
            reject("write_failed", "Could not write normalized source", nil)
            return
          }
          sourceUriOut = srcURL.absoluteString
        }
        resolve([
          "maskUri": maskURL.absoluteString,
          "sourceUri": sourceUriOut,
          "width": loaded.cgImage.width,
          "height": loaded.cgImage.height,
          "hasAlpha": true,
        ])
      } catch let LiftError.noSubject(message) {
        reject("no_subject", message, nil)
      } catch {
        reject("lift_failed", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Mask generation

  @available(iOS 17.0, *)
  private func foregroundMaskPNG(_ cgImage: CGImage) throws -> Data {
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      throw LiftError.noSubject("No subject detected in the image")
    }
    let buffer = try observation.generateScaledMaskForImage(
      forInstances: observation.allInstances,
      from: handler
    )
    return try grayscalePNG(
      fromPixelBuffer: buffer,
      targetSize: CGSize(width: cgImage.width, height: cgImage.height)
    )
  }

  private func personMaskPNG(_ cgImage: CGImage) throws -> Data {
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8
    try handler.perform([request])
    guard let mask = request.results?.first?.pixelBuffer else {
      throw LiftError.noSubject("No person detected in the image")
    }
    return try grayscalePNG(
      fromPixelBuffer: mask,
      targetSize: CGSize(width: cgImage.width, height: cgImage.height)
    )
  }

  /// Renders a (possibly smaller / float-format) Vision mask buffer to a PNG
  /// scaled to the original's pixel size.
  private func grayscalePNG(fromPixelBuffer buffer: CVPixelBuffer, targetSize: CGSize) throws -> Data {
    var ci = CIImage(cvPixelBuffer: buffer)
    let sx = targetSize.width / ci.extent.width
    let sy = targetSize.height / ci.extent.height
    if abs(sx - 1) > 0.001 || abs(sy - 1) > 0.001 {
      ci = ci.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
    }
    let rect = CGRect(origin: .zero, size: targetSize)
    guard let cg = ciContext.createCGImage(ci, from: rect) else {
      throw LiftError.noSubject("Could not render mask")
    }
    guard let data = UIImage(cgImage: cg).pngData() else {
      throw LiftError.noSubject("Could not encode mask PNG")
    }
    return data
  }

  private func writeCacheFile(_ data: Data, prefix: String, ext: String) -> URL? {
    guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
    else { return nil }
    let name = "\(prefix)-\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
    let fileURL = dir.appendingPathComponent(name)
    do {
      try data.write(to: fileURL, options: .atomic)
      return fileURL
    } catch {
      return nil
    }
  }

  /// Like loadCGImage, but reports whether EXIF normalization rotated pixels.
  private func loadNormalizedImage(from uri: String) -> (cgImage: CGImage, wasRotated: Bool)? {
    var path = uri
    if let url = URL(string: uri), url.isFileURL {
      path = url.path
    } else if uri.hasPrefix("file://") {
      path = String(uri.dropFirst("file://".count))
    }
    guard let image = UIImage(contentsOfFile: path) else { return nil }
    let wasRotated = image.imageOrientation != .up
    guard let cg = image.normalizedUp().cgImage else { return nil }
    return (cg, wasRotated)
  }
```

- [ ] **Step 6.3: Export the method in the ObjC bridge**

In `plugins/templates/AniseekrSubjectLifter.m`, after the existing `RCT_EXTERN_METHOD(lift:…)`:

```objc
RCT_EXTERN_METHOD(liftWithMask:(NSString *)imageUri
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
```

- [ ] **Step 6.4: Commit**

```bash
git add plugins/templates/AniseekrSubjectLifter.swift plugins/templates/AniseekrSubjectLifter.m
git commit -m "feat(native-ios): liftWithMask returns full-size mask + normalized source"
```

---

### Task 7: Android native — confidence mask export

**Files:**
- Modify: `plugins/templates/AniseekrSubjectLifterModule.kt.template`

- [ ] **Step 7.1: Add `liftWithMask` and refactor decode**

Add after the existing `lift` method:

```kotlin
  /**
   * Returns a full-input-size grayscale mask PNG (white = subject) plus the
   * EXIF-normalized source the mask aligns with. ML Kit's foreground
   * confidence mask covers all detected subjects, matching iOS allInstances.
   */
  @ReactMethod
  fun liftWithMask(imageUri: String, promise: Promise) {
    val decoded = decodeOrientedTracked(imageUri)
    if (decoded == null) {
      promise.reject("decode_failed", "Could not decode image at $imageUri")
      return
    }
    val (bitmap, wasRotated) = decoded

    val options = SubjectSegmenterOptions.Builder()
      .enableForegroundConfidenceMask()
      .build()
    val segmenter = SubjectSegmentation.getClient(options)
    val input = InputImage.fromBitmap(bitmap, 0)

    segmenter.process(input)
      .addOnSuccessListener { result ->
        val mask = result.foregroundConfidenceMask
        if (mask == null) {
          promise.reject("no_subject", "No subject detected in the image")
          segmenter.close()
          return@addOnSuccessListener
        }
        try {
          val w = bitmap.width
          val h = bitmap.height
          val pixels = IntArray(w * h)
          mask.rewind()
          for (i in 0 until w * h) {
            val v = (mask.get() * 255f).toInt().coerceIn(0, 255)
            pixels[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
          }
          val maskBitmap = Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888)
          val maskFile = File(ctx.cacheDir, "subject-mask-${System.currentTimeMillis()}.png")
          FileOutputStream(maskFile).use { stream ->
            maskBitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
          }
          maskBitmap.recycle()

          // Skia on the JS side ignores EXIF — hand it a normalized copy when
          // the decode applied a rotation, so mask and pixels line up.
          var sourceUriOut = imageUri
          if (wasRotated) {
            val srcFile = File(ctx.cacheDir, "subject-source-${System.currentTimeMillis()}.jpg")
            FileOutputStream(srcFile).use { stream ->
              bitmap.compress(Bitmap.CompressFormat.JPEG, 95, stream)
            }
            sourceUriOut = "file://${srcFile.absolutePath}"
          }

          val map = Arguments.createMap().apply {
            putString("maskUri", "file://${maskFile.absolutePath}")
            putString("sourceUri", sourceUriOut)
            putInt("width", w)
            putInt("height", h)
            putBoolean("hasAlpha", true)
          }
          promise.resolve(map)
        } catch (e: Exception) {
          promise.reject("write_failed", e.localizedMessage, e)
        } finally {
          segmenter.close()
        }
      }
      .addOnFailureListener { e ->
        segmenter.close()
        promise.reject("lift_failed", e.localizedMessage, e)
      }
  }
```

Then refactor `decodeOriented` so both methods share EXIF handling — replace its body with a wrapper and add the tracked variant:

```kotlin
  /** Decodes a file:// (or bare path) image, applying its EXIF rotation. */
  private fun decodeOriented(imageUri: String): Bitmap? =
    decodeOrientedTracked(imageUri)?.first

  /** Like decodeOriented, but also reports whether a rotation was applied. */
  private fun decodeOrientedTracked(imageUri: String): Pair<Bitmap, Boolean>? {
    val path = when {
      imageUri.startsWith("file://") -> imageUri.removePrefix("file://")
      else -> imageUri
    }
    val decoded = BitmapFactory.decodeFile(path) ?: return null
    return try {
      val exif = ExifInterface(path)
      val orientation = exif.getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL
      )
      val degrees = when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
      if (degrees == 0f) {
        Pair(decoded, false)
      } else {
        val matrix = Matrix().apply { postRotate(degrees) }
        val rotated =
          Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (rotated != decoded) decoded.recycle()
        Pair(rotated, true)
      }
    } catch (e: Exception) {
      Pair(decoded, false)
    }
  }
```

(Delete the old `decodeOriented` body it replaces. The class doc comment should also mention `liftWithMask`.)

- [ ] **Step 7.2: Commit**

```bash
git add plugins/templates/AniseekrSubjectLifterModule.kt.template
git commit -m "feat(native-android): liftWithMask via ML Kit foreground confidence mask"
```

---

### Task 8: Skia mask service `cutout-mask.ts`

All Skia-touching mask work: loading, scaling, stroke/filter application, replay, final composite + save. No unit tests (requires native Skia); exercised on device in Task 14.

**Files:**
- Create: `libs/services/companion/cutout-mask.ts`

- [ ] **Step 8.1: Implement the module**

```ts
// libs/services/companion/cutout-mask.ts
//
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
import type { SkImage, SkPaint, SkPath } from '@shopify/react-native-skia';
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

/** How much of the brush radius the soft edge occupies at hardness 0. */
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
function snapshotDetached(surface: ReturnType<typeof Skia.Surface.MakeOffscreen>): SkImage {
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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

/** Draw `src` scaled into a fresh w×h image. */
export function scaleImage(src: SkImage, w: number, h: number): SkImage {
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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
  const surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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
      paint.setImageFilter(Skia.ImageFilter.MakeDilate(r, r, Skia.ImageFilter.MakeErode(r, r, closing)));
      break;
    }
  }
  canvas.drawImage(mask, 0, 0, paint);
  return snapshotDetached(surface);
}

/** Replay `ops` on top of `base`, returning the resulting mask. */
export function rebuildMask(base: SkImage, ops: EditOp[], w: number, h: number): SkImage {
  let surface = Skia.Surface.MakeOffscreen(w, h);
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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
      surface = Skia.Surface.MakeOffscreen(w, h);
      if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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

/** Checker tile for the transparency background; colors come from the theme. */
export function makeCheckerImage(cell: number, colorA: string, colorB: string): SkImage {
  const surface = Skia.Surface.MakeOffscreen(cell * 2, cell * 2);
  if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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
    // ignore — stale file is the worst case
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
    const surface = Skia.Surface.MakeOffscreen(fullW, fullH);
    if (!surface) throw new Error('cutout-mask: failed to allocate Skia surface');
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
    const out = Skia.Surface.MakeOffscreen(crop.width, crop.height);
    if (!out) throw new Error('cutout-mask: failed to allocate Skia surface');
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
```

- [ ] **Step 8.2: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors. (If `File.copy` or `Directory.create` signatures differ, check `node_modules/expo-file-system/build/*.d.ts` and adjust — the new API is class-based.)

```bash
git add libs/services/companion/cutout-mask.ts
git commit -m "feat(companion): Skia mask service — strokes, filters, replay, full-res save"
```

---

### Task 9: `useCutoutEditor` hook

**Files:**
- Create: `libs/services/companion/use-cutout-editor.ts`

- [ ] **Step 9.1: Implement the hook**

```ts
// libs/services/companion/use-cutout-editor.ts
//
// State owner for the cutout editor screen (CLAUDE.md rule 9): editing-phase
// machine, op stack with undo/redo, committed mask image, and the save
// pipeline. High-frequency gesture state lives in the canvas component's
// SharedValues — this hook only sees committed strokes.
//
// Intermediate SkImages replaced through React state are NOT manually
// disposed: the declarative canvas may still reference them for an in-flight
// frame, so we lean on JSI finalizers. Clearly-owned temporaries (full-res
// decodes, surfaces) are disposed in cutout-mask.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SkImage } from '@shopify/react-native-skia';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import {
  getCharacterById,
  updateCharacterCutout,
  upsertCharacter,
} from './character-library-store';
import type { CharacterEntry } from './character-library';
import type { CutoutEditorSession } from './cutout-editor-session';
import {
  appliedOps,
  canRedo,
  canUndo,
  createOpStack,
  editScale,
  pushOp,
  redoOp,
  undoOp,
  type EditOp,
  type OpStack,
} from './cutout-ops';
import {
  applyOpToMask,
  copyIntoCompanionDir,
  loadSkImage,
  makeWhiteMask,
  rebuildMask,
  renderAndSaveCutout,
  scaleImage,
  tryDeleteOwnedFile,
} from './cutout-mask';
import { subjectLifter } from './subject-lifter';

export type EditorPhase = 'analyzing' | 'ready' | 'manual' | 'failed';

export type SaveResult =
  | { status: 'saved'; entry: CharacterEntry }
  | { status: 'full' }
  | { status: 'error' };

interface EditorImages {
  /** Editing-resolution original for display. */
  original: SkImage;
  /** Committed mask (base + applied ops). */
  mask: SkImage;
  imgW: number;
  imgH: number;
}

export interface CutoutEditor {
  phase: EditorPhase;
  images: EditorImages | null;
  canUndo: boolean;
  canRedo: boolean;
  /** True when at least one op is applied (dirty check for discard prompt). */
  dirty: boolean;
  saving: boolean;
  commitOp: (op: EditOp) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  save: () => Promise<SaveResult>;
  saveAsOriginal: () => Promise<SaveResult>;
}

export function useCutoutEditor(session: CutoutEditorSession | null): CutoutEditor {
  const [phase, setPhase] = useState<EditorPhase>('analyzing');
  const [images, setImages] = useState<EditorImages | null>(null);
  const [stack, setStack] = useState<OpStack>(() => createOpStack());
  const [saving, setSaving] = useState(false);

  // Stable per-mount facts, resolved by the load effect.
  const baseMaskRef = useRef<SkImage | null>(null);
  const baseIsAutoRef = useRef(false);
  const sourceUriRef = useRef<string | null>(null); // normalized full-res
  const entryRef = useRef<CharacterEntry | null>(null); // edit mode only

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session) return;
      try {
        let sourceUri: string;
        let existingMaskUri: string | null = null;
        if (session.mode === 'edit') {
          const entry = getCharacterById(session.characterId ?? '');
          if (!entry) throw new Error('character not found');
          entryRef.current = entry;
          sourceUri = entry.sourceUri;
          existingMaskUri = entry.maskUri ?? null;
        } else {
          if (!session.sourceUri) throw new Error('missing sourceUri');
          sourceUri = session.sourceUri;
        }

        let maskFull: SkImage | null = null;
        let normalizedUri = sourceUri;
        let auto = false;

        if (existingMaskUri) {
          // Re-edit: stored mask already aligns with the stored source.
          maskFull = await loadSkImage(existingMaskUri);
          auto = true;
        } else {
          try {
            const lifted = await subjectLifter.liftWithMask(sourceUri);
            normalizedUri = lifted.sourceUri;
            maskFull = await loadSkImage(lifted.maskUri);
            auto = true;
          } catch (err) {
            const code = (err as { code?: string }).code;
            if (code !== 'no_subject' && code !== 'no_native') throw err;
            // Manual rescue mode: normalize EXIF ourselves (Skia ignores it),
            // start from a full-white mask the user erases by hand.
            const normalized = await manipulateAsync(sourceUri, [], {
              compress: 0.95,
              format: SaveFormat.JPEG,
            });
            normalizedUri = normalized.uri;
          }
        }

        const fullOriginal = await loadSkImage(normalizedUri);
        const scale = editScale(fullOriginal.width(), fullOriginal.height());
        const imgW = Math.max(1, Math.round(fullOriginal.width() * scale));
        const imgH = Math.max(1, Math.round(fullOriginal.height() * scale));
        const original = scaleImage(fullOriginal, imgW, imgH);
        fullOriginal.dispose();

        const baseMask = maskFull ? scaleImage(maskFull, imgW, imgH) : makeWhiteMask(imgW, imgH);
        maskFull?.dispose();

        if (cancelled) return;
        baseMaskRef.current = baseMask;
        baseIsAutoRef.current = auto;
        sourceUriRef.current = normalizedUri;
        setImages({ original, mask: baseMask, imgW, imgH });
        setPhase(auto ? 'ready' : 'manual');
      } catch (err) {
        console.warn('[cutout-editor] load failed', err);
        if (!cancelled) setPhase('failed');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // Session is taken once on mount and never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitOp = useCallback((op: EditOp) => {
    setStack((prev) => pushOp(prev, op));
    setImages((prev) => {
      if (!prev) return prev;
      return { ...prev, mask: applyOpToMask(prev.mask, op, prev.imgW, prev.imgH) };
    });
  }, []);

  const rebuildTo = useCallback((nextStack: OpStack) => {
    setStack(nextStack);
    setImages((prev) => {
      const base = baseMaskRef.current;
      if (!prev || !base) return prev;
      const ops = appliedOps(nextStack);
      const mask = ops.length === 0 ? base : rebuildMask(base, ops, prev.imgW, prev.imgH);
      return { ...prev, mask };
    });
  }, []);

  const undo = useCallback(() => rebuildTo(undoOp(stack)), [rebuildTo, stack]);
  const redo = useCallback(() => rebuildTo(redoOp(stack)), [rebuildTo, stack]);
  const reset = useCallback(() => rebuildTo(createOpStack()), [rebuildTo]);

  const buildEntry = useCallback(
    (patch: {
      cutoutUri: string;
      thumbUri: string;
      intrinsicW: number;
      intrinsicH: number;
      hasAlpha: boolean;
      maskUri?: string;
      sourceUri: string;
    }): CharacterEntry | null => {
      if (!session) return null;
      if (session.mode === 'edit' && entryRef.current) {
        return { ...entryRef.current, ...patch };
      }
      return {
        id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        displayName: session.displayName ?? 'Character',
        createdAt: Date.now(),
        ...(session.groupId ? { groupId: session.groupId } : {}),
        ...(session.angleLabel ? { angleLabel: session.angleLabel } : {}),
        ...patch,
      };
    },
    [session]
  );

  const persistEntry = useCallback(
    (entry: CharacterEntry): SaveResult => {
      const previous = entryRef.current;
      const ok =
        previous != null
          ? updateCharacterCutout(entry.id, {
              cutoutUri: entry.cutoutUri,
              thumbUri: entry.thumbUri,
              intrinsicW: entry.intrinsicW,
              intrinsicH: entry.intrinsicH,
              hasAlpha: entry.hasAlpha ?? false,
              maskUri: entry.maskUri,
              sourceUri: entry.sourceUri,
            })
          : upsertCharacter(entry);
      if (!ok) return previous != null ? { status: 'error' } : { status: 'full' };
      // Replace files we owned for this entry (best-effort).
      if (previous) {
        if (previous.cutoutUri !== entry.cutoutUri) tryDeleteOwnedFile(previous.cutoutUri);
        if (previous.maskUri && previous.maskUri !== entry.maskUri) {
          tryDeleteOwnedFile(previous.maskUri);
        }
      }
      return { status: 'saved', entry };
    },
    []
  );

  /** Persist the current mask as the entry's cutout. */
  const save = useCallback(async (): Promise<SaveResult> => {
    const sourceUri = sourceUriRef.current;
    if (!session || !images || !sourceUri || saving) return { status: 'error' };
    // Manual mode with zero strokes = "keep everything" = the original image.
    const edited = appliedOps(stack).length > 0;
    if (!baseIsAutoRef.current && !edited) return saveAsOriginalInner();
    setSaving(true);
    try {
      const stem = entryRef.current?.id ?? `char_${Date.now()}`;
      const result = await renderAndSaveCutout({
        originalUri: sourceUri,
        mask: images.mask,
        fileStem: stem,
      });
      const durableSource = ensureDurableSource(sourceUri, stem);
      const entry = buildEntry({
        cutoutUri: result.cutoutUri,
        thumbUri: result.cutoutUri,
        intrinsicW: result.width,
        intrinsicH: result.height,
        hasAlpha: true,
        maskUri: result.maskUri,
        sourceUri: durableSource,
      });
      if (!entry) return { status: 'error' };
      return persistEntry(entry);
    } catch (err) {
      console.warn('[cutout-editor] save failed', err);
      return { status: 'error' };
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildEntry, images, persistEntry, saving, session, stack]);

  const saveAsOriginalInner = useCallback(async (): Promise<SaveResult> => {
    const sourceUri = sourceUriRef.current;
    if (!session || !images || !sourceUri) return { status: 'error' };
    setSaving(true);
    try {
      const stem = entryRef.current?.id ?? `char_${Date.now()}`;
      const durableSource = ensureDurableSource(sourceUri, stem);
      const entry = buildEntry({
        cutoutUri: durableSource,
        thumbUri: durableSource,
        intrinsicW: Math.round(images.imgW / editScaleOf(images)),
        intrinsicH: Math.round(images.imgH / editScaleOf(images)),
        hasAlpha: false,
        sourceUri: durableSource,
      });
      if (!entry) return { status: 'error' };
      return persistEntry(entry);
    } catch (err) {
      console.warn('[cutout-editor] save-as-original failed', err);
      return { status: 'error' };
    } finally {
      setSaving(false);
    }
  }, [buildEntry, images, persistEntry, session]);

  return {
    phase,
    images,
    canUndo: canUndo(stack),
    canRedo: canRedo(stack),
    dirty: appliedOps(stack).length > 0,
    saving,
    commitOp,
    undo,
    redo,
    reset,
    save,
    saveAsOriginal: saveAsOriginalInner,
  };
}

/** images carries editing-res dims; recover the full-res factor ≈ 1/editScale. */
function editScaleOf(images: EditorImages): number {
  // imgW/imgH were produced from the full-res dims via editScale, which only
  // ever shrinks. The exact full dims are re-derived at save from the source
  // decode, so a close ratio is fine for the no-cutout metadata path.
  return Math.min(1, Math.max(images.imgW, images.imgH) / 2048) === 1
    ? 1
    : Math.max(images.imgW, images.imgH) / 2048;
}

/** Source files must outlive the picker cache — copy into documents once. */
function ensureDurableSource(uri: string, stem: string): string {
  if (uri.includes('/companion/')) return uri;
  const ext = uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  return copyIntoCompanionDir(uri, `source-${stem}.${ext}`);
}
```

**Note for the implementer:** `editScaleOf` is awkward — simpler and better: store the full-res dims in a ref during load (`fullDimsRef.current = {w, h}` right after `loadSkImage(normalizedUri)`) and use those directly in `saveAsOriginalInner`. Do that instead of the ratio reconstruction if it keeps the code clearer (it does); the plan shows the ref-free variant only to keep `EditorImages` minimal. Either way `intrinsicW/H` must be the FULL-RES dims for the no-cutout path.

- [ ] **Step 9.2: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors. (Watch the `saveAsOriginalInner` forward reference: define it before `save` or hoist with `function` declarations.)

```bash
git add libs/services/companion/use-cutout-editor.ts
git commit -m "feat(companion): cutout editor state hook — phases, op stack, save pipeline"
```

---

### Task 10: Editor canvas `CutoutEditorCanvas.tsx`

**Files:**
- Create: `components/companion/cutout/CutoutEditorCanvas.tsx`

- [ ] **Step 10.1: Implement the canvas**

```tsx
// components/companion/cutout/CutoutEditorCanvas.tsx
//
// The drawing board. Renders: checker/black/white backdrop → ghost of the
// original (low opacity, shows removed regions) → original clipped by a
// luminance Mask (committed mask image + the live in-progress stroke path) →
// optional red mask overlay → brush cursor ring.
//
// Gestures (all on the UI thread; no React state per CLAUDE.md rule 9):
//   1 finger  — paint (fails over to pinch when a 2nd finger lands)
//   2 fingers — pinch zoom (focal) + pan
//   double tap — reset view to fit
// The live stroke is an SkPath in a SharedValue mutated in worklets via
// notifyChange; React only hears about the stroke once, on commit.

import { useCallback, useEffect, useMemo } from 'react';
import {
  Canvas,
  Circle,
  Fill,
  Group,
  Image as SkiaImage,
  ImageShader,
  Mask,
  Path,
  Rect,
  Skia,
  notifyChange,
} from '@shopify/react-native-skia';
import type { SkImage, SkPath } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../../../context/ThemeContext';
import { fitContain, type BrushTool, type StrokePoint } from '../../../libs/services/companion/cutout-ops';
import { makeCheckerImage } from '../../../libs/services/companion/cutout-mask';

export type EditorBackground = 'checker' | 'black' | 'white';

// Luminance values for the live mask stroke — data, not UI colors.
const STROKE_RESTORE = '#FFFFFF';
const STROKE_ERASE = '#000000';
const GHOST_OPACITY = 0.25;
const MIN_ZOOM_FACTOR = 0.8; // × fit
const MAX_ZOOM_FACTOR = 10; // × fit

export interface CutoutEditorCanvasProps {
  original: SkImage;
  mask: SkImage;
  imgW: number;
  imgH: number;
  canvasW: number;
  canvasH: number;
  tool: BrushTool;
  /** Brush diameter in mask pixels. */
  brushSize: number;
  /** 0..1 hard→soft handled at commit; live stroke stays hard for speed. */
  brushHardness: number;
  background: EditorBackground;
  maskOverlay: boolean;
  comparing: boolean;
  onStrokeEnd: (points: StrokePoint[]) => void;
}

export function CutoutEditorCanvas({
  original,
  mask,
  imgW,
  imgH,
  canvasW,
  canvasH,
  tool,
  brushSize,
  background,
  maskOverlay,
  comparing,
  onStrokeEnd,
}: CutoutEditorCanvasProps) {
  const { theme } = useTheme();

  const scale = useSharedValue(1);
  const offX = useSharedValue(0);
  const offY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startOffX = useSharedValue(0);
  const startOffY = useSharedValue(0);
  const fitScale = useSharedValue(1);

  const livePath = useSharedValue<SkPath>(Skia.Path.Make());
  const livePoints = useSharedValue<StrokePoint[]>([]);
  const cursorX = useSharedValue(-1000);
  const cursorY = useSharedValue(-1000);
  const cursorVisible = useSharedValue(false);

  // Re-fit whenever geometry changes.
  useEffect(() => {
    const v = fitContain(imgW, imgH, canvasW, canvasH);
    fitScale.value = v.scale;
    scale.value = v.scale;
    offX.value = v.offX;
    offY.value = v.offY;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgW, imgH, canvasW, canvasH]);

  const checker = useMemo(
    () => makeCheckerImage(8, theme.background.secondary, theme.background.tertiary),
    [theme.background.secondary, theme.background.tertiary]
  );

  const commitStroke = useCallback(
    (points: StrokePoint[]) => {
      if (points.length > 0) onStrokeEnd(points);
    },
    [onStrokeEnd]
  );

  const paint = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onTouchesDown((e, mgr) => {
          if (e.numberOfTouches > 1) mgr.fail();
        })
        .onStart((e) => {
          'worklet';
          const ix = (e.x - offX.value) / scale.value;
          const iy = (e.y - offY.value) / scale.value;
          const p = Skia.Path.Make();
          p.moveTo(ix, iy);
          p.lineTo(ix + 0.01, iy);
          livePath.value = p;
          livePoints.value = [{ x: ix, y: iy }];
          cursorX.value = e.x;
          cursorY.value = e.y;
          cursorVisible.value = true;
        })
        .onUpdate((e) => {
          'worklet';
          const ix = (e.x - offX.value) / scale.value;
          const iy = (e.y - offY.value) / scale.value;
          livePath.value.lineTo(ix, iy);
          notifyChange(livePath);
          livePoints.value.push({ x: ix, y: iy });
          cursorX.value = e.x;
          cursorY.value = e.y;
        })
        .onEnd(() => {
          'worklet';
          runOnJS(commitStroke)(livePoints.value.slice());
        })
        .onFinalize(() => {
          'worklet';
          livePath.value = Skia.Path.Make();
          livePoints.value = [];
          cursorVisible.value = false;
        }),
    // SharedValues are stable; only the JS callback varies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commitStroke]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          startScale.value = scale.value;
          startOffX.value = offX.value;
          startOffY.value = offY.value;
        })
        .onUpdate((e) => {
          'worklet';
          const minS = fitScale.value * MIN_ZOOM_FACTOR;
          const maxS = fitScale.value * MAX_ZOOM_FACTOR;
          const next = Math.min(maxS, Math.max(minS, startScale.value * e.scale));
          const k = next / startScale.value;
          scale.value = next;
          offX.value = e.focalX - (e.focalX - startOffX.value) * k;
          offY.value = e.focalY - (e.focalY - startOffY.value) * k;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const panTwo = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .maxPointers(2)
        .onChange((e) => {
          'worklet';
          offX.value += e.changeX;
          offY.value += e.changeY;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          'worklet';
          const fw = fitScale.value;
          scale.value = fw;
          offX.value = (canvasW - imgW * fw) / 2;
          offY.value = (canvasH - imgH * fw) / 2;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canvasW, canvasH, imgW, imgH]
  );

  const gesture = useMemo(
    () => Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, panTwo), paint),
    [doubleTap, pinch, panTwo, paint]
  );

  const groupTransform = useDerivedValue(() => [
    { translateX: offX.value },
    { translateY: offY.value },
    { scale: scale.value },
  ]);

  const cursorR = useDerivedValue(() => (brushSize / 2) * scale.value, [brushSize]);

  const liveColor = tool === 'restore' ? STROKE_RESTORE : STROKE_ERASE;

  const maskLayer = (
    <Group>
      <SkiaImage image={mask} x={0} y={0} width={imgW} height={imgH} fit="fill" />
      <Path
        path={livePath}
        style="stroke"
        strokeWidth={brushSize}
        strokeCap="round"
        strokeJoin="round"
        color={liveColor}
      />
    </Group>
  );

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width: canvasW, height: canvasH }}>
        {background === 'checker' ? (
          <Rect x={0} y={0} width={canvasW} height={canvasH}>
            <ImageShader image={checker} tx="repeat" ty="repeat" />
          </Rect>
        ) : (
          <Fill color={background === 'black' ? theme.background.primary : '#FFFFFF'} />
        )}
        <Group transform={groupTransform}>
          <SkiaImage
            image={original}
            x={0}
            y={0}
            width={imgW}
            height={imgH}
            fit="fill"
            opacity={comparing ? 1 : GHOST_OPACITY}
          />
          {!comparing ? (
            <Mask mode="luminance" mask={maskLayer}>
              <SkiaImage image={original} x={0} y={0} width={imgW} height={imgH} fit="fill" />
            </Mask>
          ) : null}
          {!comparing && maskOverlay ? (
            <Mask mode="luminance" mask={maskLayer}>
              <Rect x={0} y={0} width={imgW} height={imgH} color={theme.accent} opacity={0.4} />
            </Mask>
          ) : null}
        </Group>
        <Circle
          cx={cursorX}
          cy={cursorY}
          r={cursorR}
          style="stroke"
          strokeWidth={1.5}
          color={theme.text.primary}
          opacity={0.9}
        />
      </Canvas>
    </GestureDetector>
  );
}
```

Notes for the implementer:
- The `'#FFFFFF'` for the white background mode is the user-chosen "preview on white" surface, intentionally absolute (like the checker, it represents *what the sticker looks like on white*, not themed chrome). Keep the comment in code.
- If `notifyChange` import fails, it's exported from `@shopify/react-native-skia` root (verified in 2.6.2 typings at `external/reanimated/interpolators`).
- If `<Path>` rejects a SharedValue path prop, wrap with `useDerivedValue(() => livePath.value)`.

- [ ] **Step 10.2: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors.

```bash
git add components/companion/cutout/CutoutEditorCanvas.tsx
git commit -m "feat(companion): Skia editing canvas with UI-thread brush + zoom gestures"
```

---

### Task 11: Top bar + tool dock components

**Files:**
- Create: `components/companion/cutout/EditorTopBar.tsx`
- Create: `components/companion/cutout/EditorDock.tsx`

- [ ] **Step 11.1: Implement `EditorTopBar`**

```tsx
// components/companion/cutout/EditorTopBar.tsx
//
// Cancel / undo / redo / hold-to-compare / save. The compare button reports
// press-in/out so the screen can flip the canvas into original-only view.

import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';

export interface EditorTopBarProps {
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  onCancel: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCompareIn: () => void;
  onCompareOut: () => void;
  onSave: () => void;
}

export function EditorTopBar({
  canUndo,
  canRedo,
  saving,
  onCancel,
  onUndo,
  onRedo,
  onCompareIn,
  onCompareOut,
  onSave,
}: EditorTopBarProps) {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View style={styles.row}>
      <ThemedIconButton
        accessibilityLabel={t('common.close')}
        icon={(c) => <Ionicons name="close" size={20} color={c} />}
        onPress={onCancel}
      />
      <View style={styles.center}>
        <ThemedIconButton
          accessibilityLabel={t('companion.cutout.undoA11y')}
          icon={(c) => <Ionicons name="arrow-undo" size={18} color={c} />}
          onPress={onUndo}
          disabled={!canUndo}
        />
        <ThemedIconButton
          accessibilityLabel={t('companion.cutout.redoA11y')}
          icon={(c) => <Ionicons name="arrow-redo" size={18} color={c} />}
          onPress={onRedo}
          disabled={!canRedo}
        />
        <Pressable
          onPressIn={onCompareIn}
          onPressOut={onCompareOut}
          accessibilityRole="button"
          accessibilityLabel={t('companion.cutout.compareA11y')}
          hitSlop={8}
          style={({ pressed }) => [
            styles.compareBtn,
            {
              backgroundColor: pressed ? theme.background.tertiary : theme.background.secondary,
              borderColor: theme.glassBorder,
            },
          ]}>
          <Ionicons name="eye-outline" size={18} color={theme.text.primary} />
        </Pressable>
      </View>
      <ThemedButton
        label={saving ? t('companion.cutout.saving') : t('companion.cutout.save')}
        onPress={onSave}
        loading={saving}
        disabled={saving}
        size="sm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  center: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  compareBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
```

(Check `ThemedIconButton`'s actual prop shape in `components/themed/ThemedIconButton.tsx` before wiring — the icon render-prop signature above matches CLAUDE.md's example; adjust `disabled` prop name if it differs.)

- [ ] **Step 11.2: Implement `EditorDock`**

```tsx
// components/companion/cutout/EditorDock.tsx
//
// Bottom tool dock: erase/restore segment, brush sliders, edge-tool chips
// (each tap = one undoable op), and view controls (background cycle, mask
// overlay, reset, use-original).

import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedSurface, ThemedText, readableTextOn } from '../../themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { BrushTool, MaskFilterKind } from '../../../libs/services/companion/cutout-ops';
import type { EditorBackground } from './CutoutEditorCanvas';

export interface EditorDockProps {
  tool: BrushTool;
  brushSize: number;
  brushHardness: number;
  background: EditorBackground;
  maskOverlay: boolean;
  onToolChange: (tool: BrushTool) => void;
  onBrushSizeChange: (size: number) => void;
  onBrushHardnessChange: (hardness: number) => void;
  onEdgeTool: (filter: MaskFilterKind) => void;
  onBackgroundCycle: () => void;
  onMaskOverlayToggle: () => void;
  onReset: () => void;
  onUseOriginal: () => void;
}

const EDGE_TOOLS: { key: MaskFilterKind; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'feather', icon: 'rose-outline' },
  { key: 'smooth', icon: 'water-outline' },
  { key: 'shrink', icon: 'contract-outline' },
  { key: 'expand', icon: 'expand-outline' },
];

export function EditorDock(props: EditorDockProps) {
  const { theme } = useTheme();
  const t = useT();
  const accentFg = readableTextOn(theme.accent);

  const segment = (value: BrushTool, label: string) => {
    const active = props.tool === value;
    return (
      <Pressable
        onPress={() => {
          hapticsBridge.selection();
          props.onToolChange(value);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          styles.segment,
          {
            backgroundColor: active ? theme.accent : 'transparent',
            borderColor: active ? theme.accent : theme.glassBorder,
          },
        ]}>
        <ThemedText
          variant="bodySmall"
          weight="700"
          style={{ color: active ? accentFg : theme.text.secondary }}>
          {label}
        </ThemedText>
      </Pressable>
    );
  };

  const chip = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    active = false
  ) => (
    <Pressable
      key={label}
      onPress={() => {
        hapticsBridge.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.accent : theme.background.secondary,
          borderColor: active ? theme.accent : theme.glassBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Ionicons name={icon} size={16} color={active ? accentFg : theme.text.primary} />
      <ThemedText
        variant="captionSmall"
        weight="600"
        style={{ color: active ? accentFg : theme.text.secondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedSurface variant="elevated" style={styles.dock}>
      <View style={styles.segmentRow}>
        {segment('erase', t('companion.cutout.erase'))}
        {segment('restore', t('companion.cutout.restore'))}
      </View>

      <View style={styles.sliderRow}>
        <ThemedText variant="captionSmall" tone="secondary" style={styles.sliderLabel}>
          {t('companion.cutout.brushSize')}
        </ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={8}
          maximumValue={160}
          value={props.brushSize}
          onValueChange={props.onBrushSizeChange}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.glassBorder}
          thumbTintColor={theme.accent}
        />
      </View>
      <View style={styles.sliderRow}>
        <ThemedText variant="captionSmall" tone="secondary" style={styles.sliderLabel}>
          {t('companion.cutout.hardness')}
        </ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={0.3}
          maximumValue={1}
          value={props.brushHardness}
          onValueChange={props.onBrushHardnessChange}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.glassBorder}
          thumbTintColor={theme.accent}
        />
      </View>

      <View style={styles.chipRow}>
        {EDGE_TOOLS.map((tool) =>
          chip(t(`companion.cutout.${tool.key}`), tool.icon, () => props.onEdgeTool(tool.key))
        )}
      </View>

      <View style={styles.chipRow}>
        {chip(t('companion.cutout.maskView'), 'contrast-outline', props.onMaskOverlayToggle, props.maskOverlay)}
        {chip(t('companion.cutout.backgroundA11y'), 'grid-outline', props.onBackgroundCycle)}
        {chip(t('companion.cutout.reset'), 'refresh-outline', props.onReset)}
        {chip(t('companion.cutout.useOriginal'), 'image-outline', props.onUseOriginal)}
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  dock: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sliderLabel: { width: 64 },
  slider: { flex: 1, height: 32 },
  chipRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
```

**Translation-key note:** `t()` keys are typed from `en.json` — the template literal `` t(`companion.cutout.${tool.key}`) `` will fail typecheck if `TranslationKey` is a literal union. If it does, replace with an explicit map: `{ feather: t('companion.cutout.feather'), smooth: t('companion.cutout.smooth'), shrink: t('companion.cutout.shrink'), expand: t('companion.cutout.expand') }[tool.key]`.

The `backgroundA11y` string doubles as the chip label; if it reads too long on device, add a short `background` key ("背景") in Task 4 instead.

- [ ] **Step 11.3: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors (fix the t() template literal as noted if it complains).

```bash
git add components/companion/cutout/EditorTopBar.tsx components/companion/cutout/EditorDock.tsx
git commit -m "feat(companion): cutout editor top bar and tool dock"
```

---### Task 12: Editor screen route

**Files:**
- Create: `app/companion/edit-cutout.tsx`

- [ ] **Step 12.1: Implement the screen**

```tsx
// app/companion/edit-cutout.tsx
//
// Full-screen cutout (去背) editing board. Reached with a single `sessionId`
// param (see cutout-editor-session.ts). Flow: analyzing (shimmer over the
// picked image) → ready (auto mask) or manual (white mask + banner) → save.
// Rule 8: three honest states — analyzing / editable result / failed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ExpoImage } from 'expo-image';
import { ThemedButton, ThemedText } from '../../components/themed';
import { Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  CutoutEditorCanvas,
  type EditorBackground,
} from '../../components/companion/cutout/CutoutEditorCanvas';
import { EditorTopBar } from '../../components/companion/cutout/EditorTopBar';
import { EditorDock } from '../../components/companion/cutout/EditorDock';
import { takeEditorSession } from '../../libs/services/companion/cutout-editor-session';
import { getCharacterLimit } from '../../libs/services/companion/character-library-store';
import { useCutoutEditor } from '../../libs/services/companion/use-cutout-editor';
import type {
  BrushTool,
  MaskFilterKind,
  StrokePoint,
} from '../../libs/services/companion/cutout-ops';

/** Per-tap edge-tool radii in mask pixels — repeat taps accumulate (undoable). */
const EDGE_AMOUNTS: Record<MaskFilterKind, number> = {
  feather: 3,
  smooth: 4,
  shrink: 3,
  expand: 3,
};

const BACKGROUNDS: EditorBackground[] = ['checker', 'black', 'white'];

export default function EditCutoutScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [session] = useState(() => takeEditorSession(sessionId ?? ''));
  const editor = useCutoutEditor(session);

  const [tool, setTool] = useState<BrushTool>('erase');
  const [brushSize, setBrushSize] = useState(48);
  const [brushHardness, setBrushHardness] = useState(0.85);
  const [background, setBackground] = useState<EditorBackground>('checker');
  const [maskOverlay, setMaskOverlay] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [canvasBox, setCanvasBox] = useState({ w: 0, h: 0 });
  const doneRef = useRef(false);

  // Opened without a session (deep link / hot reload) — nothing to edit.
  useEffect(() => {
    if (!session) router.back();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(
    (entry: Parameters<NonNullable<typeof session>['onDone'] & object>[0] | null) => {
      if (doneRef.current) return;
      doneRef.current = true;
      session?.onDone?.(entry);
      router.back();
    },
    [router, session]
  );

  const handleStrokeEnd = useCallback(
    (points: StrokePoint[]) => {
      editor.commitOp({ kind: 'stroke', tool, points, size: brushSize, hardness: brushHardness });
    },
    [brushHardness, brushSize, editor, tool]
  );

  const handleEdgeTool = useCallback(
    (filter: MaskFilterKind) => {
      editor.commitOp({ kind: 'filter', filter, amount: EDGE_AMOUNTS[filter] });
    },
    [editor]
  );

  const handleSave = useCallback(async () => {
    const result = await editor.save();
    if (result.status === 'saved') {
      hapticsBridge.success();
      finish(result.entry);
    } else if (result.status === 'full') {
      Alert.alert(t('companion.libraryFull', { limit: getCharacterLimit() }));
    } else {
      hapticsBridge.error();
      Alert.alert(t('companion.cutout.saveFailed'));
    }
  }, [editor, finish, t]);

  const handleUseOriginal = useCallback(async () => {
    const result = await editor.saveAsOriginal();
    if (result.status === 'saved') {
      hapticsBridge.success();
      finish(result.entry);
    } else if (result.status === 'full') {
      Alert.alert(t('companion.libraryFull', { limit: getCharacterLimit() }));
    } else {
      hapticsBridge.error();
      Alert.alert(t('companion.cutout.saveFailed'));
    }
  }, [editor, finish, t]);

  const handleCancel = useCallback(() => {
    if (!editor.dirty) {
      finish(null);
      return;
    }
    Alert.alert(t('companion.cutout.discardTitle'), t('companion.cutout.discardBody'), [
      { text: t('companion.cutout.discardKeep'), style: 'cancel' },
      {
        text: t('companion.cutout.discardLeave'),
        style: 'destructive',
        onPress: () => finish(null),
      },
    ]);
  }, [editor.dirty, finish, t]);

  const cycleBackground = useCallback(() => {
    setBackground((prev) => BACKGROUNDS[(BACKGROUNDS.indexOf(prev) + 1) % BACKGROUNDS.length]);
  }, []);

  const analyzingSource = useMemo(
    () => (session?.mode === 'import' ? session.sourceUri : undefined),
    [session]
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <EditorTopBar
          canUndo={editor.canUndo}
          canRedo={editor.canRedo}
          saving={editor.saving}
          onCancel={handleCancel}
          onUndo={() => {
            hapticsBridge.selectionSoft();
            editor.undo();
          }}
          onRedo={() => {
            hapticsBridge.selectionSoft();
            editor.redo();
          }}
          onCompareIn={() => setComparing(true)}
          onCompareOut={() => setComparing(false)}
          onSave={handleSave}
        />

        {editor.phase === 'manual' ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
            ]}>
            <ThemedText variant="captionSmall" tone="secondary">
              {t('companion.cutout.manualBanner')}
            </ThemedText>
          </View>
        ) : null}

        <View
          style={styles.canvasBox}
          onLayout={(e) =>
            setCanvasBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }>
          {editor.phase === 'analyzing' ? (
            <View style={styles.fill}>
              {analyzingSource ? (
                <ExpoImage
                  source={{ uri: analyzingSource }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                />
              ) : null}
              <View style={[styles.analyzeScrim, { backgroundColor: theme.background.primary }]} />
              <View style={styles.analyzeCenter}>
                <ActivityIndicator color={theme.accent} />
                <ThemedText variant="bodySmall" tone="secondary">
                  {t('companion.cutout.analyzing')}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {editor.phase === 'failed' ? (
            <View style={styles.analyzeCenter}>
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('companion.cutout.loadFailed')}
              </ThemedText>
              <ThemedButton
                variant="secondary"
                label={t('companion.cancel')}
                onPress={() => finish(null)}
              />
            </View>
          ) : null}

          {(editor.phase === 'ready' || editor.phase === 'manual') &&
          editor.images &&
          canvasBox.w > 0 ? (
            <CutoutEditorCanvas
              original={editor.images.original}
              mask={editor.images.mask}
              imgW={editor.images.imgW}
              imgH={editor.images.imgH}
              canvasW={canvasBox.w}
              canvasH={canvasBox.h}
              tool={tool}
              brushSize={brushSize}
              brushHardness={brushHardness}
              background={background}
              maskOverlay={maskOverlay}
              comparing={comparing}
              onStrokeEnd={handleStrokeEnd}
            />
          ) : null}
        </View>

        {editor.phase === 'ready' || editor.phase === 'manual' ? (
          <EditorDock
            tool={tool}
            brushSize={brushSize}
            brushHardness={brushHardness}
            background={background}
            maskOverlay={maskOverlay}
            onToolChange={setTool}
            onBrushSizeChange={setBrushSize}
            onBrushHardnessChange={setBrushHardness}
            onEdgeTool={handleEdgeTool}
            onBackgroundCycle={cycleBackground}
            onMaskOverlayToggle={() => setMaskOverlay((v) => !v)}
            onReset={() => {
              hapticsBridge.warning();
              editor.reset();
            }}
            onUseOriginal={handleUseOriginal}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  canvasBox: { flex: 1, overflow: 'hidden' },
  banner: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
  },
  analyzeScrim: { ...StyleSheet.absoluteFillObject, opacity: 0.55 },
  analyzeCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
});
```

(The gnarly `finish` parameter type just means `CharacterEntry | null` — import `CharacterEntry` type and use it directly; written here defensively in case of import cycles, but `character-library` is a leaf module so the direct type import is fine and preferred.)

- [ ] **Step 12.2: Typecheck and commit**

Run: `bunx tsc --noEmit` — Expected: no errors.

```bash
git add app/companion/edit-cutout.tsx
git commit -m "feat(companion): cutout editor screen route"
```

---

### Task 13: Flow migration — pick → editor everywhere

**Files:**
- Modify: `libs/services/companion/import-character.ts` (replace lift logic with a pure picker)
- Modify: `app/companion/library.tsx`
- Modify: `components/companion/CharacterPickerSheet.tsx`

- [ ] **Step 13.1: Check for other callers**

Run: `grep -rn "importCharacterFromLibrary" app components libs --include='*.ts' --include='*.tsx'`
Expected: only `library.tsx` and `CharacterPickerSheet.tsx` (plus the definition). If anything else shows up, migrate it the same way.

- [ ] **Step 13.2: Rewrite `import-character.ts`**

Replace the whole file with:

```ts
// Shared "pick a character image" step for the companion feature. The lift
// (去背) itself now happens inside the cutout editor screen, which the caller
// opens with the picked uri — so this module is only the permission + picker
// hop. See app/companion/edit-cutout.tsx.

import * as ImagePicker from 'expo-image-picker';

export type PickedCharacterImage =
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'ok'; uri: string; fileName: string | null; width: number; height: number };

export async function pickCharacterImage(): Promise<PickedCharacterImage> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (picked.canceled || picked.assets.length === 0) return { status: 'cancelled' };
  const asset = picked.assets[0];
  return {
    status: 'ok',
    uri: asset.uri,
    fileName: asset.fileName ?? null,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}

/** "IMG_1234.HEIC" → "IMG_1234"; null → fallback handled by the caller. */
export function displayNameFromFileName(fileName: string | null): string | null {
  if (!fileName) return null;
  const stem = fileName.replace(/\.[^.]+$/, '').trim();
  return stem.length > 0 ? stem : null;
}
```

- [ ] **Step 13.3: Migrate `library.tsx`**

Changes:

1. Imports — remove `upsertCharacter` from the store import and replace the import-character import:

```ts
import {
  deleteCharacter,
  deleteCharacterGroup,
  getCharacterCount,
  getCharacterGroups,
  getCharacterLimit,
  renameCharacterGroup,
  subscribeCharacters,
} from '../../libs/services/companion/character-library-store';
import type { CharacterGroup } from '../../libs/services/companion/character-library';
import {
  displayNameFromFileName,
  pickCharacterImage,
} from '../../libs/services/companion/import-character';
import { createEditorSession } from '../../libs/services/companion/cutout-editor-session';
```

2. Replace the body of `runImport` (keep its callback shell):

```ts
  const runImport = useCallback(
    async (opts: { groupId?: string; displayName?: string }) => {
      if (importing) return;
      setImporting(true);
      try {
        const picked = await pickCharacterImage();
        if (picked.status === 'denied') {
          flashToast(t('companion.permissionDenied'));
          return;
        }
        if (picked.status === 'cancelled') return;
        const sessionId = createEditorSession({
          mode: 'import',
          sourceUri: picked.uri,
          displayName:
            opts.displayName ?? displayNameFromFileName(picked.fileName) ?? 'Character',
          ...(opts.groupId ? { groupId: opts.groupId } : {}),
        });
        // The detail sheet is an RN Modal, which would cover a pushed route.
        setDetailId(null);
        router.push({ pathname: '/companion/edit-cutout', params: { sessionId } });
      } finally {
        setImporting(false);
      }
    },
    [importing, flashToast, t, router]
  );
```

3. Drop the now-unused `upsertCharacter` quota handling there (the editor surfaces it) and the `loading={importing}` props can stay (they now only cover the picker hop) but change the two button labels from `importing ? t('companion.importing') : …` to just the static labels (`t('companion.empty.cta')` / `t('companion.import')`) — the "Removing background…" claim is no longer true at this point.

4. Add an "edit cutout" action to each variant tile. In `CharacterDetailSheet` props add `onEditAngle: (id: string) => void;` and inside the variant tile (next to the existing delete button):

```tsx
              <Pressable
                onPress={() => onEditAngle(variant.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('companion.cutout.edit')}
                style={({ pressed }) => [
                  styles.angleEdit,
                  {
                    backgroundColor: theme.background.tertiary,
                    borderColor: theme.glassBorder,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}>
                <Ionicons name="color-wand-outline" size={13} color={theme.text.secondary} />
              </Pressable>
```

with style (next to `angleDelete`):

```ts
    angleEdit: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
```

5. Wire it where `<CharacterDetailSheet …>` is rendered:

```tsx
            onEditAngle={(id) => {
              const sessionId = createEditorSession({ mode: 'edit', characterId: id });
              setDetailId(null);
              router.push({ pathname: '/companion/edit-cutout', params: { sessionId } });
            }}
```

- [ ] **Step 13.4: Migrate `CharacterPickerSheet.tsx`**

1. Imports: add `useRouter` from `expo-router`; replace `importCharacterFromLibrary` import with `pickCharacterImage`/`displayNameFromFileName` + `createEditorSession`; remove `upsertCharacter` from the store import (keep `deleteCharacter`, `getCharacterLimit`, `getCharacters`, `subscribeCharacters`).

2. Replace `handleImport`:

```ts
  const router = useRouter();

  const handleImport = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    setError(null);
    try {
      const picked = await pickCharacterImage();
      if (picked.status === 'denied') {
        setError(t('companion.permissionDenied'));
        return;
      }
      if (picked.status === 'cancelled') return;
      const sessionId = createEditorSession({
        mode: 'import',
        sourceUri: picked.uri,
        displayName: displayNameFromFileName(picked.fileName) ?? 'Character',
        // Editor saved → behave like the old auto-select-and-continue flow.
        onDone: (entry) => {
          if (entry) onSelect(entry);
        },
      });
      // This sheet is an RN Modal and would cover the pushed editor route.
      onClose();
      router.push({ pathname: '/companion/edit-cutout', params: { sessionId } });
    } catch (err) {
      console.warn('[companion] import failed', err);
      setError(t('companion.importFailed'));
    } finally {
      setImporting(false);
    }
  }, [importing, onClose, onSelect, router, t]);
```

3. The import tile label: change `importing ? t('companion.importing') : t('companion.import')` to `t('companion.import')`.

- [ ] **Step 13.5: Typecheck, lint, full unit tests**

Run: `bunx tsc --noEmit` — Expected: no errors.
Run: `bun test` — Expected: all pass (the old `importCharacterFromLibrary` had no direct unit test; if a test imports it, update that test to the new picker API).
Run: `bun run lint` — Expected: clean (or only pre-existing warnings).

- [ ] **Step 13.6: Commit**

```bash
git add libs/services/companion/import-character.ts app/companion/library.tsx components/companion/CharacterPickerSheet.tsx
git commit -m "feat(companion): route all imports through the cutout editor"
```

---

### Task 14: Final verification

- [ ] **Step 14.1: Full check battery**

```bash
bunx tsc --noEmit && bun test && bun run lint
```
Expected: all green.

- [ ] **Step 14.2: Device verification checklist (requires `bun run prebuild` + native rebuild — flag to the user, do not run builds unprompted)**

iOS + Android, after rebuild:

1. Import a clear character image → editor opens with shimmer → auto mask appears; mask aligns with the image (no offset).
2. Import an **EXIF-rotated photo** (shoot one in landscape) → cutout preview is upright and mask aligns (exercises the normalized-source path).
3. Erase strokes remove, restore strokes bring back; brush follows the finger under zoom (alignment after pinch-zoom + pan).
4. Undo/redo across strokes and edge tools; reset returns to the auto mask.
5. Feather softens edges; smooth de-jags; shrink/expand move the silhouette in/out. (If `smooth` looks wrong, the erode/dilate chain order is the first suspect.)
6. Hold-to-compare shows the original; mask view tints kept regions; background cycles checker/black/white.
7. Save → library card shows the new cutout with "Cut out" badge; re-open edit (wand icon) → previous mask loads (non-destructive).
8. Import an image with **no subject** (e.g. a plain wall) → manual banner + full image visible → hand-paint → save works, badge honest.
9. Library at 20 entries → save shows the quota alert and stays.
10. Picker-sheet flow (composer): import → editor → save → sheet's parent auto-selects the new character.
11. Kill the app, relaunch → cutouts still render (documentDirectory survives; cache purge no longer breaks entries).

- [ ] **Step 14.3: Commit any fixes, then final commit**

```bash
git add -A && git commit -m "feat(companion): cutout editor polish from device verification"
```

---

## Self-review (done while writing)

- **Spec coverage:** native mask (T6/T7), JS bridge (T5), editor board with brush/undo/edge tools (T8–T12), manual rescue (T9 `manual` phase), non-destructive re-edit (T2 maskUri + T13 edit action), durable storage (T8 documentDirectory), import-flow UX (T13), i18n (T4), tests (T1–T3). Compare-camera live lift untouched per non-goals.
- **Type consistency:** `EditOp`/`StrokeOp`/`FilterOp`/`OpStack` defined once in `cutout-ops.ts` and imported everywhere; `CutoutPatch` in `character-library.ts`; `SubjectMaskResult` in `subject-lifter.ts`; `EditorBackground` exported from the canvas.
- **Known judgment calls for the implementer:** `editScaleOf` note in Task 9 (prefer the full-dims ref), `t()` template-literal note in Task 11, `finish` typing note in Task 12.
