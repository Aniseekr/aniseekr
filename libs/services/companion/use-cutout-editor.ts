// State owner for the cutout editor screen (CLAUDE.md rule 9): editing-phase
// machine, op stack with undo/redo, committed mask image, and the save
// pipeline. High-frequency gesture state lives in the canvas component's
// SharedValues — this hook only sees committed strokes.
//
// Intermediate SkImages replaced through React state are NOT manually
// disposed: the declarative canvas may still reference them for an in-flight
// frame, so we lean on JSI finalizers. Clearly-owned temporaries (full-res
// decodes, surfaces) are disposed inside cutout-mask.ts.

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

export interface EditorImages {
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
  const sourceUriRef = useRef<string | null>(null); // normalized full-res uri
  const fullDimsRef = useRef<{ w: number; h: number } | null>(null);
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
          // Re-edit: the stored mask already aligns with the stored source.
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
        const fullW = fullOriginal.width();
        const fullH = fullOriginal.height();
        const scale = editScale(fullW, fullH);
        const imgW = Math.max(1, Math.round(fullW * scale));
        const imgH = Math.max(1, Math.round(fullH * scale));
        const original = scaleImage(fullOriginal, imgW, imgH);
        fullOriginal.dispose();

        const baseMask = maskFull ? scaleImage(maskFull, imgW, imgH) : makeWhiteMask(imgW, imgH);
        maskFull?.dispose();

        if (cancelled) return;
        baseMaskRef.current = baseMask;
        baseIsAutoRef.current = auto;
        sourceUriRef.current = normalizedUri;
        fullDimsRef.current = { w: fullW, h: fullH };
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
    // The session is taken once on mount and never changes afterwards.
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

  const persistEntry = useCallback((entry: CharacterEntry): SaveResult => {
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
    // Replace files we owned for the previous version of this entry.
    if (previous) {
      if (previous.cutoutUri !== entry.cutoutUri) tryDeleteOwnedFile(previous.cutoutUri);
      if (previous.maskUri && previous.maskUri !== entry.maskUri) {
        tryDeleteOwnedFile(previous.maskUri);
      }
    }
    return { status: 'saved', entry };
  }, []);

  /** Keep the original untouched (no cutout) — also the manual no-op path. */
  const saveAsOriginal = useCallback(async (): Promise<SaveResult> => {
    const sourceUri = sourceUriRef.current;
    const fullDims = fullDimsRef.current;
    if (!session || !sourceUri || !fullDims) return { status: 'error' };
    setSaving(true);
    try {
      const stem = entryRef.current?.id ?? `char_${Date.now()}`;
      const durableSource = ensureDurableSource(sourceUri, stem);
      const entry = buildEntry({
        cutoutUri: durableSource,
        thumbUri: durableSource,
        intrinsicW: fullDims.w,
        intrinsicH: fullDims.h,
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
  }, [buildEntry, persistEntry, session]);

  /** Persist the current mask as the entry's cutout. */
  const save = useCallback(async (): Promise<SaveResult> => {
    const sourceUri = sourceUriRef.current;
    if (!session || !images || !sourceUri || saving) return { status: 'error' };
    // Manual mode with zero ops = "keep everything" = the original image.
    const edited = appliedOps(stack).length > 0;
    if (!baseIsAutoRef.current && !edited) return saveAsOriginal();
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
  }, [buildEntry, images, persistEntry, saveAsOriginal, saving, session, stack]);

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
    saveAsOriginal,
  };
}

/** Source files must outlive the picker cache — copy into documents once. */
function ensureDurableSource(uri: string, stem: string): string {
  if (uri.includes('/companion/')) return uri;
  const ext = uri.toLowerCase().endsWith('.png') ? 'png' : 'jpg';
  return copyIntoCompanionDir(uri, `source-${stem}.${ext}`);
}
