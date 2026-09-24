/* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability -- Existing compare preview state/gesture model is out of scope for the Phase 2 motion pass. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import Ionicons from '@expo/vector-icons/Ionicons';
import { bottomPad, Size, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { useT, type TranslationKey } from '../../libs/i18n';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import {
  ON_DARK,
  readableTextOn,
  Skeleton,
  ThemedButton,
  ThemedSurface,
  ThemedText,
} from '../../components/themed';
import {
  findCaptureByUri,
  recordCapture,
  recordFreeCapture,
  type SensorSnapshot,
} from '../../libs/services/pilgrimage/captures';
import {
  availablePreviewModes,
  buildImportedCompareParams,
  buildSceneCompareParams,
} from '../../libs/services/pilgrimage/reference-route';
import {
  buildPreviewCaptureRecord,
  isFiledUnder,
  previewReferenceFromParams,
  snapshotFromShot,
  withoutTargetFields,
  type PreviewCaptureRecord,
} from '../../libs/services/pilgrimage/preview-capture';
import { releaseImportedReference } from '../../libs/services/pilgrimage/reference-image';
import {
  ReferencePickerSheet,
  type PickedReference,
} from '../../components/pilgrimage/camera/ReferencePickerSheet';
import {
  anitabiImageSource,
  toFullResImageUrl,
} from '../../libs/services/pilgrimage/anitabi-image';
import { scoreSnapshot } from '../../libs/services/pilgrimage/alignment-scoring';
import {
  buildCaptureSessionShotFromRoute,
  reconcileCapturePreviewSelection,
  resolveCapturePreviewFocus,
  resolvePreviewShots,
  resolveRouteShotDimensions,
} from '../../libs/services/pilgrimage/capture-preview-route';
import { computeFrameMatch, type FrameMatch } from '../../libs/services/pilgrimage/frame-match';
import { resolveFullModeStageHeight } from '../../libs/services/pilgrimage/compare-layout';
import { useCaptureSession, type CaptureSessionShot } from '../../hooks/useCaptureSession';
import { getStringParam } from '../../libs/utils/route-params';
import { buildShareRouteParams } from '../../libs/services/pilgrimage/share-route-params';
import { resolveCapturedPhotoDimensions } from '../../libs/services/pilgrimage/camera-engine-parity';
import { AnitabiOriginCredit } from '../../components/pilgrimage/common/AnitabiOriginCredit';

function getRetakeTip(s: SensorSnapshot | null): TranslationKey | null {
  if (!s) return null;
  if (s.headingDeltaDeg != null && Math.abs(s.headingDeltaDeg) > 15) {
    return s.headingDeltaDeg > 0
      ? 'pilgrimageUi.preview.retakeTurnRight'
      : 'pilgrimageUi.preview.retakeTurnLeft';
  }
  if (s.distanceMeters != null && s.distanceMeters > 20) {
    return 'pilgrimageUi.preview.retakeMoveCloser';
  }
  if (s.tilt != null && Math.abs(s.tilt) > 10) {
    return s.tilt > 0 ? 'pilgrimageUi.preview.retakeLevel' : 'pilgrimageUi.preview.retakeTiltDown';
  }
  return null;
}

const MODE_LABEL_KEY: Record<Mode, TranslationKey> = {
  stacked: 'pilgrimageUi.preview.modeStacked',
  sideBySide: 'pilgrimageUi.preview.modeSideBySide',
  overlay: 'pilgrimageUi.preview.modeOverlay',
  slider: 'pilgrimageUi.preview.modeSlider',
  full: 'pilgrimageUi.preview.modeFull',
};

function formatSignedDeg(value: number): string {
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}°`;
  if (rounded < 0) return `−${Math.abs(rounded)}°`;
  return '0°';
}

/** Write one preview record; the index merges it into the shot's existing record. */
function fileCapture({ bucket, capture }: PreviewCaptureRecord): Promise<void> {
  return bucket === 'free' ? recordFreeCapture(capture) : recordCapture(capture);
}

type Mode = 'stacked' | 'sideBySide' | 'overlay' | 'slider' | 'full';

export default function ComparePreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const params = useLocalSearchParams();
  const { shots: sessionShots, removeShot } = useCaptureSession();

  // Spot-level metadata still arrives via route params. The per-shot data
  // (uri + sensors) now comes from the capture-session store, not params.
  const spotId = getStringParam(params, 'spotId') ?? '';
  // Strip Anitabi's `?plan=h160` thumbnail token so the side-by-side / overlay
  // / slider stage renders the original 1920×1080 frame instead of pixelating
  // the 284×160 thumb.
  const imageUrl = toFullResImageUrl(getStringParam(params, 'imageUrl') ?? '');
  // Only a real scene name is ever persisted; the fallback is display-only.
  const sceneNameParam = getStringParam(params, 'name');
  const sceneName =
    sceneNameParam ??
    (imageUrl ? t('pilgrimageUi.preview.sceneFallback') : t('pilgrimage.album.freeCapturesFolder'));
  const referenceKind = getStringParam(params, 'referenceKind');
  const ep = getStringParam(params, 'ep');
  const animeId = getStringParam(params, 'animeId');
  const animeTitle = getStringParam(params, 'animeTitle');
  const themeColor = getStringParam(params, 'themeColor') || theme.accent;
  const spotLat = getStringParam(params, 'spotLat');
  const spotLng = getStringParam(params, 'spotLng');
  const shotUriParam = getStringParam(params, 'shotUri');
  const shotWidthParam = getStringParam(params, 'shotWidth');
  const shotHeightParam = getStringParam(params, 'shotHeight');
  const capturedAtParam = getStringParam(params, 'capturedAt');
  const headingParam = getStringParam(params, 'heading');
  const distanceMetersParam = getStringParam(params, 'distanceMeters');
  const headingDeltaDegParam = getStringParam(params, 'headingDeltaDeg');
  const tiltParam = getStringParam(params, 'tilt');
  const captureModeParam = getStringParam(params, 'captureMode');
  const shotSourceParam = getStringParam(params, 'shotSource');
  const userLatParam = getStringParam(params, 'userLat');
  const userLngParam = getStringParam(params, 'userLng');
  const noteParam = getStringParam(params, 'note');
  // A Journal shot is already filed. Viewing it must not rewrite its record —
  // only an edit (note, reference, save) does.
  const origin = getStringParam(params, 'origin');
  const openedFromJournal = origin === 'journal';
  const userEditedRef = useRef(!openedFromJournal);
  // CC BY-NC-SA 4.0 attribution for the reference scene image — surfaced as
  // a small "via {origin}" credit below the comparison stage.
  const sceneOrigin = (getStringParam(params, 'sceneOrigin') ?? '').trim();
  const sceneOriginURL = (getStringParam(params, 'sceneOriginURL') ?? '').trim();
  const routeShot = useMemo(
    () =>
      buildCaptureSessionShotFromRoute({
        spotId,
        shotUri: shotUriParam ?? undefined,
        shotWidth: shotWidthParam ?? undefined,
        shotHeight: shotHeightParam ?? undefined,
        capturedAt: capturedAtParam ?? undefined,
        heading: headingParam ?? undefined,
        distanceMeters: distanceMetersParam ?? undefined,
        headingDeltaDeg: headingDeltaDegParam ?? undefined,
        tilt: tiltParam ?? undefined,
        captureMode: captureModeParam ?? undefined,
        shotSource: shotSourceParam ?? undefined,
        userLat: userLatParam ?? undefined,
        userLng: userLngParam ?? undefined,
        note: noteParam ?? undefined,
      }),
    [
      spotId,
      shotUriParam,
      shotWidthParam,
      shotHeightParam,
      capturedAtParam,
      headingParam,
      distanceMetersParam,
      headingDeltaDegParam,
      tiltParam,
      captureModeParam,
      shotSourceParam,
      userLatParam,
      userLngParam,
      noteParam,
    ]
  );
  const baseShots = useMemo(
    () => resolvePreviewShots(sessionShots, routeShot, origin),
    [sessionShots, routeShot, origin]
  );
  const routeOnlyPreview = routeShot !== null && baseShots[0] === routeShot;

  // What the shots are filed against. Only a real scene name is persisted.
  const reference = useMemo(
    () =>
      previewReferenceFromParams(
        {
          spotId,
          imageUrl,
          referenceKind: referenceKind ?? undefined,
          name: sceneNameParam ?? undefined,
          animeId: animeId ?? undefined,
          animeTitle: animeTitle ?? undefined,
          themeColor,
          ep: ep ?? undefined,
          spotLat: spotLat ?? undefined,
          spotLng: spotLng ?? undefined,
        },
        { fallbackColor: theme.accent }
      ),
    [
      spotId,
      imageUrl,
      referenceKind,
      sceneNameParam,
      animeId,
      animeTitle,
      themeColor,
      ep,
      spotLat,
      spotLng,
      theme.accent,
    ]
  );
  // Distance / heading offset were measured against the reference the shots
  // were opened with; once re-paired they'd describe the wrong place.
  const referenceKey = `${spotId}|${imageUrl}`;
  const [openedReferenceKey] = useState(referenceKey);
  const shots = useMemo(
    () => (referenceKey === openedReferenceKey ? baseShots : baseShots.map(withoutTargetFields)),
    [baseShots, referenceKey, openedReferenceKey]
  );

  // ── Album focus + selection ────────────────────────────────────────────
  // `focusedShotId` drives the comparison stage. `selectedIds` drives Save.
  const [focusedShotId, setFocusedShotId] = useState<string | null>(() => shots[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(shots[0] ? [shots[0].id] : [])
  );

  // Reconcile focus/selection when the store changes underneath us (a "再拍"
  // round-trip adds a new shot; a delete removes one). Never crash, never
  // point at a stale id.
  useEffect(() => {
    setFocusedShotId((prev) => resolveCapturePreviewFocus(prev, shots));
    setSelectedIds((prev) => reconcileCapturePreviewSelection(prev, shots));
  }, [shots]);

  const focusedShot = useMemo(
    () => shots.find((s) => s.id === focusedShotId) ?? shots[0] ?? null,
    [shots, focusedShotId]
  );
  // Notes the user typed in this preview, by photo uri (stable across re-pairs).
  // Only these are ever written; an untouched note is left as stored.
  const [noteEdits, setNoteEdits] = useState<Record<string, string>>({});
  const focusedUri = focusedShot?.uri ?? null;
  const editedNote = focusedUri !== null ? noteEdits[focusedUri] : undefined;
  // Session shots never learn about saved notes, so the record is the truth.
  const storedNote = useMemo(
    () => (focusedUri ? findCaptureByUri(focusedUri)?.note : undefined),
    [focusedUri]
  );
  const note = editedNote ?? storedNote ?? focusedShot?.note ?? '';
  const shotUri = focusedShot?.uri ?? '';
  const selectedCount = useMemo(
    () => shots.reduce((n, s) => (selectedIds.has(s.id) ? n + 1 : n), 0),
    [shots, selectedIds]
  );

  // A lone shot (no reference) has nothing to compare against: single view only.
  const modes = useMemo(() => availablePreviewModes(imageUrl !== ''), [imageUrl]);
  const [modeState, setMode] = useState<Mode>(() => modes[0]);
  const mode: Mode = modes.includes(modeState) ? modeState : modes[0];
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);

  // Pair (or re-pair) the shots with a reference: re-file every shot on screen
  // right away (captures upsert by uri, so each moves rather than duplicates),
  // then swap the params so the stage shows the new pairing.
  const handlePickReference = useCallback(
    (picked: PickedReference) => {
      const next =
        picked.kind === 'scene'
          ? buildSceneCompareParams(picked.spot, {
              animeId: picked.animeId,
              animeTitle: picked.animeTitle,
              themeColor,
            })
          : buildImportedCompareParams(picked.uri, {
              label: t('pilgrimageUi.referencePicker.importedLabel'),
              themeColor,
              now: Date.now(),
              nonce: Math.round(Math.random() * 1e6),
            });
      const nextReference = previewReferenceFromParams(next, {
        fallbackColor: theme.accent,
        resolveImageUrl: toFullResImageUrl,
      });
      const backToOpened =
        `${nextReference.spotId}|${nextReference.imageUrl}` === openedReferenceKey;
      userEditedRef.current = true;
      // A pending write for the old pairing must not land after this one (the
      // loop below writes every shot, typed notes included).
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
      pendingWriteRef.current = null;
      const previousImported = referenceKind === 'imported' ? imageUrl : null;
      void (async () => {
        for (const shot of baseShots) {
          await fileCapture(
            buildPreviewCaptureRecord({
              shot: backToOpened ? shot : withoutTargetFields(shot),
              reference: nextReference,
              note: noteEdits[shot.uri],
            })
          );
        }
        // Drop the old imported file once nothing is filed against it — except
        // the camera's own reference, which the compare screen underneath still
        // shows (it releases that one when it closes).
        const cameraStillShowsIt = !openedFromJournal && referenceKey === openedReferenceKey;
        if (previousImported && !cameraStillShowsIt) releaseImportedReference(previousImported);
      })().catch((err) => console.warn('[preview] re-pair failed', err));
      router.setParams({
        ...next,
        spotLat: next.spotLat ?? '',
        spotLng: next.spotLng ?? '',
        sceneOrigin: next.sceneOrigin ?? '',
        sceneOriginURL: next.sceneOriginURL ?? '',
        referenceKind: next.referenceKind ?? '',
      });
      setMode(availablePreviewModes(true)[0]);
    },
    [
      baseShots,
      imageUrl,
      noteEdits,
      openedFromJournal,
      openedReferenceKey,
      referenceKey,
      referenceKind,
      router,
      t,
      theme.accent,
      themeColor,
    ]
  );
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });
  const [stagePx, setStagePx] = useState({ width: 0, height: 0 });
  // Route-only previews (deep link / album) may arrive with width/height = 0.
  // Decode the true pixel dims once so full-mode sizing + the share ratio see
  // the real orientation instead of falling back to 16:9 / landscape.
  const [decodedShotDims, setDecodedShotDims] = useState<{ width: number; height: number } | null>(
    null
  );
  useEffect(() => {
    if (!routeOnlyPreview || !routeShot || !routeShot.uri) {
      setDecodedShotDims(null);
      return;
    }
    let cancelled = false;
    void resolveRouteShotDimensions(
      { width: routeShot.width, height: routeShot.height },
      resolveCapturedPhotoDimensions,
      routeShot.uri
    )
      .then((dims) => {
        if (cancelled) return;
        setDecodedShotDims(dims.width > 0 && dims.height > 0 ? dims : null);
      })
      .catch(() => {
        if (!cancelled) setDecodedShotDims(null);
      });
    return () => {
      cancelled = true;
    };
  }, [routeOnlyPreview, routeShot]);

  // A new shot invalidates the "Saved" badge — the user took more photos.
  useEffect(() => {
    setSaved(false);
  }, [shots]);

  useEffect(() => {
    setSaved(false);
  }, [note]);

  const handleNoteChange = useCallback(
    (text: string) => {
      if (!focusedUri) return;
      userEditedRef.current = true;
      setNoteEdits((prev) => ({ ...prev, [focusedUri]: text }));
    },
    [focusedUri]
  );

  // Alignment sensor snapshot — strictly real data, taken from the FOCUSED
  // shot's own capture-time fields. Each shot carries its own snapshot, so the
  // album shows the right one per shot.
  const sensorSnapshot = useMemo<SensorSnapshot | null>(
    () => snapshotFromShot(focusedShot),
    [focusedShot]
  );
  const focusedHeading = focusedShot?.heading ?? null;

  // Position lock from sensors — same cos² formula the live badge uses.
  const positionScore = useMemo(
    () => (sensorSnapshot ? scoreSnapshot(sensorSnapshot) : null),
    [sensorSnapshot]
  );

  // Frame match — does the focused photo actually look like the anime
  // reference? Recomputed whenever the focused shot changes.
  const [frameMatch, setFrameMatch] = useState<FrameMatch | null>(null);
  // Only a shot with a reference has anything to analyse — no skeleton otherwise.
  const [frameLoading, setFrameLoading] = useState(() => Boolean(imageUrl && shotUri));
  // Last frame match per (reference, shot), so saving several shots keeps each
  // one's own analysis instead of blanking the non-focused ones.
  const frameByPairRef = useRef<Record<string, FrameMatch>>({});

  useEffect(() => {
    let cancelled = false;
    setFrameMatch(null);
    if (!imageUrl || !shotUri) {
      setFrameLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setFrameLoading(true);
    void computeFrameMatch(imageUrl, shotUri)
      .then((m) => {
        frameByPairRef.current[`${imageUrl}|${shotUri}`] = m;
        if (cancelled) return;
        setFrameMatch(m);
      })
      .catch((err) => {
        console.warn('frame match failed', err);
        if (cancelled) return;
        setFrameMatch({
          histogram: null,
          edge: null,
          lighting: null,
          total: null,
          valid: false,
          reason: 'analysisFailed',
        });
      })
      .finally(() => {
        if (!cancelled) setFrameLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, shotUri]);

  const retakeTipKey = useMemo(() => getRetakeTip(sensorSnapshot), [sensorSnapshot]);
  const retakeTip = retakeTipKey ? t(retakeTipKey) : null;

  const frameTone = useMemo(() => {
    if (frameMatch?.total == null) return theme.accent;
    if (!frameMatch.valid) return theme.status.error;
    if (frameMatch.total >= 0.8) return theme.status.success;
    if (frameMatch.total >= 0.5) return theme.accent;
    return theme.status.warning;
  }, [frameMatch, theme.accent, theme.status.error, theme.status.success, theme.status.warning]);

  const frameBannerText = useMemo<string | null>(() => {
    if (!frameMatch || frameMatch.valid) return null;
    switch (frameMatch.reason) {
      case 'dark':
        return t('pilgrimageUi.preview.frameDark');
      case 'lowDetail':
        return t('pilgrimageUi.preview.frameLowDetail');
      case 'lowContrast':
        return t('pilgrimageUi.preview.frameLowContrast');
      case 'analysisFailed':
        return t('pilgrimageUi.preview.frameAnalysisFailed');
      default:
        return null;
    }
  }, [frameMatch, t]);

  const stageRef = useRef<View>(null);
  // Saved composites by `${reference}|${shot uri}` — a composite shows one
  // pairing and must not follow the shot to another reference.
  const compositeByPairRef = useRef<Record<string, string>>({});
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write the debounce is holding, so leaving the screen (or moving to
  // another shot) inside the 450ms window still saves what was typed.
  const pendingWriteRef = useRef<{ uri: string; record: PreviewCaptureRecord } | null>(null);
  const flushPendingWrite = useCallback(() => {
    const pending = pendingWriteRef.current;
    pendingWriteRef.current = null;
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (pending) void fileCapture(pending.record);
  }, []);

  // Slider drag position (0..1) for slider mode
  const sliderProgress = useSharedValue(0.5);
  const baseProgress = useSharedValue(0.5);
  const stageWidth = useSharedValue(0);

  const sliderPan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          baseProgress.value = sliderProgress.value;
        })
        .onUpdate((e) => {
          if (stageWidth.value <= 0) return;
          const dx = e.translationX / stageWidth.value;
          const next = baseProgress.value + dx;
          sliderProgress.value = Math.max(0.02, Math.min(0.98, next));
        }),
    [baseProgress, sliderProgress, stageWidth]
  );

  const sliderClipStyle = useAnimatedStyle(() => ({
    width: `${sliderProgress.value * 100}%` as `${number}%`,
  }));

  const sliderHandleStyle = useAnimatedStyle(() => ({
    left: `${sliderProgress.value * 100}%` as `${number}%`,
  }));

  const handleStageLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = e.nativeEvent.layout;
      stageWidth.value = width;
      setStagePx({ width, height });
    },
    [stageWidth]
  );

  const snapshotComposite = useCallback(async (): Promise<string | null> => {
    if (!stageRef.current) return null;
    try {
      const uri = await captureRef(stageRef.current, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      return uri;
    } catch (err) {
      console.warn('snapshot failed', err);
      return null;
    }
  }, []);

  const ensureMediaPerm = useCallback(async () => {
    if (mediaPerm?.granted) return true;
    const next = await requestMediaPerm();
    return next.granted;
  }, [mediaPerm, requestMediaPerm]);

  // Persist the newest shot on mount / whenever a new shot arrives so even if
  // the user backs out without saving, the spot still shows "captured". Keyed
  // by shot id so a "再拍" round-trip persists the freshly added shot too,
  // without re-persisting older ones.
  const persistedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (openedFromJournal) return; // already filed
    const newest = shots[0];
    if (!newest || persistedRef.current.has(newest.id)) return;
    persistedRef.current.add(newest.id);
    // Only a shot with no record yet is new; an existing one may have been
    // re-paired elsewhere and must not be pulled back.
    if (findCaptureByUri(newest.uri)) return;
    void fileCapture(buildPreviewCaptureRecord({ shot: newest, reference, note: newest.note }));
  }, [openedFromJournal, shots, reference]);

  // Keep the focused shot's record current as the user edits its note and as
  // its frame score settles. A frame result is only written where the shot is
  // already filed (or for a fresh camera shot) — looking at a shot never moves
  // it, and a Journal shot is only touched once the user changed something.
  // Frame match and composite are lens-gated (Rule 8, `capture-lens-gate.ts`).
  useEffect(() => {
    if (!focusedShot) return;
    // Focus moved while a write for the previous shot was pending: send it now.
    if (pendingWriteRef.current && pendingWriteRef.current.uri !== focusedShot.uri) {
      flushPendingWrite();
    }
    const stored = findCaptureByUri(focusedShot.uri);
    const mayWriteFrame =
      (!openedFromJournal || userEditedRef.current) &&
      (stored ? isFiledUnder(stored, reference) : !openedFromJournal);
    const frame = mayWriteFrame ? frameMatch : null;
    if (editedNote === undefined && !frame) return;
    const record = buildPreviewCaptureRecord({
      shot: focusedShot,
      reference,
      frame,
      compositeUri: compositeByPairRef.current[`${reference.imageUrl}|${focusedShot.uri}`],
      note: editedNote,
    });
    pendingWriteRef.current = { uri: focusedShot.uri, record };
    const timer = setTimeout(() => {
      persistTimerRef.current = null;
      if (pendingWriteRef.current?.record === record) pendingWriteRef.current = null;
      void fileCapture(record);
    }, 450);
    persistTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (persistTimerRef.current === timer) persistTimerRef.current = null;
    };
  }, [focusedShot, frameMatch, editedNote, reference, openedFromJournal, flushPendingWrite]);

  // Leaving within the debounce window still saves the last keystrokes.
  useEffect(() => () => flushPendingWrite(), [flushPendingWrite]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    // Save the selected shots; if none are selected, fall back to the focused
    // shot. Never a silent no-op.
    const toSave = shots.filter((s) => selectedIds.has(s.id));
    const targets = toSave.length > 0 ? toSave : focusedShot ? [focusedShot] : [];
    if (targets.length === 0) return;
    setSaving(true);
    userEditedRef.current = true;
    hapticsBridge.success();
    try {
      const ok = await ensureMediaPerm();
      if (!ok) {
        setSaving(false);
        return;
      }
      // The comparison composite is only meaningful for the focused shot's
      // stage, so capture it once and save it alongside. A lone shot has no
      // comparison — the photo itself is already saved.
      const composite = imageUrl ? await snapshotComposite() : null;
      for (const shot of targets) {
        await MediaLibrary.saveToLibraryAsync(shot.uri);
      }
      if (composite) {
        await MediaLibrary.saveToLibraryAsync(composite);
        if (focusedShot) {
          compositeByPairRef.current[`${reference.imageUrl}|${focusedShot.uri}`] = composite;
        }
      }
      // Persist the focused shot's record with its frame-match analysis +
      // composite; other selected shots persist their raw record.
      for (const shot of targets) {
        const isFocused = shot.id === focusedShot?.id;
        await fileCapture(
          buildPreviewCaptureRecord({
            shot,
            reference,
            frame: isFocused
              ? frameMatch
              : (frameByPairRef.current[`${imageUrl}|${shot.uri}`] ?? null),
            compositeUri: isFocused ? (composite ?? undefined) : undefined,
            // Only notes typed here are written; the rest stay as stored.
            note: noteEdits[shot.uri],
          })
        );
        persistedRef.current.add(shot.id);
      }
      setSaved(true);
    } catch (err) {
      console.warn('save failed', err);
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    shots,
    selectedIds,
    focusedShot,
    ensureMediaPerm,
    imageUrl,
    snapshotComposite,
    reference,
    frameMatch,
    noteEdits,
  ]);

  const handleShare = useCallback(() => {
    if (!focusedShot) return;
    hapticsBridge.tap();
    // The captured width/height is the orientation truth — forward it so the
    // share screen + ShareCard letterbox a portrait shot instead of cropping.
    // The sensor snapshot (tilt/headingDeltaDeg) feeds the share screen's
    // auto-perspective (Track C #8) without re-measuring.
    const shareParams = buildShareRouteParams({
      spotId,
      imageUrl,
      shotUri: focusedShot.uri,
      name: sceneName,
      ep,
      animeId,
      animeTitle,
      themeColor,
      spotLat,
      spotLng,
      shotWidth: decodedShotDims?.width ?? focusedShot.width,
      shotHeight: decodedShotDims?.height ?? focusedShot.height,
      tilt: focusedShot.tilt,
      headingDeltaDeg: focusedShot.headingDeltaDeg,
      matchScore: frameMatch?.total != null ? Math.round(frameMatch.total * 100) : null,
      frameValid: frameMatch ? frameMatch.valid : null,
      frameReason: frameMatch?.reason ?? null,
      positionScore: positionScore?.total != null ? Math.round(positionScore.total * 100) : null,
    });
    router.push({
      pathname: '/compare/share',
      params: shareParams,
    });
  }, [
    router,
    focusedShot,
    decodedShotDims,
    spotId,
    imageUrl,
    sceneName,
    ep,
    animeId,
    animeTitle,
    themeColor,
    spotLat,
    spotLng,
    frameMatch,
    positionScore,
  ]);

  const handleRetake = useCallback(() => {
    hapticsBridge.tap();
    router.back();
  }, [router]);

  const handleFocusShot = useCallback((id: string) => {
    hapticsBridge.selection();
    setFocusedShotId(id);
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    hapticsBridge.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteShot = useCallback(
    (id: string) => {
      if (routeOnlyPreview) return;
      hapticsBridge.warning();
      removeShot(id);
    },
    [removeShot, routeOnlyPreview]
  );

  // ── Empty state ────────────────────────────────────────────────────────
  if (shots.length === 0) {
    return (
      <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={14}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}>
              <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
            </Pressable>
            <View style={styles.headerMid}>
              <ThemedText variant="titleLarge" weight="700" align="center" numberOfLines={1}>
                {t('pilgrimageUi.comparisonResult')}
              </ThemedText>
            </View>
            <View style={styles.headerBtn} />
          </View>
          <View style={styles.emptyWrap}>
            <Ionicons name="images-outline" size={48} color={theme.text.tertiary} />
            <ThemedText variant="titleMedium" weight="700" align="center">
              {t('pilgrimageUi.noShotsYet')}
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              {t('pilgrimageUi.headBackToTheCamera')}
            </ThemedText>
            <Pressable
              onPress={handleRetake}
              style={({ pressed }) => [
                styles.emptyBtn,
                { backgroundColor: themeColor, opacity: pressed ? 0.88 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('pilgrimageUi.retake')}>
              <Ionicons name="camera" size={18} color={readableTextOn(themeColor)} />
              <ThemedText
                variant="bodyMedium"
                weight="700"
                style={{ color: readableTextOn(themeColor) }}>
                {t('pilgrimageUi.retake')}
              </ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={14}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </Pressable>
          <View style={styles.headerMid}>
            <ThemedText variant="titleLarge" weight="700" align="center" numberOfLines={1}>
              {t('pilgrimageUi.comparisonResult')}
            </ThemedText>
            <ThemedText variant="captionSmall" tone="secondary" align="center" numberOfLines={1}>
              {ep ? `${t('pilgrimage.album.epLabel', { ep })} · ` : ''}
              {sceneName}
              {shots.length > 1
                ? ` · ${t('pilgrimageUi.preview.shotsCount', { count: shots.length })}`
                : ''}
            </ThemedText>
          </View>
          <Pressable
            onPress={handleShare}
            hitSlop={14}
            style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={t('commonUi.share')}>
            <Ionicons name="share-outline" size={22} color={theme.text.primary} />
          </Pressable>
        </View>

        <KeyboardAwareScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bottomOffset={20}
          keyboardShouldPersistTaps="handled">
          <Filmstrip
            shots={shots}
            focusedShotId={focusedShot?.id ?? null}
            selectedIds={selectedIds}
            accent={themeColor}
            theme={theme}
            canDelete={!routeOnlyPreview}
            onFocus={handleFocusShot}
            onToggleSelect={handleToggleSelect}
            onDelete={handleDeleteShot}
          />

          {frameBannerText ? (
            <View
              style={[
                styles.invalidBanner,
                {
                  backgroundColor: `${theme.status.error}1F`,
                  borderColor: theme.status.error,
                },
              ]}>
              <Ionicons name="alert-circle" size={18} color={theme.status.error} />
              <ThemedText
                variant="bodySmall"
                weight="600"
                style={{ flex: 1, color: theme.status.error }}>
                {frameBannerText}
              </ThemedText>
            </View>
          ) : null}

          {sensorSnapshot || frameLoading || frameMatch ? (
            <View
              style={[
                styles.scoreCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={{ flex: 1, gap: 10 }}>
                <ThemedText variant="captionSmall" tone="secondary" weight="600">
                  {t('pilgrimageUi.frameMatch')}
                </ThemedText>
                {positionScore?.total != null ? (
                  <ThemedText variant="captionSmall" tone="secondary">
                    {t('pilgrimageUi.preview.positionLockPercent', {
                      percent: Math.round(positionScore.total * 100),
                    })}
                  </ThemedText>
                ) : null}
                {sensorSnapshot ? (
                  <View style={styles.pillRow}>
                    {sensorSnapshot.distanceMeters != null ? (
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText variant="bodySmall" weight="700">
                          {`${sensorSnapshot.distanceMeters.toFixed(1)} m`}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary">
                          {t('pilgrimageUi.distanceToSpot')}
                        </ThemedText>
                      </View>
                    ) : null}
                    {sensorSnapshot.headingDeltaDeg != null ? (
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText variant="bodySmall" weight="700">
                          {formatSignedDeg(sensorSnapshot.headingDeltaDeg)}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary">
                          {t('pilgrimageUi.headingOffset')}
                        </ThemedText>
                      </View>
                    ) : null}
                    {sensorSnapshot.tilt != null ? (
                      <View
                        style={[
                          styles.pill,
                          {
                            backgroundColor: theme.background.tertiary,
                            borderColor: theme.glassBorder,
                          },
                        ]}>
                        <ThemedText variant="bodySmall" weight="700">
                          {formatSignedDeg(sensorSnapshot.tilt)}
                        </ThemedText>
                        <ThemedText variant="captionSmall" tone="secondary">
                          {t('pilgrimageUi.tiltOffset')}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <View style={styles.overallWrap}>
                {frameLoading ? (
                  <Animated.View entering={FadeIn}>
                    <Skeleton.Block width={58} height={36} borderRadius={12} />
                  </Animated.View>
                ) : frameMatch?.total != null ? (
                  <>
                    <ThemedText
                      variant="displayMedium"
                      weight="700"
                      style={{ color: frameTone, lineHeight: 36 }}>
                      {Math.round(frameMatch.total * 100)}
                    </ThemedText>
                    <ThemedText variant="bodyMedium" weight="700" style={{ color: frameTone }}>
                      %
                    </ThemedText>
                  </>
                ) : (
                  <ThemedText
                    variant="displayMedium"
                    weight="700"
                    style={{ color: theme.text.tertiary, lineHeight: 36 }}>
                    —
                  </ThemedText>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.referenceRow}>
            <ThemedButton
              label={
                imageUrl
                  ? t('pilgrimageUi.referencePicker.change')
                  : t('pilgrimageUi.referencePicker.pair')
              }
              variant={imageUrl ? 'ghost' : 'secondary'}
              size="sm"
              icon={<Ionicons name="images-outline" size={16} color={theme.text.primary} />}
              onPress={() => setReferencePickerOpen(true)}
            />
          </View>

          {modes.length > 1 ? (
            <View style={styles.modeRow}>
              {modes.map((m) => {
                const active = m === mode;
                return (
                  <Pressable
                    key={m}
                    onPress={() => {
                      hapticsBridge.selection();
                      setMode(m);
                    }}
                    style={({ pressed }) => [
                      styles.modeBtn,
                      {
                        backgroundColor: active ? themeColor : theme.background.secondary,
                        borderColor: active ? themeColor : theme.glassBorder,
                      },
                      pressed && { opacity: 0.85 },
                    ]}>
                    <ThemedText
                      variant="bodySmall"
                      weight={active ? '700' : '500'}
                      style={{ color: active ? readableTextOn(themeColor) : theme.text.primary }}>
                      {t(MODE_LABEL_KEY[m])}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.stageWrap}>
            <View
              ref={stageRef}
              collapsable={false}
              onLayout={handleStageLayout}
              style={[
                styles.stage,
                { backgroundColor: theme.background.secondary },
                mode === 'full' && {
                  height: resolveFullModeStageHeight(
                    stagePx.width,
                    decodedShotDims?.width ?? focusedShot?.width,
                    decodedShotDims?.height ?? focusedShot?.height
                  ),
                },
              ]}>
              {mode === 'stacked' ? (
                <View style={styles.stackedFlow}>
                  <LabeledImage uri={imageUrl} label={t('commonUi.anime')} accent={themeColor} />
                  <LabeledImage
                    uri={shotUri}
                    label={t('pilgrimageUi.yourShot')}
                    accent={themeColor}
                    contentFit="contain"
                  />
                </View>
              ) : mode === 'sideBySide' ? (
                <View style={styles.sideFlow}>
                  <View style={styles.sideHalf}>
                    <LabeledImage
                      uri={imageUrl}
                      label={t('commonUi.anime')}
                      accent={themeColor}
                      compact
                    />
                  </View>
                  <View style={styles.sideHalf}>
                    <LabeledImage
                      uri={shotUri}
                      label={t('pilgrimageUi.yourShot')}
                      accent={themeColor}
                      compact
                      contentFit="contain"
                    />
                  </View>
                </View>
              ) : mode === 'overlay' ? (
                <View style={styles.overlayFlow}>
                  <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="contain" />
                  <Image
                    source={anitabiImageSource(imageUrl)}
                    style={[styles.fullImage, StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
                    contentFit="cover"
                  />
                  <View style={styles.overlayControls}>
                    <OpacityBar
                      value={overlayOpacity}
                      onChange={setOverlayOpacity}
                      accent={themeColor}
                    />
                  </View>
                </View>
              ) : mode === 'slider' ? (
                <GestureDetector gesture={sliderPan}>
                  <View style={styles.sliderFlow}>
                    <Image
                      source={{ uri: shotUri }}
                      style={styles.fullImage}
                      contentFit="contain"
                    />
                    <Animated.View style={[styles.sliderClip, sliderClipStyle]}>
                      {stagePx.width > 0 ? (
                        <Image
                          source={anitabiImageSource(imageUrl)}
                          style={{ width: stagePx.width, height: stagePx.height }}
                          contentFit="cover"
                        />
                      ) : null}
                    </Animated.View>
                    <Animated.View
                      style={[styles.sliderHandle, sliderHandleStyle]}
                      pointerEvents="none">
                      <View style={[styles.sliderKnob, { backgroundColor: themeColor }]}>
                        <Ionicons
                          name="chevron-back"
                          size={12}
                          color={readableTextOn(themeColor)}
                        />
                        <Ionicons
                          name="chevron-forward"
                          size={12}
                          color={readableTextOn(themeColor)}
                        />
                      </View>
                    </Animated.View>
                    <View style={[styles.sliderHint, styles.sliderHintLeft]}>
                      <ThemedText variant="captionSmall" weight="700" style={{ color: ON_DARK }}>
                        {t('commonUi.anime')}
                      </ThemedText>
                    </View>
                    <View style={[styles.sliderHint, styles.sliderHintRight]}>
                      <ThemedText variant="captionSmall" weight="700" style={{ color: ON_DARK }}>
                        {t('pilgrimageUi.yours')}
                      </ThemedText>
                    </View>
                  </View>
                </GestureDetector>
              ) : (
                // Full: render only the user's shot at its native aspect so the
                // stage snapshot saves the whole frame — no crop. Stage height
                // already matches `shot.width / shot.height` (see container
                // style above), so `contentFit="cover"` and `"contain"` agree.
                <View style={styles.fullFlow}>
                  <Image source={{ uri: shotUri }} style={styles.fullImage} contentFit="cover" />
                  <View style={[styles.fullModeBadge, { borderColor: themeColor }]}>
                    <View style={[styles.labelDot, { backgroundColor: themeColor }]} />
                    <ThemedText variant="captionSmall" weight="700" style={{ color: ON_DARK }}>
                      {t('pilgrimageUi.preview.yourShotFull')}
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>
          </View>

          {sceneOrigin ? (
            <View style={styles.originRow}>
              <AnitabiOriginCredit
                source={{ origin: sceneOrigin, originURL: sceneOriginURL || null }}
                variant="compact"
                tone="tertiary"
                textVariant="captionSmall"
              />
            </View>
          ) : null}

          {sensorSnapshot && positionScore ? (
            <View
              style={[
                styles.analysisCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.analysisHeader}>
                <ThemedText variant="titleMedium" weight="700">
                  {t('pilgrimageUi.positionLock')}
                </ThemedText>
                <Ionicons name="navigate" size={14} color={theme.accent} />
              </View>
              {sensorSnapshot.distanceMeters != null && positionScore.position != null ? (
                <AnalysisBar
                  label={t('pilgrimageUi.position')}
                  value={positionScore.position * 100}
                  rightLabel={`${sensorSnapshot.distanceMeters.toFixed(1)} m`}
                  theme={theme}
                  tone={theme.status.success}
                />
              ) : null}
              {sensorSnapshot.headingDeltaDeg != null && positionScore.heading != null ? (
                <AnalysisBar
                  label={t('pilgrimageUi.heading')}
                  value={positionScore.heading * 100}
                  rightLabel={`±${Math.round(Math.abs(sensorSnapshot.headingDeltaDeg))}°`}
                  theme={theme}
                  tone={theme.status.info}
                />
              ) : null}
              {sensorSnapshot.tilt != null && positionScore.tilt != null ? (
                <AnalysisBar
                  label={t('pilgrimageUi.tilt')}
                  value={positionScore.tilt * 100}
                  rightLabel={formatSignedDeg(sensorSnapshot.tilt)}
                  theme={theme}
                  tone={theme.accent}
                />
              ) : null}
            </View>
          ) : null}

          {frameMatch && frameMatch.total != null ? (
            <View
              style={[
                styles.analysisCard,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                },
              ]}>
              <View style={styles.analysisHeader}>
                <ThemedText variant="titleMedium" weight="700">
                  {t('pilgrimageUi.frameMatch')}
                </ThemedText>
                <Ionicons name="image" size={14} color={theme.accent} />
              </View>
              {frameMatch.histogram != null ? (
                <AnalysisBar
                  label={t('pilgrimageUi.histogram')}
                  value={frameMatch.histogram * 100}
                  rightLabel={`${Math.round(frameMatch.histogram * 100)}%`}
                  theme={theme}
                  tone={theme.status.success}
                />
              ) : null}
              {frameMatch.edge != null ? (
                <AnalysisBar
                  label={t('pilgrimageUi.edge')}
                  value={frameMatch.edge * 100}
                  rightLabel={`${Math.round(frameMatch.edge * 100)}%`}
                  theme={theme}
                  tone={theme.status.info}
                />
              ) : null}
              {frameMatch.lighting != null ? (
                <AnalysisBar
                  label={t('pilgrimageUi.lighting')}
                  value={frameMatch.lighting * 100}
                  rightLabel={`${Math.round(frameMatch.lighting * 100)}%`}
                  theme={theme}
                  tone={theme.accent}
                />
              ) : null}
            </View>
          ) : null}

          {retakeTip ? (
            <View
              style={[
                styles.tipCard,
                { backgroundColor: `${theme.accent}14`, borderColor: `${theme.accent}55` },
              ]}>
              <Ionicons name="bulb-outline" size={16} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
                  {t('pilgrimageUi.tipsToImprove')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" style={{ marginTop: 2 }}>
                  {retakeTip}
                </ThemedText>
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.noteCard,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
            ]}>
            <View style={styles.analysisHeader}>
              <ThemedText variant="titleMedium" weight="700">
                {t('pilgrimageUi.albumDescription')}
              </ThemedText>
              <Ionicons name="create-outline" size={14} color={theme.accent} />
            </View>
            <TextInput
              value={note}
              onChangeText={handleNoteChange}
              placeholder={t('pilgrimageUi.addWhereWhyOrWhat')}
              placeholderTextColor={theme.text.tertiary}
              multiline
              maxLength={280}
              textAlignVertical="top"
              accessibilityLabel={t('pilgrimageUi.albumDescription')}
              style={[
                styles.noteInput,
                {
                  color: theme.text.primary,
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                },
              ]}
            />
          </View>

          <CaptureExifInfoCard
            animeTitle={animeTitle}
            episode={ep}
            spotLat={spotLat}
            spotLng={spotLng}
            heading={focusedHeading}
            userLocation={focusedShot?.userLocation ?? null}
          />
        </KeyboardAwareScrollView>

        <View style={[styles.footer, { paddingBottom: bottomPad(insets) }]}>
          <Pressable
            onPress={handleRetake}
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
              },
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('pilgrimageUi.retake')}>
            <Ionicons name="refresh" size={18} color={theme.text.primary} />
            <ThemedText variant="bodyMedium" weight="600">
              {t('pilgrimageUi.retake')}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.footerBtn,
              {
                backgroundColor: themeColor,
                borderColor: themeColor,
                opacity: saving ? 0.7 : pressed ? 0.88 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              selectedCount > 0
                ? t('pilgrimageUi.preview.saveCountA11y', { count: selectedCount })
                : t('pilgrimageUi.preview.saveA11y')
            }>
            {saving ? (
              <Animated.View entering={FadeIn}>
                <Skeleton.Block width={18} height={18} borderRadius={9} />
              </Animated.View>
            ) : (
              <Ionicons
                name={saved ? 'checkmark' : 'download'}
                size={18}
                color={readableTextOn(themeColor)}
              />
            )}
            <ThemedText
              variant="bodyMedium"
              weight="700"
              style={{ color: readableTextOn(themeColor) }}>
              {saved
                ? t('pilgrimageUi.preview.saved')
                : selectedCount > 1
                  ? t('pilgrimageUi.preview.saveCount', { count: selectedCount })
                  : t('pilgrimageUi.preview.save')}
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
      <ReferencePickerSheet
        visible={referencePickerOpen}
        onClose={() => setReferencePickerOpen(false)}
        onPick={handlePickReference}
        initialAnimeId={
          reference.animeId != null && reference.animeId > 0 ? reference.animeId : null
        }
        currentSpotId={spotId}
      />
    </GestureHandlerRootView>
  );
}

function Filmstrip({
  shots,
  focusedShotId,
  selectedIds,
  accent,
  theme,
  canDelete,
  onFocus,
  onToggleSelect,
  onDelete,
}: {
  shots: readonly CaptureSessionShot[];
  focusedShotId: string | null;
  selectedIds: Set<string>;
  accent: string;
  theme: ThemePalette;
  canDelete: boolean;
  onFocus: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filmstrip}>
      {shots.map((shot) => {
        const focused = shot.id === focusedShotId;
        const selected = selectedIds.has(shot.id);
        const sourceBadge =
          shot.source === 'library'
            ? t('pilgrimageUi.preview.badgeLibrary')
            : shot.captureMode === 'burst'
              ? t('pilgrimageUi.preview.badgeBurst')
              : shot.captureMode === 'hdr'
                ? t('pilgrimageUi.preview.badgeHdr')
                : null;
        return (
          <View key={shot.id} style={styles.thumbWrap}>
            <Pressable
              onPress={() => onFocus(shot.id)}
              onLongPress={canDelete ? () => onDelete(shot.id) : undefined}
              style={({ pressed }) => [
                styles.thumb,
                {
                  borderColor: focused ? accent : theme.glassBorder,
                  borderWidth: focused ? 2.5 : 1,
                },
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                focused
                  ? t('pilgrimageUi.preview.focusedShotA11y')
                  : t('pilgrimageUi.preview.focusShotA11y')
              }>
              <Image source={{ uri: shot.uri }} style={styles.thumbImage} contentFit="cover" />
              {sourceBadge ? (
                <View style={[styles.thumbModeBadge, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
                  <ThemedText variant="captionSmall" weight="700" style={{ color: ON_DARK }}>
                    {sourceBadge}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => onToggleSelect(shot.id)}
              hitSlop={10}
              style={[
                styles.thumbSelect,
                {
                  backgroundColor: selected ? accent : 'rgba(0,0,0,0.55)',
                  borderColor: selected ? accent : 'rgba(255,255,255,0.7)',
                },
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={
                selected
                  ? t('pilgrimageUi.preview.deselectShotA11y')
                  : t('pilgrimageUi.preview.selectShotA11y')
              }>
              {selected ? (
                <Ionicons name="checkmark" size={14} color={readableTextOn(accent)} />
              ) : null}
            </Pressable>
            {canDelete ? (
              <Pressable
                onPress={() => onDelete(shot.id)}
                hitSlop={10}
                style={[styles.thumbDelete, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
                accessibilityRole="button"
                accessibilityLabel={t('pilgrimageUi.deleteShot')}>
                <Ionicons name="close" size={13} color={ON_DARK} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function CaptureExifInfoCard({
  animeTitle,
  episode,
  spotLat,
  spotLng,
  heading,
  userLocation,
}: {
  animeTitle: string | null;
  episode: string | null;
  spotLat: string | null;
  spotLng: string | null;
  heading: number | null;
  userLocation: CaptureSessionShot['userLocation'];
}) {
  const { theme } = useTheme();
  const t = useT();

  const animeRow = animeTitle && animeTitle.length > 0 ? animeTitle : null;
  const animeWithEpisode =
    animeRow && episode && episode.length > 0 ? `${animeRow} · EP${episode}` : animeRow;

  const latNum = spotLat != null ? Number(spotLat) : Number.NaN;
  const lngNum = spotLng != null ? Number(spotLng) : Number.NaN;
  const sceneGpsText =
    Number.isFinite(latNum) && Number.isFinite(lngNum)
      ? `${latNum.toFixed(4)}, ${lngNum.toFixed(4)}`
      : null;
  const recordedGpsText = userLocation
    ? `${userLocation.latitude.toFixed(4)}, ${userLocation.longitude.toFixed(4)}`
    : null;

  const headingText = heading != null && Number.isFinite(heading) ? `${heading.toFixed(0)}°` : null;

  if (!animeWithEpisode && !recordedGpsText && !sceneGpsText && !headingText) return null;

  return (
    <View style={styles.exifCardWrap}>
      <ThemedSurface variant="card" padded>
        <ThemedText variant="titleSmall" weight="700">
          拍攝資訊
        </ThemedText>
        <View style={styles.exifRows}>
          {animeWithEpisode ? (
            <View style={styles.exifRow}>
              <ThemedText variant="bodySmall" weight="600" style={{ color: theme.text.secondary }}>
                {t('commonUi.anime')}
              </ThemedText>
              <ThemedText
                variant="bodySmall"
                weight="600"
                style={[styles.exifRowValue, { color: theme.text.primary }]}
                numberOfLines={2}>
                {animeWithEpisode}
              </ThemedText>
            </View>
          ) : null}
          {recordedGpsText ? (
            <View style={styles.exifRow}>
              <ThemedText variant="bodySmall" weight="600" style={{ color: theme.text.secondary }}>
                {t('pilgrimageUi.recordedGps')}
              </ThemedText>
              <ThemedText
                variant="bodySmall"
                weight="600"
                style={[styles.exifRowValue, { color: theme.text.primary }]}>
                {recordedGpsText}
              </ThemedText>
            </View>
          ) : null}
          {sceneGpsText ? (
            <View style={styles.exifRow}>
              <ThemedText variant="bodySmall" weight="600" style={{ color: theme.text.secondary }}>
                {t('pilgrimageUi.sceneGps')}
              </ThemedText>
              <ThemedText
                variant="bodySmall"
                weight="600"
                style={[styles.exifRowValue, { color: theme.text.primary }]}>
                {sceneGpsText}
              </ThemedText>
            </View>
          ) : null}
          {headingText ? (
            <View style={styles.exifRow}>
              <ThemedText variant="bodySmall" weight="600" style={{ color: theme.text.secondary }}>
                {t('pilgrimageUi.heading')}
              </ThemedText>
              <ThemedText
                variant="bodySmall"
                weight="600"
                style={[styles.exifRowValue, { color: theme.text.primary }]}>
                {headingText}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </ThemedSurface>
    </View>
  );
}

function LabeledImage({
  uri,
  label,
  accent,
  compact,
  contentFit = 'cover',
}: {
  uri: string;
  label: string;
  accent: string;
  compact?: boolean;
  contentFit?: 'cover' | 'contain';
}) {
  return (
    <View style={[styles.labelWrap, compact && { flex: 1 }]}>
      {/* anitabiImageSource adds WAF headers for anitabi scene urls and
          no-ops for local capture uris — safe for both LabeledImage inputs. */}
      <Image source={anitabiImageSource(uri)} style={styles.fullImage} contentFit={contentFit} />
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} style={styles.labelGradient} />
      <View style={[styles.labelBadge, { borderColor: accent }]}>
        <View style={[styles.labelDot, { backgroundColor: accent }]} />
        <ThemedText variant="captionSmall" weight="700" style={{ color: ON_DARK }}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

function AnalysisBar({
  label,
  value,
  rightLabel,
  theme,
  tone,
}: {
  label: string;
  value: number;
  rightLabel: string;
  theme: ThemePalette;
  tone: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.analysisRow}>
      <View style={styles.analysisLabelRow}>
        <ThemedText variant="bodySmall" weight="600">
          {label}
        </ThemedText>
        <ThemedText variant="bodySmall" weight="700" style={{ color: tone }}>
          {rightLabel}
        </ThemedText>
      </View>
      <View style={[styles.analysisTrack, { backgroundColor: theme.background.tertiary }]}>
        <View style={[styles.analysisFill, { backgroundColor: tone, width: `${clamped}%` }]} />
      </View>
    </View>
  );
}

function OpacityBar({
  value,
  onChange,
  accent,
}: {
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <View style={styles.opacityBarRow}>
      {[0.2, 0.4, 0.6, 0.8, 1].map((stop) => {
        const active = Math.abs(value - stop) < 0.05;
        return (
          <Pressable
            key={stop}
            onPress={() => {
              hapticsBridge.selection();
              onChange(stop);
            }}
            style={({ pressed }) => [
              styles.opacityChip,
              {
                backgroundColor: active ? accent : 'rgba(0,0,0,0.55)',
                borderColor: active ? accent : 'rgba(255,255,255,0.25)',
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: active ? readableTextOn(accent) : ON_DARK }}>
              {Math.round(stop * 100)}%
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 52,
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMid: { flex: 1, gap: 2 },
  scrollContent: {
    paddingBottom: 12,
    gap: 12,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    minHeight: Size.minTouchTarget,
    borderRadius: 16,
    marginTop: 8,
  },
  filmstrip: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  thumbWrap: {
    width: 76,
    height: 100,
  },
  thumb: {
    width: 76,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbModeBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  thumbSelect: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  invalidBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    minWidth: 84,
  },
  overallWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  analysisCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  originRow: {
    marginHorizontal: 16,
    marginTop: -4,
    alignItems: 'flex-start',
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  analysisRow: {
    gap: 6,
  },
  analysisLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  analysisTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  analysisFill: {
    height: 6,
    borderRadius: 3,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  noteCard: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  noteInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...Typography.bodyMedium,
  },
  exifCardWrap: {
    marginHorizontal: 16,
  },
  exifRows: {
    marginTop: 10,
    gap: 8,
  },
  exifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  exifRowValue: {
    flex: 1,
    textAlign: 'right',
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  stageWrap: {
    paddingHorizontal: 16,
  },
  stage: {
    height: 360,
    borderRadius: 20,
    overflow: 'hidden',
  },
  stackedFlow: { flex: 1, flexDirection: 'column' },
  referenceRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16 },
  sideFlow: { flex: 1, flexDirection: 'row' },
  sideHalf: { flex: 1 },
  overlayFlow: { flex: 1 },
  sliderFlow: { flex: 1 },
  fullFlow: { flex: 1, position: 'relative' },
  fullModeBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
  },
  labelWrap: { flex: 1, position: 'relative' },
  fullImage: { width: '100%', height: '100%' },
  labelGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  labelBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overlayControls: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
  },
  opacityBarRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 6,
  },
  opacityChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  sliderClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  sliderHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    marginLeft: -1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  sliderKnob: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: -4,
  },
  sliderHint: {
    position: 'absolute',
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sliderHintLeft: { left: 10 },
  sliderHintRight: { right: 10 },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
});
