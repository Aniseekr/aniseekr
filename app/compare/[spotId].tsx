import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { useCameraPermission } from 'react-native-vision-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { bottomPad, Radius } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { ThemedButton, ThemedText, readableTextOn } from '../../components/themed';
import { compositeSubjectIntoPhoto } from '../../libs/services/pilgrimage/subject-composite';
import { shouldCompositeSubjectOverlay } from '../../libs/services/pilgrimage/subject-composite-plan';
import { buildAdditionalExif } from '../../libs/services/pilgrimage/build-exif-metadata';
import {
  CAMERA_BAND_GAP,
  resolveCameraBandLayout,
  resolveCameraBottomInset,
  resolveCameraChromeVisibility,
  resolveCameraTopChromeHeight,
} from '../../libs/services/pilgrimage/camera-ui';
import {
  overlayCarouselIndex,
  overlaySelectionForIndex,
} from '../../libs/services/pilgrimage/overlay-carousel';
import { embedCaptureMetadata } from '../../libs/services/pilgrimage/embed-capture-metadata';
import { availableStopsFromDeviceInfo } from '../../libs/services/pilgrimage/lens-switching';
import { captureAnalysisGate } from '../../libs/services/pilgrimage/capture-lens-gate';
import { useResolvedCameraDevices } from '../../hooks/useResolvedCameraDevices';
import { useStrategicCameraDevice } from '../../hooks/useStrategicCameraDevice';
import type {
  CameraDeviceInfo,
  CameraEngineHandle,
} from '../../components/pilgrimage/camera/camera-engine';
import CameraErrorBoundary from '../../components/pilgrimage/camera/CameraErrorBoundary';
import { CameraStage } from '../../components/pilgrimage/camera/CameraStage';
import { CompanionOverlay } from '../../components/companion/CompanionOverlay';
import type { CharacterLayerHandle } from '../../components/companion/CharacterLayer';
import type { CharacterEntry } from '../../libs/services/companion/character-library';
import { compositeCharacterIntoPhoto } from '../../libs/services/companion/character-composite';
import OverlayLayer from '../../components/pilgrimage/camera/OverlayLayer';
import { FocusReticle } from '../../components/pilgrimage/camera/FocusReticle';
import { LevelHorizon } from '../../components/pilgrimage/camera/LevelHorizon';
import FocusExposureBar from '../../components/pilgrimage/camera/FocusExposureBar';
import CameraTopBar, { CameraHeaderButton } from '../../components/pilgrimage/camera/CameraTopBar';
import AlignmentHUD from '../../components/pilgrimage/camera/AlignmentHUD';
import ShutterRow from '../../components/pilgrimage/camera/ShutterRow';
import ReferenceThumbnail from '../../components/pilgrimage/camera/ReferenceThumbnail';
import OverlayModeCarousel from '../../components/pilgrimage/camera/OverlayModeCarousel';
import OverlayQuickControls from '../../components/pilgrimage/camera/OverlayQuickControls';
import ZoomPresets from '../../components/pilgrimage/camera/ZoomPresets';
import OverlayOpacityPill from '../../components/pilgrimage/camera/OverlayOpacityPill';
import GalleryThumb from '../../components/pilgrimage/camera/GalleryThumb';
import CameraScrim from '../../components/pilgrimage/camera/CameraScrim';
import ImportReferencePill from '../../components/pilgrimage/camera/ImportReferencePill';
import CameraSettingsSheet from '../../components/pilgrimage/camera/CameraSettingsSheet';
import { CountdownOverlay } from '../../components/pilgrimage/camera/CountdownOverlay';
import CamSwitchToast, {
  type CamSwitchToastValue,
} from '../../components/pilgrimage/camera/CamSwitchToast';
import type { FlashMode, FocalStop, OverlayMode } from '../../components/pilgrimage/camera/types';
import { useCameraZoom } from '../../hooks/useCameraZoom';
import { useTapToFocus } from '../../hooks/useTapToFocus';
import { useOverlayTransform } from '../../hooks/useOverlayTransform';
import { useAlignmentSensors } from '../../hooks/useAlignmentSensors';
import { useEdgeOrSketch } from '../../hooks/useEdgeOrSketch';
import {
  useCameraSettings,
  qualityToNumber,
  qualityToPrioritization,
  type CameraSettings,
  type CaptureMode,
} from '../../hooks/useCameraSettings';
import { useCameraHud } from '../../hooks/useCameraHud';
import { useCameraLifecycle } from '../../hooks/useCameraLifecycle';
import { useFreezeFrame } from '../../hooks/useFreezeFrame';
import { useCameraOrientation } from '../../hooks/useCameraOrientation';
import { useBurstCapture } from '../../hooks/useBurstCapture';
import { useCaptureCountdown } from '../../hooks/useCaptureCountdown';
import { useExposureBracket } from '../../hooks/useExposureBracket';
import { useSceneAnalyzer } from '../../hooks/useSceneAnalyzer';
import { probeHdrFusionSupport } from '../../libs/services/pilgrimage/composite-hdr';
import { useT, type TranslationKey } from '../../libs/i18n';
import { useAutoCapture } from '../../hooks/useAutoCapture';
import { useCaptureSession } from '../../hooks/useCaptureSession';
import {
  buildLibraryCaptureSessionShot,
  getShots as getCaptureSessionShots,
  type CaptureSessionShot,
} from '../../libs/services/pilgrimage/capture-session';
import { locationService } from '../../libs/services/pilgrimage/location-service';
import AutoCaptureStatusBadge from '../../components/pilgrimage/camera/AutoCaptureBadge';
import CaptureHistoryStrip from '../../components/pilgrimage/camera/CaptureHistoryStrip';
import { captureModeToastCopy } from '../../libs/services/pilgrimage/capture-mode-copy';
import { buildCameraPreviewParams } from '../../libs/services/pilgrimage/preview-capture';
import {
  importReferenceImage,
  referenceFileExists,
  releaseImportedReference,
} from '../../libs/services/pilgrimage/reference-image';
import {
  forgetSpotReference,
  getRememberedSpotReference,
  rememberSpotReference,
  type SpotReference,
} from '../../libs/services/pilgrimage/spot-reference-memory';
import CaptureModeToast from '../../components/pilgrimage/camera/CaptureModeToast';

import AutoCaptureToast from '../../components/pilgrimage/camera/AutoCaptureToast';

type CameraRouteParams = {
  spotId: string;
  imageUrl: string;
  name: string;
  ep: string;
  animeId: string;
  animeTitle: string;
  themeColor: string;
  spotLat: string;
  spotLng: string;
  time?: string;
  targetSpotId?: string;
  /** 'imported' when the reference is the user's own image (no spot/anime behind it). */
  referenceKind?: string;
};

// Flash lives as a top-bar icon button. The icon mirrors the live mode; the
// cycle drops `torch` on the front camera, which has no torch.
const FLASH_ICON: Record<FlashMode, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off-outline',
  auto: 'flash-outline',
  on: 'flash',
  torch: 'flashlight',
};
const FLASH_REAR_CYCLE: FlashMode[] = ['off', 'auto', 'on', 'torch'];
const FLASH_FRONT_CYCLE: FlashMode[] = ['off', 'auto', 'on'];

// Overlay mode switch toast copy — shown briefly when the user taps a mode pill.
// `labelKey` / `hintKey` are resolved via t() at the spread site.
type OverlayModeToastSeed = Pick<CamSwitchToastValue, 'icon'> & {
  labelKey: TranslationKey;
  hintKey?: TranslationKey;
};
const OVERLAY_MODE_TOAST: Record<OverlayMode | 'off', OverlayModeToastSeed> = {
  off: { icon: 'eye-off-outline', labelKey: 'pilgrimageUi.overlayOff' },
  anime: {
    icon: 'image-outline',
    labelKey: 'commonUi.anime',
    hintKey: 'pilgrimageUi.camera.overlayHint.anime',
  },
  edge: {
    icon: 'analytics-outline',
    labelKey: 'pilgrimageUi.edge',
    hintKey: 'pilgrimageUi.camera.overlayHint.edge',
  },
  sketch: {
    icon: 'pencil-outline',
    labelKey: 'pilgrimageUi.sketch',
    hintKey: 'pilgrimageUi.camera.overlayHint.sketch',
  },
  subject: {
    icon: 'person-outline',
    labelKey: 'pilgrimageUi.subject',
    hintKey: 'pilgrimageUi.camera.overlayHint.subject',
  },
};

function isLandscapeReference(reference: SpotReference | null): boolean {
  return (
    reference !== null &&
    reference.width !== null &&
    reference.height !== null &&
    reference.width > reference.height
  );
}

// Capture mode is a top-bar icon button that cycles single → burst → auto; the
// icon mirrors the live mode and a toast explains each mode on change. 'auto'
// replaces the retired 'hdr' mode — it captures a single shot when the scene
// looks well-exposed, and falls through to a real 3-frame exposure bracket
// (or native single-shot HDR when the device supports it) when the scene
// detector flags clipped shadows + highlights.
const CAPTURE_MODE_ICON: Record<CaptureMode, keyof typeof Ionicons.glyphMap> = {
  single: 'camera-outline',
  burst: 'albums-outline',
  auto: 'aperture-outline',
};
const CAPTURE_MODE_CYCLE: CaptureMode[] = ['single', 'burst', 'auto'];

const IMPORTED_CAPTURE_DIR = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}pilgrimage-imports/`
  : null;

function importedCaptureExtension(asset: ImagePicker.ImagePickerAsset): string {
  const candidate = asset.fileName ?? asset.uri;
  const clean = candidate.split('?')[0] ?? '';
  const match = clean.match(/\.([a-z0-9]+)$/i);
  const ext = match?.[1]?.toLowerCase();
  if (!ext) return 'jpg';
  if (ext === 'jpeg') return 'jpg';
  return ['jpg', 'png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
}

async function copyImportedCapture(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (!IMPORTED_CAPTURE_DIR) return asset.uri;
  const info = await FileSystem.getInfoAsync(IMPORTED_CAPTURE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMPORTED_CAPTURE_DIR, { intermediates: true });
  }
  const dest = `${IMPORTED_CAPTURE_DIR}${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${importedCaptureExtension(asset)}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  return dest;
}

export default function CompareCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const params = useLocalSearchParams<CameraRouteParams>();
  const {
    spotId = '',
    imageUrl = '',
    name: nameParam,
    ep,
    animeId,
    animeTitle = '',
    referenceKind,
  } = params;
  // Display-only fallback; EXIF and records only ever get a real scene name.
  const name = nameParam ?? t('pilgrimageUi.preview.sceneFallback');
  const themeColor = params.themeColor || theme.accent;
  const targetSpotId = params.targetSpotId ?? '';
  // The comparison reference is always the user's own screenshot (Atlas has no
  // scene images). It lives in local state so importing one swaps it in place:
  // the camera session, zoom and HUD survive instead of the whole route being
  // replaced. A spot remembers its last import, so coming back reopens with it.
  const [reference, setReference] = useState<SpotReference | null>(() => {
    if (referenceKind === 'imported' && imageUrl) {
      return { uri: imageUrl, width: null, height: null };
    }
    if (!targetSpotId) return null;
    const remembered = getRememberedSpotReference(targetSpotId);
    if (remembered && referenceFileExists(remembered.uri)) return remembered;
    if (remembered) forgetSpotReference(targetSpotId);
    return null;
  });
  const [importingReference, setImportingReference] = useState(false);
  const importedReference = reference !== null;
  const hiResImageUrl = reference?.uri ?? '';
  // A reference is deleted once the camera lets go of it (closed or replaced),
  // unless a shot was filed against it or a spot still remembers it.
  useEffect(() => {
    if (!hiResImageUrl) return;
    return () => releaseImportedReference(hiResImageUrl);
  }, [hiResImageUrl]);

  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  // The engine handle is owned by CameraStage and exposed via the ref.
  const cameraRef = useRef<CameraEngineHandle | null>(null);
  const { hasPermission, requestPermission, canRequestPermission, status } = useCameraPermission();

  const { settings, setSettings } = useCameraSettings();

  // CLAUDE.md Rule 9: the camera HUD's discrete interaction state (facing,
  // flash, aspect, overlay config, panels, toasts) lives in one reducer hook,
  // not ~19 loose top-level useStates. Destructured so existing reads stay as
  // bare identifiers; writes go through `setHud(patch)`. The four persisted
  // overlay knobs seed the reducer's lazy initializer from `settings`.
  // A landscape scene (nearly every anime frame) only lines up when the camera
  // UI is landscape too, so a remembered landscape reference opens that way.
  const { hud, setHud } = useCameraHud(
    settings,
    isLandscapeReference(reference) ? { orientationMode: 'landscape' } : undefined
  );
  const {
    facing,
    flashMode,
    aspect,
    overlayMode,
    edgeIntensity,
    subjectFocus,
    subjectCombine,
    editMode,
    evValue,
    orientationMode,
    settingsOpen,
    overlayVisible,
    captureModeToast,
    autoCaptureToast,
    switchToast,
  } = hud;
  // Active overlay alpha is DERIVED from the per-mode map (Rule 9: no separate
  // mirrored value). Each mode keeps its own alpha — edge reads at ~0.75, the
  // anime bitmap at ~0.35 — so switching modes restores that mode's last pick.
  const overlayOpacity = hud.overlayOpacityByMode[overlayMode] ?? 0.35;
  // Capture-in-flight flag — rendered via `anyCapturing` → ShutterRow.
  const [capturing, setCapturing] = useState(false);
  // Immersive-by-subtraction: landscape auto-hides secondary chrome; a preview tap reveals it.
  // `revealed` is the user's tap-to-reveal intent; `immersive` is DERIVED from it + orientation
  // (no reconciling effect — Rule 9). Orientation flips re-arm immersive via render-time reset.
  const [revealed, setRevealed] = useState(false);
  const [prevLandscape, setPrevLandscape] = useState(isLandscape);
  // Expanded capture-history strip, toggled from the gallery thumb.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [character, setCharacter] = useState<CharacterEntry | null>(null);
  const characterLayerRef = useRef<CharacterLayerHandle>(null);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  // Real device capabilities reported by VisionCamera through the engine. Null
  // until the first device pick resolves; drives zoom range, HDR availability,
  // and the focal-stop pill set on the dial.
  const [deviceInfo, setDeviceInfo] = useState<CameraDeviceInfo | null>(null);

  // Overlay knobs (overlayMode / edgeIntensity / subjectFocus / subjectCombine)
  // are SEEDED into the HUD reducer's lazy initializer from `settings` above
  // (useCameraHud(settings)). Persistence now happens inline via this
  // write-through — NOT a mirror effect. This kills the seed→mirror loop and
  // the synced-ref latch (CLAUDE.md Rule 9: derive / write-through, don't
  // reconcile two stores with a pair of effects).
  const persistOverlayKnob = useCallback(
    (
      patch: Partial<
        Pick<CameraSettings, 'overlayMode' | 'edgeIntensity' | 'subjectFocus' | 'subjectCombine'>
      >
    ) => {
      setHud(patch);
      setSettings(patch);
    },
    [setHud, setSettings]
  );
  const lifecycle = useCameraLifecycle({ settingsOpen, initialActive: true });
  const { active: cameraActive, isReady: cameraIsReady, onCameraReady, onMountError } = lifecycle;
  // AUTO is device-mode by design: the capture follows the physical phone
  // while the HUD stays portrait. The hook also owns the ScreenOrientation
  // lock lifecycle (apply lock-intent on chip change; restore PORTRAIT_UP on
  // unmount) — previously two inline effects in this file.
  const { orientationSource } = useCameraOrientation(orientationMode);

  // Cohort hint: derives `{ strategy, hasStandaloneUltraWide }` from the
  // full device list so the dial can route the 0.5 affordance correctly
  // — onto the ISLAND chip (Android standalone-switch) or onto the strip
  // (iOS / Xiaomi-style logical, where the active session covers 0.5
  // continuously). The strategic hook then drives the actual session swap
  // when the island is tapped.
  const { cohort, cachedSnapshot } = useResolvedCameraDevices(facing);
  // While the live cohort enumerates (cold launch, ~150–500ms on Android),
  // fall back to last session's cached snapshot so the dial paints its
  // final layout on frame 1 instead of flashing [1, max] → [0.5, 1, max].
  // The cache stores strategy + device IDs, not live `CameraDevice`
  // handles, so it's safe ONLY for layout decisions (cohortHint) — never
  // for opening a session, which always uses the live `cohort`.
  const cohortHint = useMemo(() => {
    if (cohort) {
      return {
        strategy: cohort.strategy,
        hasStandaloneUltraWide: cohort.ultraWide !== undefined,
      };
    }
    if (cachedSnapshot) {
      return {
        strategy: cachedSnapshot.strategy,
        hasStandaloneUltraWide: cachedSnapshot.ultraWideDeviceId !== undefined,
      };
    }
    return undefined;
  }, [cohort, cachedSnapshot]);
  // Strategic device: runs the lens-switch FSM (dwell-then-switch + tap-
  // bypass). `activeDevice` is what CameraStage opens its session on;
  // `requestSwitch` is what ZoomDial's island chip calls.
  const strategic = useStrategicCameraDevice(cohort);

  // Android lens-swap freeze-frame: snapshot of the previous lens held still
  // while CameraX tears down the old session. The hook owns the URI + temp-file
  // lifecycle (clear-after-swap, unmount sweep) and writes its ref mirror in the
  // SETTER, not the render body (CLAUDE.md Rule 9). Android-only — on iOS the
  // URI stays null and the hook's effects are no-ops.
  const { freezeFrameUri, setFreezeFrameUri, getFreezeFrameUri } = useFreezeFrame({
    isSwitching: strategic.isSwitching,
  });

  // Wrapper around the FSM's `requestSwitch` that grabs a freeze-frame first
  // (fire-and-forget — the snapshot Promise is allowed to land after the
  // dispatch). The native takeSnapshot call is issued synchronously so the
  // preview buffer is read while it's still showing the OLD lens; the JS
  // Promise just tells us when the file is on disk. Tap-island happens
  // immediately after, so the FSM doesn't wait on disk I/O.
  const handleRequestSwitch = useCallback(
    (target: 'wide' | 'ultra-wide') => {
      if (Platform.OS === 'android') {
        // If a previous freeze-frame is still hanging around (rapid double-
        // tap), delete it before overwriting. getFreezeFrameUri() reads the
        // hook's ref mirror, avoiding a race with its cleanup-timer effect.
        const previous = getFreezeFrameUri();
        const snap = cameraRef.current?.takeSnapshot();
        if (snap) {
          snap
            .then((uri) => {
              if (!uri) return;
              if (previous && previous !== uri) {
                FileSystem.deleteAsync(previous, { idempotent: true }).catch(() => undefined);
              }
              setFreezeFrameUri(uri);
            })
            .catch(() => undefined);
        }
      }
      strategic.requestSwitch(target);
    },
    [strategic, getFreezeFrameUri, setFreezeFrameUri]
  );
  // Compose `onCameraReady` with the FSM's `onCameraStarted` so the FSM
  // learns when a session swap has completed and flips back to STABLE.
  const handleCameraReady = useCallback(() => {
    strategic.onCameraStarted();
    onCameraReady();
  }, [strategic, onCameraReady]);
  const handleMountError = useCallback(
    (e: { nativeEvent: { message: string } }) => {
      strategic.onCameraError(e.nativeEvent.message);
      onMountError(e);
    },
    [strategic, onMountError]
  );
  // Surface lens-switch failures via the existing switch-toast HUD slot.
  // Without this, a CAMERA_ERROR leaves the FSM in ERROR phase silently:
  // `activeDevice` falls back to the previous lens (so the preview still
  // works) but the user has no idea their requested swap didn't take.
  useEffect(() => {
    if (!strategic.error) return;
    setHud({
      switchToast: {
        icon: 'alert-circle-outline',
        label: t('pilgrimageUi.camera.lensSwitchFailed'),
      },
    });
  }, [strategic.error, setHud, t]);

  // Zoom is in REAL factor units now (e.g. 1×, 2×, 3×). Bounds + available
  // pillars come straight from the device — no expo-camera-era guesses.
  const availableStops = useMemo(
    () => availableStopsFromDeviceInfo(deviceInfo, 3, cohortHint),
    [deviceInfo, cohortHint]
  );
  const minZoom = deviceInfo?.minZoom ?? 1;
  const maxZoom = deviceInfo?.maxZoom ?? 1;

  // Pinch-driven lens swap. On standalone-switch cohorts (S20 FE / Pixel 8)
  // pinching IN past 85% of the wide session's minZoom is a clear "I want
  // wider than this lens can give me" intent → swap to the standalone
  // ultra-wide. Mirror: on the ultra-wide session, pinching OUT past 115%
  // of maxZoom swaps back to wide. Both go through `handleRequestSwitch`
  // so the freeze-frame snapshot kicks in just like the chip-tap path.
  const canPinchToUltraWide =
    cohort?.strategy === 'standalone-switch' &&
    cohort.ultraWide !== undefined &&
    strategic.activeLens === 'wide';
  const canPinchBackToWide =
    cohort?.strategy === 'standalone-switch' && strategic.activeLens === 'ultra-wide';
  const handlePinchBelowMin = useCallback(() => {
    if (strategic.isSwitching) return;
    handleRequestSwitch('ultra-wide');
  }, [strategic.isSwitching, handleRequestSwitch]);
  const handlePinchAboveMax = useCallback(() => {
    if (strategic.isSwitching) return;
    handleRequestSwitch('wide');
  }, [strategic.isSwitching, handleRequestSwitch]);

  const zoom = useCameraZoom({
    initial: 1,
    // Suspend camera pinch-zoom while repositioning the overlay so a two-finger
    // pinch scales the OVERLAY (OverlayLayer's own pinch) instead of fighting
    // the camera zoom — the two full-screen pinch surfaces are otherwise
    // un-arbitrated and both fire ("兩個行為衝突").
    enabled: !editMode,
    minZoom,
    maxZoom,
    stops: availableStops,
    onPinchBelowMin: canPinchToUltraWide ? handlePinchBelowMin : undefined,
    onPinchAboveMax: canPinchBackToWide ? handlePinchAboveMax : undefined,
    // Lets the dial's active-stop highlight track the user's mental model:
    // on the ultra-wide session the dial highlights "0.5", not "1" (which is
    // the camera's native zoom there).
    activeLens: strategic.activeLens,
  });

  const tapFocus = useTapToFocus({
    lockTimeoutMs: 5000,
    onFocus: (point) => {
      // Drives a real AE/AF/AWB metering operation at the tap location.
      void cameraRef.current?.focus(point);
      // Tapping the preview also reveals the secondary chrome in landscape immersive.
      setRevealed(true);
    },
  });

  // Exposure SharedValue mirrored from the HUD EV slider. CameraStage feeds
  // this straight to VisionCamera's `exposure` prop — REAL EV bias, not a
  // post-capture brightness fake. Clamped to the device's reported bias range
  // so we never push values the OS will reject.
  const exposureShared = useSharedValue(0);
  useEffect(() => {
    const min = deviceInfo?.minExposureBias ?? 0;
    const max = deviceInfo?.maxExposureBias ?? 0;
    exposureShared.value = Math.max(min, Math.min(max, evValue));
  }, [evValue, deviceInfo, exposureShared]);

  const overlayTransform = useOverlayTransform({ enabled: editMode });
  const getOverlayTransformSnapshot = overlayTransform.getSnapshot;
  const sensors = useAlignmentSensors({ spotLat: params.spotLat, spotLng: params.spotLng });
  const edgeOrSketch = useEdgeOrSketch({
    mode: overlayMode,
    hiResImageUrl,
    themeColor,
    edgeIntensity,
  });
  const subjectReady = overlayMode === 'subject' && hiResImageUrl.length > 0;

  // Live alignment snapshot shared with burst / HDR + EXIF embed flows.
  const getSensorSnapshot = useCallback(
    () => ({
      userLocation: sensors.userLocation,
      heading: sensors.heading,
      tilt: sensors.tilt,
      scoreTotal: sensors.score.total,
    }),
    [sensors.userLocation, sensors.heading, sensors.tilt, sensors.score.total]
  );

  // Flash on the back camera supports torch; on the front it cycles off/auto/on.
  // The torch is a live Camera prop, the flash is a per-capture takePhoto opt.
  const enableTorch = flashMode === 'torch';
  const captureFlash: 'on' | 'off' | 'auto' = flashMode === 'torch' ? 'off' : flashMode;

  // Auto mode runs the scene analyzer at ~5 Hz to drive the AUTO·HDR badge
  // and, on non-HDR devices, the bracket-vs-single decision.
  const sceneAnalyzer = useSceneAnalyzer({ enabled: settings.captureMode === 'auto' });
  // The PhotoHDR constraint is armed for the WHOLE auto-mode session on
  // HDR-capable devices — deliberately NOT gated on the live scene analyzer.
  // Gating it on `hdrRecommended` made `constraints` flip as the user panned,
  // and every flip rebuilds the CameraX session (a visible preview stutter).
  // Kept stable, the constraint changes only on auto-mode enter/exit, folded
  // into the same reconfig as the scene-analyzer frame output.
  const autoHdrSessionArmed =
    settings.captureMode === 'auto' && (deviceInfo?.supportsPhotoHdr ?? false);
  // "this specific shot will be a true HDR JPEG" — the session is armed AND
  // the live scene actually clips enough to benefit. Drives the capture-mode
  // toast and the 'hdr' shot label only; it does NOT gate the constraint.
  const realHdrTargeted = autoHdrSessionArmed && sceneAnalyzer.hdrRecommended;
  // Probe the SkSL HDR-fusion shader once, off the first-paint path. With
  // neither native PhotoHDR nor a working GPU shader, auto-mode HDR runs on the
  // CPU fallback (real fusion, but basic) — surface that honestly so the
  // "AUTO · HDR" badge never overstates what the hardware delivers (Rule 8).
  const [hdrGpuSupported, setHdrGpuSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setHdrGpuSupported(probeHdrFusionSupport());
  }, []);
  const hdrIsBasic = hdrGpuSupported === false && !(deviceInfo?.supportsPhotoHdr ?? false);

  const burst = useBurstCapture({
    engineRef: cameraRef,
    getSensorSnapshot,
    silent: settings.mute,
    flashMode: captureFlash,
  });
  const bracket = useExposureBracket({
    engineRef: cameraRef,
    exposureShared,
    evBiasRange: {
      min: deviceInfo?.minExposureBias ?? 0,
      max: deviceInfo?.maxExposureBias ?? 0,
    },
    restoreEv: evValue,
    quality: qualityToNumber(settings.quality),
    silent: settings.mute,
    flashMode: 'off',
  });
  const countdown = useCaptureCountdown();
  // Capture session — accumulates every shot the user takes this visit
  // (newest first). It survives the camera → preview navigation (the preview
  // is pushed, not replaced) so the multi-shot album can read all shots from
  // one store. Each run{Single|Burst|Auto|HdrBracket} adds the visible/best
  // frame here.
  const captureSession = useCaptureSession();

  // Start a fresh session each time the camera mounts for a spot, so a new
  // pilgrimage visit doesn't surface stale shots. Returning from the preview
  // via router.back() does NOT remount this screen, so the "再拍" round-trip
  // keeps the session intact.
  useEffect(() => {
    captureSession.clearSession();
    // Run once on mount — clearSession is a stable store binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-request permission when the user is in 'not-determined' on mount.
  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      requestPermission().catch(() => undefined);
    }
  }, [hasPermission, canRequestPermission, requestPermission]);

  // Camera `active` is derived inside useCameraLifecycle from app foreground
  // state + settingsOpen + onError re-arm; the route just passes `settingsOpen`
  // in (above) and reads `cameraActive` (below). No effect here.

  const toggleFacing = useCallback(() => {
    hapticsBridge.selection();
    setHud((h) => ({ facing: h.facing === 'back' ? 'front' : 'back' }));
  }, [setHud]);

  const cycleFlash = useCallback(() => {
    hapticsBridge.selection();
    setHud((h) => {
      const cycle = h.facing === 'front' ? FLASH_FRONT_CYCLE : FLASH_REAR_CYCLE;
      const idx = cycle.indexOf(h.flashMode);
      return { flashMode: cycle[(idx === -1 ? 0 : idx + 1) % cycle.length] };
    });
  }, [setHud]);

  // Capture mode lives in the top bar — tapping cycles single → burst → auto
  // and surfaces a short toast describing what the next shutter press will do.
  const cycleCaptureMode = useCallback(() => {
    const idx = CAPTURE_MODE_CYCLE.indexOf(settings.captureMode);
    const next = CAPTURE_MODE_CYCLE[(idx === -1 ? 0 : idx + 1) % CAPTURE_MODE_CYCLE.length];
    hapticsBridge.selection();
    setSettings({ captureMode: next });
    setHud({ captureModeToast: { mode: next } });
  }, [settings.captureMode, setSettings, setHud]);

  const handleToggleEdit = useCallback(() => {
    hapticsBridge.selection();
    setHud((h) => ({ editMode: !h.editMode }));
  }, [setHud]);

  // Import the scene screenshot straight from the photo library and swap it in
  // place. A landscape scene flips the camera UI to landscape so the overlay
  // fills the frame instead of shrinking to a strip (the user can switch back in
  // settings).
  const handleImportReference = useCallback(async () => {
    if (importingReference) return;
    setImportingReference(true);
    try {
      const result = await importReferenceImage();
      if (result.status !== 'ok') return;
      const next: SpotReference = { uri: result.uri, width: result.width, height: result.height };
      if (targetSpotId) rememberSpotReference(targetSpotId, next);
      setReference(next);
      hapticsBridge.success();
      const switchToLandscape =
        isLandscapeReference(next) && !isLandscape && orientationMode === 'auto';
      setHud({
        overlayVisible: true,
        ...(switchToLandscape
          ? {
              orientationMode: 'landscape' as const,
              switchToast: {
                icon: 'phone-landscape-outline' as const,
                label: t('pilgrimageUi.camera.landscapeSwitched'),
              },
            }
          : {}),
      });
    } catch (error) {
      console.warn('[camera] reference import failed', error);
      hapticsBridge.error();
      Alert.alert(t('pilgrimageUi.referencePicker.importFailed'));
    } finally {
      setImportingReference(false);
    }
  }, [importingReference, targetSpotId, isLandscape, orientationMode, setHud, t]);

  // Centralised navigation: every capture mode lands on the same preview
  // screen with the same shape of route params.
  const navigateToPreview = useCallback(
    (shot: CaptureSessionShot) => {
      router.push({
        pathname: '/compare/preview',
        params: buildCameraPreviewParams(shot, {
          spotId,
          imageUrl: hiResImageUrl,
          // The real scene name or nothing — the preview persists it.
          name: nameParam ?? '',
          ep: ep ?? '',
          animeId: animeId ?? '',
          animeTitle,
          themeColor,
          spotLat: params.spotLat ?? '',
          spotLng: params.spotLng ?? '',
          ...(params.targetSpotId ? { targetSpotId: params.targetSpotId } : {}),
          ...(params.time ? { time: params.time } : {}),
          ...(importedReference ? { referenceKind: 'imported' as const } : {}),
        }),
      });
    },
    [
      router,
      spotId,
      hiResImageUrl,
      nameParam,
      ep,
      animeId,
      animeTitle,
      themeColor,
      params.spotLat,
      params.spotLng,
      params.time,
      importedReference,
    ]
  );

  // Add a freshly captured shot to the capture session, snapshotting the
  // sensor readings AT CAPTURE TIME. Rule 8: every sensor field is the real
  // live value or `null` — nothing is invented. Returns the stored record.
  const recordShot = useCallback(
    (shot: {
      uri: string;
      width: number;
      height: number;
      captureMode: 'single' | 'burst' | 'hdr';
      source: 'manual' | 'auto';
      burstTotal?: number;
      burstUris?: string[];
      burstBestIndex?: number;
      /** Physical lens family the capture was taken on — surfaced from
       *  the engine so the album/preview can gate cross-lens analysis. */
      lensType?: 'ultra-wide-angle' | 'wide-angle' | 'telephoto';
    }): CaptureSessionShot => {
      const createdAt = Date.now();
      const record: CaptureSessionShot = {
        id: `${createdAt}-${Math.random()}`,
        uri: shot.uri,
        width: shot.width,
        height: shot.height,
        captureMode: shot.captureMode,
        source: shot.source,
        createdAt,
        heading: sensors.heading,
        distanceMeters: sensors.score.distanceMeters,
        headingDeltaDeg: sensors.score.headingDeltaDeg,
        tilt: sensors.tilt,
        userLocation: sensors.userLocation,
        burstTotal: shot.burstTotal,
        burstUris: shot.burstUris,
        burstBestIndex: shot.burstBestIndex,
        lensType: shot.lensType,
      };
      captureSession.addShot(record);
      return record;
    },
    [
      captureSession,
      sensors.heading,
      sensors.score.distanceMeters,
      sensors.score.headingDeltaDeg,
      sensors.tilt,
      sensors.userLocation,
    ]
  );

  // Build the EXIF payload from the current sensor snapshot + route params.
  // Centralised so single/burst/HDR all stamp the same set of tags.
  const buildExifNow = useCallback(() => {
    return buildAdditionalExif({
      // An imported reference's id is synthetic — it names no real place.
      spotId: params.targetSpotId ?? (importedReference ? '' : spotId),
      spotName: params.targetSpotId
        ? (nameParam ?? '')
        : importedReference
          ? ''
          : (nameParam ?? ''),
      animeId: animeId ?? undefined,
      animeTitle: animeTitle || undefined,
      episode: ep ?? undefined,
      userLocation: sensors.userLocation,
      heading: sensors.heading,
      tilt: sensors.tilt,
    });
  }, [
    importedReference,
    spotId,
    nameParam,
    animeId,
    animeTitle,
    ep,
    sensors.userLocation,
    sensors.heading,
    sensors.tilt,
  ]);

  const maybeCompositeSubjectShot = useCallback(
    async (
      shot: { uri: string; width: number; height: number },
      exif: Record<string, unknown> | null = null
    ): Promise<{ uri: string; width: number; height: number }> => {
      if (
        !shouldCompositeSubjectOverlay({
          mode: overlayMode,
          enabled: subjectCombine,
          subjectReady,
        })
      ) {
        return shot;
      }

      const composite = await compositeSubjectIntoPhoto({
        photoUri: shot.uri,
        referenceUri: hiResImageUrl,
        photoWidth: shot.width,
        photoHeight: shot.height,
        previewWidth: winW,
        previewHeight: winH,
        opacity: overlayOpacity,
        transform: getOverlayTransformSnapshot(),
        quality: qualityToNumber(settings.quality),
        exif,
      });

      return {
        uri: composite.uri,
        width: composite.width || shot.width,
        height: composite.height || shot.height,
      };
    },
    [
      overlayMode,
      subjectCombine,
      subjectReady,
      hiResImageUrl,
      winW,
      winH,
      overlayOpacity,
      getOverlayTransformSnapshot,
      settings.quality,
    ]
  );

  // Phase 1C — bake the placed companion character (去背 cut-out) into the shot
  // at the live transform the user positioned it with. No-op when no character
  // is selected. Runs after the subject composite so the character sits on top,
  // mirroring the live preview (CompanionOverlay renders above OverlayLayer).
  const maybeCompositeCharacterShot = useCallback(
    async (
      shot: { uri: string; width: number; height: number },
      exif: Record<string, unknown> | null = null
    ): Promise<{ uri: string; width: number; height: number }> => {
      if (!character) return shot;
      const snapshot = characterLayerRef.current?.getTransformSnapshot();
      if (!snapshot) return shot;

      const composite = await compositeCharacterIntoPhoto({
        photoUri: shot.uri,
        photoWidth: shot.width,
        photoHeight: shot.height,
        previewWidth: winW,
        previewHeight: winH,
        cutoutUri: character.cutoutUri,
        intrinsicW: character.intrinsicW,
        intrinsicH: character.intrinsicH,
        transform: snapshot,
        quality: qualityToNumber(settings.quality),
        exif,
      });

      return {
        uri: composite.uri,
        width: composite.width || shot.width,
        height: composite.height || shot.height,
      };
    },
    [character, winW, winH, settings.quality]
  );

  const runSingle = useCallback(
    async (
      source: 'manual' | 'auto' = 'manual',
      // Recorded SHOT-level mode (NOT the user-facing CaptureMode). The shot
      // store still distinguishes 'hdr' from 'single' because we want the
      // preview/album to label a native single-shot HDR honestly even though
      // 'hdr' is no longer a user-facing setting.
      captureMode: CaptureSessionShot['captureMode'] = 'single'
    ): Promise<CaptureSessionShot | null> => {
      const engine = cameraRef.current;
      if (!engine) return null;
      setCapturing(true);
      try {
        const additionalExif = buildExifNow();
        const photo = await engine.takePhoto({
          flashMode: captureFlash,
          enableShutterSound: !settings.mute,
        });
        if (!photo?.uri) return null;
        // VisionCamera writes raw bytes — embed our EXIF (anime title, scene,
        // GPS, heading, tilt) onto the JPEG ourselves. The subject/character
        // compositors already embed the SAME EXIF into their own output files,
        // so we only embed the original in-place when NO composite ran. Doing
        // the in-place piexif rewrite in parallel with a compositor reading the
        // same file races a delete-during-read on the JPEG (the rewrite deletes
        // and recreates photo.uri while Skia is decoding it).
        const subjectOutput = await maybeCompositeSubjectShot(
          { uri: photo.uri, width: photo.width, height: photo.height },
          additionalExif
        );
        const output = await maybeCompositeCharacterShot(subjectOutput, additionalExif);
        if (output.uri === photo.uri) {
          await embedCaptureMetadata(photo.uri, additionalExif);
        }
        tapFocus.releaseLock();
        // Lens-gate banner: when the capture was taken on the standalone
        // ultra-wide (or telephoto) we surface a short toast so the user
        // understands why the post-capture analytics card will be missing
        // for this shot. Wide-angle captures get no banner (the default
        // flow is unchanged). See `capture-lens-gate.ts` for the policy.
        const gate = captureAnalysisGate({ lensType: photo.lensType });
        if (gate.bannerMessage) {
          setHud({
            switchToast: {
              icon: 'information-circle-outline',
              label: gate.bannerMessage,
            },
          });
        }
        return recordShot({
          uri: output.uri,
          width: output.width,
          height: output.height,
          captureMode,
          source,
          lensType: photo.lensType,
        });
      } catch (e) {
        console.warn('[camera] single capture failed', e);
        return null;
      } finally {
        setCapturing(false);
      }
    },
    [
      buildExifNow,
      captureFlash,
      settings.mute,
      tapFocus,
      maybeCompositeSubjectShot,
      maybeCompositeCharacterShot,
      recordShot,
      setHud,
    ]
  );

  const runBurst = useCallback(
    async (source: 'manual' | 'auto' = 'manual'): Promise<CaptureSessionShot | null> => {
      const result = await burst.run();
      if (!result) return null;
      tapFocus.releaseLock();
      const additionalExif = buildExifNow();
      const idx = result.bestIndex;
      // Only embed EXIF on the best frame — that's the one we surface in the
      // preview and the only one the user actually keeps. piexif-ts rewrites
      // the whole JPEG on the JS thread; doing it ×6 in `Promise.all` was
      // serialising into ~2–3 s of post-capture JS work before the preview
      // could push, which is what made burst feel slower than the old
      // expo-camera path (which embedded EXIF natively at capture time).
      // The other five alternates stay un-tagged in temp; if a later flow
      // ever surfaces one, it can be re-tagged on demand.
      const bestUri = result.uris[idx];
      const subjectOutput = await maybeCompositeSubjectShot(
        { uri: bestUri, width: result.widths[idx], height: result.heights[idx] },
        additionalExif
      );
      const output = await maybeCompositeCharacterShot(subjectOutput, additionalExif);
      // Only embed in-place when no composite ran (compositors embed their own
      // output); avoids racing the JPEG rewrite against the compositor's read.
      if (output.uri === bestUri) {
        await embedCaptureMetadata(bestUri, additionalExif);
      }
      const burstUris = [...result.uris];
      burstUris[idx] = output.uri;
      return recordShot({
        uri: output.uri,
        width: output.width,
        height: output.height,
        captureMode: 'burst',
        source,
        burstTotal: result.total,
        burstUris,
        burstBestIndex: idx,
        lensType: result.lensType,
      });
    },
    [
      burst,
      tapFocus,
      maybeCompositeSubjectShot,
      maybeCompositeCharacterShot,
      recordShot,
      buildExifNow,
    ]
  );

  // Run a real exposure bracket (3 frames at clamped [-2, 0, +2] EV) and
  // record the composited HDR result. Used by `runAuto` when the scene
  // analyzer flags a high-DR frame AND the device doesn't support native
  // single-shot HDR.
  const runHdrBracket = useCallback(
    async (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      const result = await bracket.run();
      if (!result) return null;
      tapFocus.releaseLock();
      const additionalExif = buildExifNow();
      // Same EXIF rule as runSingle: the compositors embed metadata into their
      // own output, so only embed the bracket frame in-place when no composite
      // ran — never in parallel with a compositor reading the same file.
      const bracketUri = result.uri;
      const subjectOutput = await maybeCompositeSubjectShot(
        { uri: bracketUri, width: result.width, height: result.height },
        additionalExif
      );
      const output = await maybeCompositeCharacterShot(subjectOutput, additionalExif);
      if (output.uri === bracketUri) {
        await embedCaptureMetadata(bracketUri, additionalExif);
      }
      return recordShot({
        uri: output.uri,
        width: output.width,
        height: output.height,
        // Rule 8: when the bracket fell back to a single mid frame we mark
        // it as 'single', not 'hdr' — telling the preview screen the truth
        // about which shot was actually produced.
        captureMode: result.wasHdr ? 'hdr' : 'single',
        source,
        lensType: result.lensType,
      });
    },
    [
      bracket,
      tapFocus,
      maybeCompositeSubjectShot,
      maybeCompositeCharacterShot,
      recordShot,
      buildExifNow,
    ]
  );

  // Auto mode: route the shot.
  //   - HDR-capable device: the PhotoHDR constraint is armed for the whole
  //     auto session, so a single takePhoto is already a true HDR JPEG. We
  //     label it 'hdr' only when the live scene actually clipped enough to
  //     benefit, 'single' otherwise — the shot still went through the HDR
  //     pipeline, but the label tracks whether HDR meaningfully helped.
  //   - Non-HDR device: scene flags HDR → real 3-frame exposure bracket via
  //     `runHdrBracket`; balanced scene → plain single shot.
  //
  // Non-wide lens gate: when the active session is the standalone ultra-wide
  // (or telephoto) the cross-lens analyses are off the table — the scene
  // analyzer's histogram is calibrated against the wide reference, and the
  // bracket composite would compare frames whose lens distortion differs
  // from the reference. Force runSingle for non-wide captures; the banner
  // surfaced from runSingle tells the user why analytics is skipped.
  const runAuto = useCallback(
    async (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      const lensIsWide = strategic.activeLens === 'wide';
      if (!lensIsWide) {
        return runSingle(source, 'single');
      }
      if (autoHdrSessionArmed) {
        return runSingle(source, sceneAnalyzer.hdrRecommended ? 'hdr' : 'single');
      }
      if (sceneAnalyzer.hdrRecommended) {
        return runHdrBracket(source);
      }
      return runSingle(source, 'single');
    },
    [
      autoHdrSessionArmed,
      sceneAnalyzer.hdrRecommended,
      runSingle,
      runHdrBracket,
      strategic.activeLens,
    ]
  );

  // strategic.isSwitching covers the ~200–400ms session-swap window. Without
  // it the shutter can fire mid-swap and VisionCamera throws
  // `Camera is not active` — the UI looks frozen because the throw kills
  // the takePhoto promise. Cheaper to disable the button than to handle the
  // race on the capture path.
  const anyCapturing = capturing || burst.capturing || bracket.capturing || strategic.isSwitching;

  const captureForMode = useCallback(
    (source: 'manual' | 'auto'): Promise<CaptureSessionShot | null> => {
      if (settings.captureMode === 'burst') return runBurst(source);
      if (settings.captureMode === 'auto') return runAuto(source);
      return runSingle(source);
    },
    [settings.captureMode, runBurst, runAuto, runSingle]
  );

  // useAutoCapture watches sensors.score.total + autofocus lock and fires when
  // the user holds the perfect alignment (with AF locked) long enough.
  const AUTO_SUSTAIN_MS = 1500;
  const onAutoFireRef = useRef<() => void>(() => undefined);
  const autoCapture = useAutoCapture({
    scoreTotal: sensors.score.total,
    afLocked: tapFocus.afLocked,
    enabled: settings.autoCapture,
    captureBusy: anyCapturing || countdown.isRunning,
    sustainMs: AUTO_SUSTAIN_MS,
    onFire: () => {
      onAutoFireRef.current();
    },
  });

  const onShutter = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    if (settings.countdownSeconds > 0) {
      const completed = await countdown.start(settings.countdownSeconds);
      if (!completed) return;
    }
    const shot = await captureForMode('manual');
    if (!shot) return;
    navigateToPreview(shot);
  }, [
    autoCapture,
    anyCapturing,
    cameraIsReady,
    settings.countdownSeconds,
    countdown,
    captureForMode,
    navigateToPreview,
  ]);

  const onAutoCapture = useCallback(async () => {
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    if (settings.countdownSeconds > 0) {
      const completed = await countdown.start(settings.countdownSeconds);
      if (!completed) return;
    }
    const shot = await captureForMode('auto');
    if (!shot) return;
    hapticsBridge.success();
    setHud({ autoCaptureToast: { sessionCount: getCaptureSessionShots().length } });
  }, [anyCapturing, cameraIsReady, settings.countdownSeconds, countdown, captureForMode, setHud]);

  useEffect(() => {
    onAutoFireRef.current = () => {
      void onAutoCapture();
    };
  }, [onAutoCapture]);

  const onShutterLongPress = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing || !cameraRef.current || !cameraIsReady) return;
    const shot = await runBurst('manual');
    if (!shot) return;
    navigateToPreview(shot);
  }, [autoCapture, anyCapturing, cameraIsReady, runBurst, navigateToPreview]);

  const ensurePhotoLibraryPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (next.granted) return true;
    }
    Alert.alert(
      t('pilgrimageUi.photoAccessNeededAllowPhotoTitle'),
      t('pilgrimageUi.photoAccessNeededAllowPhotoMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pilgrimageUi.camera.openSettings'),
          onPress: () => Linking.openSettings().catch(() => undefined),
        },
      ]
    );
    return false;
  }, [t]);

  const handlePickLibraryImage = useCallback(async () => {
    autoCapture.cancel();
    if (anyCapturing) return;

    const granted = await ensurePhotoLibraryPermission();
    if (!granted) return;

    setCapturing(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = await copyImportedCapture(asset);
      const userLocation =
        sensors.userLocation ?? (await locationService.getCurrentLocation().catch(() => null));
      const shot = buildLibraryCaptureSessionShot({
        asset: {
          uri,
          width: asset.width,
          height: asset.height,
        },
        createdAt: Date.now(),
        userLocation,
        heading: sensors.heading,
        distanceMeters: sensors.score.distanceMeters,
        headingDeltaDeg: sensors.score.headingDeltaDeg,
        tilt: sensors.tilt,
      });
      captureSession.addShot(shot);
      hapticsBridge.success();
      navigateToPreview(shot);
    } catch (err) {
      console.warn('[camera] library import failed', err);
      hapticsBridge.error();
      Alert.alert(
        t('pilgrimageUi.couldNotImportPhotoPleaseTitle'),
        t('pilgrimageUi.couldNotImportPhotoPleaseMessage')
      );
    } finally {
      setCapturing(false);
    }
  }, [
    autoCapture,
    anyCapturing,
    ensurePhotoLibraryPermission,
    sensors.userLocation,
    sensors.heading,
    sensors.score.distanceMeters,
    sensors.score.headingDeltaDeg,
    sensors.tilt,
    captureSession,
    navigateToPreview,
    t,
  ]);

  // Permission UI — `status === 'not-determined'` is the brief initial state
  // before the platform answers; treat it as "still loading" instead of
  // jumping straight into the denied CTA.
  if (status === 'not-determined' && !hasPermission) {
    return <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]} />;
  }

  if (!hasPermission) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.permContent}>
            <Ionicons name="camera-outline" size={48} color={theme.text.secondary} />
            <ThemedText variant="titleLarge" weight="700" align="center">
              {t('pilgrimageUi.cameraAccessNeeded')}
            </ThemedText>
            <ThemedText
              variant="bodyMedium"
              tone="secondary"
              align="center"
              style={{ marginBottom: 8 }}>
              {t('pilgrimageUi.allowCameraSoYouCan')}
            </ThemedText>
            <ThemedButton
              label={
                canRequestPermission
                  ? t('pilgrimageUi.camera.grantAccess')
                  : t('pilgrimageUi.camera.openSettings')
              }
              accent={themeColor}
              onPress={() => {
                if (canRequestPermission) void requestPermission();
                else Linking.openSettings().catch(() => undefined);
              }}
            />
            <ThemedButton
              variant="ghost"
              label={t('common.notNow')}
              onPress={() => router.back()}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // Android edge-to-edge can report insets.bottom as 0 even when the gesture
  // navigation bar (海帶條) is drawn over the window — floor it so the shutter
  // row + HUD layers always clear the system bar. iOS insets are used as-is.
  const cameraBottomInset = resolveCameraBottomInset(insets.bottom, Platform.OS);
  const safeAreaBottomPad = bottomPad({ bottom: cameraBottomInset });
  // Re-arm immersive whenever orientation flips (adjust-state-during-render, not an effect):
  // entering landscape starts immersive; a preview tap then clears `revealed` to show everything.
  if (prevLandscape !== isLandscape) {
    setPrevLandscape(isLandscape);
    setRevealed(false);
  }
  const immersive = isLandscape && !revealed;
  // Banded chrome: visibility (immersive-by-subtraction) drives the band stack, which is
  // identical in both orientations (the bottom row never reflows to a right-edge column).
  const overlayActive = overlayVisible;
  const carouselIndex = overlayCarouselIndex({ overlayVisible, overlayMode });
  const chrome = resolveCameraChromeVisibility({
    isLandscape,
    immersive,
    afLocked: tapFocus.afLocked,
    overlayActive,
    hasReference: importedReference,
  });
  // Timer, aspect, orientation and the GPS guide live in the settings sheet; the
  // top chrome is a single row so the viewfinder starts right under it.
  const topBarBottom = insets.top + resolveCameraTopChromeHeight({ quickControlsOpen: false });
  const bands = resolveCameraBandLayout({
    bottomInset: safeAreaBottomPad,
    showZoomBand: chrome.showZoomBand,
    showCarousel: chrome.showReferenceControls,
  });
  const importPillBottom =
    bands.zoomBandBottom + (chrome.showZoomBand ? bands.zoomBandHeight + CAMERA_BAND_GAP : 0);
  const chromeTop = safeAreaBottomPad + bands.totalBottomChromeHeight;
  const overlayQuickControlsBottom =
    (chrome.showZoomBand
      ? bands.zoomBandBottom + bands.zoomBandHeight
      : bands.carouselBottom + bands.carouselHeight) + CAMERA_BAND_GAP;
  const rotateGlyphs = isLandscape && orientationMode === 'landscape';
  const hasSpotGeo = Boolean(params.spotLat && params.spotLng);
  const handleOpenInfo = () => {
    hapticsBridge.tap();
    router.push({ pathname: '/compare/align', params: { ...params } });
  };
  // Carousel index → HUD patch. Mirrors the old OverlayControlsBar onSelectOff/onSelectMode
  // (same per-mode switch toast + persisted overlayMode write-through), so behavior is preserved.
  const handleCarouselChange = (index: number) => {
    const selection = overlaySelectionForIndex(index);
    if (!selection.overlayVisible || !selection.overlayMode) {
      const seed = OVERLAY_MODE_TOAST.off;
      setHud({
        overlayVisible: false,
        switchToast: { icon: seed.icon, label: t(seed.labelKey) },
      });
      return;
    }
    const seed = OVERLAY_MODE_TOAST[selection.overlayMode];
    setHud({
      overlayVisible: true,
      overlayMode: selection.overlayMode,
      switchToast: {
        icon: seed.icon,
        label: t(seed.labelKey),
        ...(seed.hintKey ? { hint: t(seed.hintKey) } : {}),
      },
    });
    persistOverlayKnob({ overlayMode: selection.overlayMode });
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraErrorBoundary>
          <CameraStage
            ref={cameraRef}
            facing={facing}
            device={strategic.activeDevice}
            zoomShared={zoom.zoomShared}
            exposureShared={exposureShared}
            preferHdr={autoHdrSessionArmed}
            enableTorch={enableTorch}
            mirrorSelfie={settings.mirror}
            active={cameraActive}
            resolutionTier={settings.resolutionTier}
            aspect={aspect}
            orientationSource={orientationSource}
            qualityPrioritization={qualityToPrioritization(settings.quality)}
            quality={qualityToNumber(settings.quality)}
            enableShutterSound={!settings.mute}
            pinchGesture={zoom.pinchGesture}
            tapGesture={tapFocus.tapGesture}
            onCameraReady={handleCameraReady}
            onMountError={handleMountError}
            onDeviceInfo={setDeviceInfo}
            showWarmup={!cameraIsReady || strategic.isSwitching}
            freezeFrameUri={freezeFrameUri}
            frameOutput={sceneAnalyzer.frameOutput}
          />
        </CameraErrorBoundary>

        <OverlayLayer
          mode={overlayMode}
          hiResImageUrl={hiResImageUrl}
          winW={winW}
          winH={winH}
          opacity={overlayVisible ? overlayOpacity : 0}
          editMode={editMode}
          themeColor={themeColor}
          composedGesture={overlayTransform.composedGesture}
          animatedStyle={overlayTransform.animatedStyle}
          edgeOrSketchImage={edgeOrSketch.image}
          edgeOrSketchLoading={edgeOrSketch.loading}
          edgeOrSketchError={edgeOrSketch.error}
          edgeSourceOpacity={edgeOrSketch.sourceOpacity}
        />

        {/* Always-glass legibility scrim — full-bleed preview shows through. */}
        <CameraScrim />

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={styles.levelHorizonWrap}>
            <LevelHorizon tiltShared={sensors.tiltShared} color={themeColor} />
          </View>
          <FocusReticle
            focusPoint={tapFocus.focusPoint}
            accent={themeColor}
            afLocked={tapFocus.afLocked}
          />
        </View>

        <CompanionOverlay
          parentSize={{ width: winW, height: winH }}
          editMode={editMode}
          characterLayerRef={characterLayerRef}
          character={character}
          pickerOpen={characterPickerOpen}
          onOpenPicker={() => setCharacterPickerOpen(true)}
          onClosePicker={() => setCharacterPickerOpen(false)}
          onSelectCharacter={setCharacter}
        />

        <CameraTopBar
          placeName={name}
          themeColor={themeColor}
          topInset={insets.top}
          leftInset={insets.left}
          rightInset={insets.right}
          onClose={() => router.back()}
          actions={
            <>
              <CameraHeaderButton
                icon={FLASH_ICON[flashMode]}
                accessibilityLabel={t('pilgrimageUi.camera.flashA11y', {
                  mode: t(`pilgrimageUi.camera.flashMode.${flashMode}`),
                })}
                themeColor={themeColor}
                active={flashMode !== 'off'}
                onPress={cycleFlash}
              />
              <CameraHeaderButton
                icon={CAPTURE_MODE_ICON[settings.captureMode]}
                accessibilityLabel={t('pilgrimageUi.camera.captureModeA11y', {
                  mode: t(captureModeToastCopy(settings.captureMode, false).label),
                })}
                themeColor={themeColor}
                active={settings.captureMode !== 'single'}
                onPress={cycleCaptureMode}
              />
              <CameraHeaderButton
                icon="settings-outline"
                accessibilityLabel={t('pilgrimageUi.cameraSettings')}
                accessibilityState={{ expanded: settingsOpen }}
                themeColor={themeColor}
                active={settingsOpen}
                onPress={() => {
                  hapticsBridge.tap();
                  setHud({ settingsOpen: true });
                }}
              />
            </>
          }
        />

        {chrome.showReferenceControls ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.refThumbWrap,
              { top: topBarBottom + 8, left: Math.max(14, insets.left + 12) },
            ]}>
            <ReferenceThumbnail
              imageUrl={hiResImageUrl}
              themeColor={themeColor}
              isLandscape={isLandscape}
              onPress={() => void handleImportReference()}
            />
          </View>
        ) : null}

        {/* Persistent AUTO chip when the user picked auto mode — flips to
            "AUTO · HDR" once the scene analyzer agrees and the camera is
            preparing an HDR shot. Rule 8: this only renders the real live
            recommendation, never a guess. */}
        {settings.captureMode === 'auto' ? (
          <View
            pointerEvents="none"
            style={[
              styles.autoModeBadgeWrap,
              {
                top: topBarBottom + 8,
                right: Math.max(14, insets.right + 12),
              },
            ]}>
            <View
              accessible
              accessibilityLabel={
                sceneAnalyzer.hdrRecommended && hdrIsBasic
                  ? t('pilgrimage.camera.hdrBasicA11y')
                  : sceneAnalyzer.hdrRecommended
                    ? 'AUTO HDR'
                    : 'AUTO'
              }
              style={[
                styles.autoModeBadge,
                {
                  borderColor: sceneAnalyzer.hdrRecommended ? themeColor : 'rgba(255,255,255,0.4)',
                  backgroundColor: sceneAnalyzer.hdrRecommended ? themeColor : 'rgba(0,0,0,0.55)',
                },
              ]}>
              {sceneAnalyzer.hdrRecommended && hdrIsBasic ? (
                <Ionicons name="alert-circle" size={12} color={readableTextOn(themeColor)} />
              ) : null}
              <ThemedText
                variant="captionSmall"
                weight="700"
                style={{
                  color: sceneAnalyzer.hdrRecommended ? readableTextOn(themeColor) : '#fff',
                  letterSpacing: 1,
                }}>
                {sceneAnalyzer.hdrRecommended ? 'AUTO · HDR' : 'AUTO'}
              </ThemedText>
            </View>
          </View>
        ) : null}

        <AlignmentHUD
          score={sensors.score}
          themeColor={themeColor}
          topInset={insets.top}
          bottomInset={cameraBottomInset}
          bottomBarHeight={bands.totalBottomChromeHeight}
          rightReserve={0}
          isLandscape={isLandscape}
          transformed={overlayTransform.transformed}
          rotationDisplayDeg={overlayTransform.rotationDisplayDeg}
          showPerfectBanner={sensors.showPerfectBanner}
          onReset={overlayTransform.resetTransforms}
        />

        {/* Transient focus / EV bar — only while AF is locked (tap-to-focus). */}
        {chrome.showFocusExposureBar ? (
          <FocusExposureBar
            value={evValue}
            themeColor={themeColor}
            anchor={tapFocus.focusPoint}
            bottomOffset={chromeTop + 12}
            isLandscape={isLandscape}
            onChange={(v) => setHud({ evValue: v })}
          />
        ) : null}

        {/* Auto-capture countdown badge — alignment readout, kept in both orientations. */}
        {chrome.showAutoCaptureBadge ? (
          <View pointerEvents="none" style={[styles.floatCenter, { bottom: chromeTop + 56 }]}>
            <AutoCaptureStatusBadge
              remainingMs={autoCapture.remainingMs}
              sustainMs={AUTO_SUSTAIN_MS}
              themeColor={themeColor}
            />
          </View>
        ) : null}

        {/* Expanded capture-history strip — toggled from the gallery thumb. */}
        {historyOpen && chrome.showCaptureHistory ? (
          <View
            pointerEvents="box-none"
            style={[styles.floatCenter, { bottom: chromeTop + 8, height: 60 }]}>
            <CaptureHistoryStrip
              uris={captureSession.shots.map((s) => s.uri)}
              onSelect={(uri) => {
                const shot = captureSession.shots.find((s) => s.uri === uri);
                if (shot) navigateToPreview(shot);
              }}
              themeColor={themeColor}
              isLandscape={false}
            />
          </View>
        ) : null}

        {/* Toasts (capture-mode / auto-capture / lens-switch). */}
        <View pointerEvents="none" style={[styles.floatCenter, { bottom: chromeTop + 104 }]}>
          <CaptureModeToast
            toast={captureModeToast}
            themeColor={themeColor}
            nativeHdrActive={realHdrTargeted}
          />
          <AutoCaptureToast toast={autoCaptureToast} themeColor={themeColor} />
          <CamSwitchToast toast={switchToast} themeColor={themeColor} />
        </View>

        {/* ── Bottom chrome bands — fixed at the bottom edge in BOTH orientations ── */}

        {/* Overlay quick-controls popover (reposition/flip/edge/subject), above the zoom band. */}
        {chrome.showOverlayQuickControls ? (
          <View
            pointerEvents="box-none"
            style={[styles.bandRow, { bottom: overlayQuickControlsBottom }]}>
            <OverlayQuickControls
              mode={overlayMode}
              edgeIntensity={edgeIntensity}
              subjectFocus={subjectFocus}
              subjectCombine={subjectCombine}
              characterSelected={character !== null}
              flipped={overlayTransform.flipped}
              editMode={editMode}
              themeColor={themeColor}
              onSelectEdgeIntensity={(i) => persistOverlayKnob({ edgeIntensity: i })}
              onSelectSubjectFocus={(f) => persistOverlayKnob({ subjectFocus: f })}
              onToggleSubjectCombine={() => persistOverlayKnob({ subjectCombine: !subjectCombine })}
              onOpenCharacterPicker={() => setCharacterPickerOpen(true)}
              onToggleFlip={overlayTransform.toggleFlip}
              onToggleEdit={handleToggleEdit}
            />
          </View>
        ) : null}

        {/* Zoom band: preset pills + opacity pill. Pinch stays on the preview (unchanged). */}
        {chrome.showZoomBand ? (
          <View pointerEvents="box-none" style={[styles.bandRow, { bottom: bands.zoomBandBottom }]}>
            <ZoomPresets
              stops={availableStops}
              activeStop={zoom.activeStop as FocalStop | null}
              themeColor={themeColor}
              onPick={zoom.setStop}
              onPickUltraWide={
                cohortHint?.hasStandaloneUltraWide
                  ? () => handleRequestSwitch('ultra-wide')
                  : undefined
              }
              rotateLabels={rotateGlyphs}
            />
            {chrome.showOpacityPill ? (
              <OverlayOpacityPill
                opacity={overlayOpacity}
                themeColor={themeColor}
                onChange={(o) =>
                  setHud((s) => ({
                    overlayOpacityByMode: { ...s.overlayOpacityByMode, [s.overlayMode]: o },
                  }))
                }
                onComplete={(o) =>
                  setSettings((prev) => ({
                    overlayOpacityByMode: { ...prev.overlayOpacityByMode, [overlayMode]: o },
                  }))
                }
              />
            ) : null}
          </View>
        ) : null}

        {/* Overlay-mode carousel — the primary align-with-scene control, once a reference exists. */}
        {chrome.showReferenceControls ? (
          <View pointerEvents="box-none" style={[styles.bandRow, { bottom: bands.carouselBottom }]}>
            <OverlayModeCarousel
              index={carouselIndex}
              onChangeIndex={handleCarouselChange}
              themeColor={themeColor}
              isLandscape={isLandscape}
              orientationMode={orientationMode}
            />
          </View>
        ) : null}

        {/* No reference yet: one light affordance, not a slab of overlay controls. */}
        {chrome.showImportReference ? (
          <View pointerEvents="box-none" style={[styles.bandRow, { bottom: importPillBottom }]}>
            <ImportReferencePill
              episode={ep}
              time={params.time}
              importing={importingReference}
              onPress={() => void handleImportReference()}
            />
          </View>
        ) : null}

        {/* Bottom row: gallery | shutter | flip — fixed bottom, glyphs rotate in landscape. */}
        <View
          pointerEvents="box-none"
          style={[
            styles.bottomRow,
            {
              bottom: bands.shutterRowBottom,
              height: bands.shutterRowHeight,
              paddingHorizontal: Math.max(insets.left, insets.right),
            },
          ]}>
          <ShutterRow
            themeColor={themeColor}
            capturing={anyCapturing}
            isLandscape={isLandscape}
            rotateGlyphs={rotateGlyphs}
            animateCapture={settings.animateShutter}
            isFrontFacing={facing === 'front'}
            onShutter={onShutter}
            onLongPress={onShutterLongPress}
            onFlip={toggleFacing}
            galleryNode={
              <GalleryThumb
                uris={captureSession.shots.map((s) => s.uri)}
                themeColor={themeColor}
                onPickLibrary={handlePickLibraryImage}
                onExpand={() => setHistoryOpen((v) => !v)}
              />
            }
            burst={
              burst.capturing
                ? { active: true, captured: burst.captured, total: burst.total }
                : undefined
            }
          />
        </View>

        <CountdownOverlay
          remaining={countdown.remaining}
          themeColor={themeColor}
          onCancel={countdown.cancel}
        />

        <CameraSettingsSheet
          visible={settingsOpen}
          onClose={() => setHud({ settingsOpen: false })}
          settings={settings}
          onSettingsChange={setSettings}
          aspect={aspect}
          onAspectChange={(a) => setHud({ aspect: a })}
          captureMode={settings.captureMode}
          onCaptureModeChange={(m) => setSettings({ captureMode: m })}
          orientationMode={orientationMode}
          onOrientationModeChange={(m) => setHud({ orientationMode: m })}
          onOpenGuide={hasSpotGeo ? handleOpenInfo : undefined}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permRoot: { flex: 1 },
  permContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  refThumbWrap: { position: 'absolute', zIndex: 66 },
  refThumbCredit: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.card,
  },
  autoModeBadgeWrap: { position: 'absolute', zIndex: 66 },
  autoModeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.card,
    borderWidth: 1,
  },
  // Banded chrome — every band is full-width and positioned by `bottom` from the resolver,
  // identical in both orientations (no right-edge column).
  bandRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  bottomRow: { position: 'absolute', left: 0, right: 0, zIndex: 70, justifyContent: 'center' },
  floatCenter: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 80 },
  levelHorizonWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
