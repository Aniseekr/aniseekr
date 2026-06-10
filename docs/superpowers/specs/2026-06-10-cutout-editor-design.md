# Companion Cutout Editor (角色去背編輯板) — Design

**Date:** 2026-06-10 · **Status:** Approved by user · **Scope:** companion character import/edit flow

## Problem

Importing a companion character runs the native subject lifter behind a button spinner and the
result is final. A bad cutout (missing limbs, leftover background, total failure) cannot be
adjusted — the user's only options are "keep the bad cutout" or "use the original uncut". This
makes the feature feel broken on first contact (「匯進去就很糟糕」).

Two root constraints in the current pipeline:

1. `AniseekrSubjectLifter.lift()` returns a foreground PNG **cropped to the subject extent**, with
   no mask and no crop offset. Background pixels' RGB is zeroed, so "restore" is impossible from
   the cutout alone.
2. The UX is a spinner, not a workspace — there is no place to put editing tools.

## Goals

- Dedicated full-screen editing board, entered automatically after picking an image and
  re-enterable from the character library (non-destructive re-edit).
- Erase / restore brush with full undo/redo, zoom/pan.
- Edge tools: feather, smooth, shrink/expand.
- Rescue path: when auto-segmentation fails (`no_subject`, no native module), the editor opens in
  manual mode with a full-white mask so the user can hand-paint the cutout.
- Premium feel: shimmer over the visible original while analyzing (no spinner-in-a-sheet),
  floating glass toolbars, haptics, smooth mask-arrival transition.

## Non-goals

- Adjusting the compare camera's *live scene* lift (`useLiftedSubjectImage`) — untouched.
- Hair-level AI matting / alpha decontamination.
- Web support (native module is iOS/Android only; JS fallback = manual mode).

## Architecture

### 1. Native: `liftWithMask`

New method on `AniseekrSubjectLifter` (both platform templates + plugin), alongside the existing
`lift` (kept for the compare camera's live path):

```
liftWithMask(imageUri) -> {
  maskUri: string;      // grayscale PNG, full size, aligned to the normalized original
  sourceUri: string;    // EXIF-normalized original (equals a re-encoded copy when rotation applied)
  width: number;        // normalized original width
  height: number;       // normalized original height
  hasAlpha: boolean;    // true — segmentation ran (failures reject, never fabricate)
}
```

- **iOS 17+:** `VNGenerateForegroundInstanceMaskRequest` →
  `generateScaledMaskForImage(forInstances:from:)` (input-resolution soft mask) → grayscale PNG.
- **iOS 15/16:** `VNGeneratePersonSegmentationRequest` mask scaled to original extent (already
  computed today for the blend path) → grayscale PNG.
- **Android:** `SubjectSegmenterOptions.enableForegroundConfidenceMask()` → input-size
  `FloatBuffer` → 8-bit ALPHA_8/grayscale bitmap → PNG.
- The normalized original is written out whenever EXIF rotation was applied, so JS-side Skia
  decoding (which ignores EXIF) stays pixel-aligned with the mask.
- Rejections mirror `lift`: `decode_failed` / `no_subject` / `lift_failed` / `write_failed`.

### 2. JS bridge (`libs/services/companion/subject-lifter.ts`)

- `SubjectLifter` gains `liftWithMask(uri): Promise<SubjectMaskResult>`.
- JS fallback rejects with `no_native` → editor enters manual mode. Older native builds without
  the method (app updated, not rebuilt) are detected (`typeof native.liftWithMask !== 'function'`)
  and behave like the fallback.

### 3. Editor screen — `app/companion/edit-cutout.tsx`

Route params (strings):

- Import mode: `{ mode: 'import', uri, displayName?, groupId?, angleLabel? }`
- Re-edit mode: `{ mode: 'edit', characterId }`

Components under `components/companion/cutout/`:

| Component | Responsibility |
|---|---|
| `CutoutEditorCanvas` | Skia canvas: background (checkerboard/black/white) → ghost of removed regions (original @ low opacity) → original masked via `BlendMode.DstIn` saveLayer → optional red mask-overlay mode → live brush cursor ring. Gestures: 1-finger paint, 2-finger pan/pinch (SharedValues, off the React render path). |
| `EditorTopBar` | cancel, undo, redo, hold-to-compare original, save. |
| `BrushHud` | erase/restore toggle, brush size slider, hardness (edge softness) slider. |
| `EdgeToolsBar` | feather (blur σ), smooth (de-jag), shrink / expand (Skia erode/dilate image filters; fallback blur+threshold color matrix if unavailable in 2.6.2). |
| `ViewOptionsBar` | background cycle, mask-overlay toggle, reset menu (reset-to-auto / use-original-uncut). |

### 4. State — `useCutoutEditor` (CLAUDE.md Rule 9)

- Hook owns: base mask `SkImage` (downscaled to ≤2048 long edge for editing), an op stack
  `EditOp[]` (stroke ops `{tool, points, size, hardness}` and filter ops
  `{feather|smooth|morph, amount}`), undo pointer, current rebuilt mask surface.
- Mask rebuild = replay base + ops onto an offscreen surface; strokes append incrementally; undo
  rebuilds from base (periodic surface snapshots if profiling shows need).
- Pure logic (op-stack reducer, screen↔image coordinate mapping, param math) lives in a
  Skia-free module `libs/services/companion/cutout-ops.ts` for bun unit tests.
- React state is minimal: tool/slider values, view mode, canUndo/canRedo, phase
  (`analyzing | ready | manual | saving`). Gesture/zoom values stay in SharedValues.

### 5. Save pipeline

1. Decode full-res normalized original (Skia).
2. Upscale final mask to original resolution (linear sampling + slight blur to hide steps).
3. Composite original × mask (`DstIn`), crop to alpha bbox + ~2% padding.
4. Write cutout PNG + full-size mask PNG + (if new) normalized source copy to
   `${documentDirectory}companion/` — **not** the cache dir (OS purges cache; fixes existing
   fragility for newly saved entries).
5. Upsert `CharacterEntry`: `cutoutUri`, `thumbUri`, `intrinsicW/H` (cropped dims),
   `hasAlpha: true`, new optional field **`maskUri?: string`**, `sourceUri` → normalized copy.
   New store helper `updateCharacterCutout(id, patch)`.

### 6. Flow changes

- **Import:** new `pickCharacterImage()` (picker only) → navigate to editor immediately →
  editor runs `liftWithMask` with a shimmer over the full-bleed original → save upserts (same
  quota check as today) → `router.back()`. The old in-sheet `importing` spinner goes away.
  Both call sites migrate: `app/companion/library.tsx` and
  `components/companion/CharacterPickerSheet.tsx` (compare camera stays mounted under the pushed
  route).
- **Re-edit:** library card gains a「編輯去背」action. Entries with `maskUri` load it directly;
  legacy entries re-run `liftWithMask(sourceUri)` for a starting mask; unreadable source → toast.
- `importCharacterFromLibrary()` shrinks to the pick step or is replaced; the lift/measure logic
  moves into the editor save path.

### 7. i18n

New keys under `companion.cutout.*` in `en.json` + `zh-Hant.json` (ja/ko fall back): title,
analyzing, erase, restore, brushSize, hardness, feather, smooth, shrink, expand, background,
maskView, compareHint, resetAuto, useOriginal, save, saveFailed, analyzeFailedManual, …

### 8. Error states (Rule 8 — three real states)

| Phase | Render |
|---|---|
| `analyzing` | original full-bleed + shimmer + 「分析中…」 |
| `ready` | live editable cutout preview |
| `manual` (lift failed) | banner 「自動偵測失敗 — 手動圈選」, full-white mask, brush active |
| save failure | toast, stay in editor with state intact |

### 9. Testing

- bun unit: `cutout-ops` reducer (push/undo/redo/cap), coordinate mapping, morph/blur param
  math, `CharacterEntry.maskUri` JSON round-trip, store `updateCharacterCutout`.
- i18n parity test auto-covers new keys.
- Native mask path needs prebuild + device verification (manual checklist in the plan).

### Risks

- `Skia.ImageFilter.MakeErode/MakeDilate` availability in RN Skia 2.6.2 — verify early; fallback
  is blur + high-contrast color-matrix threshold.
- ML Kit confidence mask is per-subject on some versions — merge all subjects' masks (max blend)
  to match iOS `allInstances` behavior.
- Editing-resolution mask (≤2048) upscaled to a very large original could soften edges — the
  slight blur in step 2 of the save pipeline is deliberate; acceptable for sticker use.
