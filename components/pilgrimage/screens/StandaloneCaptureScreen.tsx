// Standalone free-capture camera (spec 3.2). A thin shell around the shared
// camera engine + chrome — deliberately NOT a fork of `compare/[spotId].tsx`.
// Shutter → geotag (best-effort) → save to library + `recordFreeCapture` →
// if a real cached spot is nearby, offer to attach the shot to that scene.
// "Reference" opens the ReferencePickerSheet: an anime scene or an imported
// image turns this into the full compare camera (`/compare/[spotId]`).
// Rule 9: zoom/exposure stay in SharedValues, capture-in-flight lives in a
// ref, the mount suggestion is the only piece of render state this screen
// owns beyond facing/capturing/device caps.
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCameraPermission } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import {
  ON_DARK,
  ThemedText,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
} from '../../../components/themed';
import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { CameraStage } from '../../../components/pilgrimage/camera/CameraStage';
import type {
  CameraDeviceInfo,
  CameraEngineHandle,
} from '../../../components/pilgrimage/camera/camera-engine';
import ShutterRow from '../../../components/pilgrimage/camera/ShutterRow';
import ZoomPresets from '../../../components/pilgrimage/camera/ZoomPresets';
import CameraScrim from '../../../components/pilgrimage/camera/CameraScrim';
import CameraTopBar, {
  CameraHeaderButton,
} from '../../../components/pilgrimage/camera/CameraTopBar';
import { LevelHorizon } from '../../../components/pilgrimage/camera/LevelHorizon';
import { FocusReticle } from '../../../components/pilgrimage/camera/FocusReticle';
import GalleryThumb from '../../../components/pilgrimage/camera/GalleryThumb';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import CamSwitchToast, {
  type CamSwitchToastValue,
} from '../../../components/pilgrimage/camera/CamSwitchToast';
import type { CameraFacing, FocalStop } from '../../../components/pilgrimage/camera/types';
import { useCameraLifecycle } from '../../../hooks/useCameraLifecycle';
import { useCameraZoom } from '../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../hooks/useTapToFocus';
import { useAlignmentSensors } from '../../../hooks/useAlignmentSensors';
import { availableStopsFromDeviceInfo } from '../../../libs/services/pilgrimage/lens-switching';
import { locationService } from '../../../libs/services/pilgrimage/location-service';
import {
  findCaptureByUri,
  recordFreeCapture,
  recordCapture,
} from '../../../libs/services/pilgrimage/captures';
import {
  findNearestCachedSpot,
  type NearestSpotSuggestion,
} from '../../../libs/services/pilgrimage/nearest-cached-spot';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import { resolveExperienceTabTarget } from '../../../libs/navigation/experience-tabs';
import { FLOATING_TAB_BAR_CONTENT_INSET } from '../../../libs/navigation/floating-tab-bar-layout';
import {
  buildImportedCompareParams,
  buildSceneCompareParams,
} from '../../../libs/services/pilgrimage/reference-route';
import { importLibraryPhoto } from '../../../libs/services/pilgrimage/reference-image';
import {
  ReferencePickerSheet,
  type PickedReference,
} from '../../../components/pilgrimage/camera/ReferencePickerSheet';
import {
  CameraChrome,
  cameraControlShadow,
} from '../../../components/pilgrimage/camera/cameraChrome';

interface StandaloneCaptureScreenProps {
  tabRoot?: boolean;
}

export default function StandaloneCaptureScreen({ tabRoot = false }: StandaloneCaptureScreenProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { visibleTabs } = useExperienceMode();
  const journalTarget = resolveExperienceTabTarget(
    tabRoot ? visibleTabs : [],
    'explorerJournal',
    '/pilgrimage/album'
  );
  const { hasPermission, requestPermission } = useCameraPermission();
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions({
    granularPermissions: ['photo'],
  });

  const cameraRef = useRef<CameraEngineHandle>(null);
  const capturingRef = useRef(false);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [capturing, setCapturing] = useState(false);
  const [stops, setStops] = useState<FocalStop[]>([1]);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [suggestion, setSuggestion] = useState<NearestSpotSuggestion | null>(null);
  const [savedToast, setSavedToast] = useState<CamSwitchToastValue | null>(null);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [pickedReference, setPickedReference] = useState<PickedReference | null>(null);
  // Recent free shots this session, newest first — feeds the ShutterRow gallery
  // thumb (same bottom-row layout as compare/[spotId].tsx).
  const [shotUris, setShotUris] = useState<string[]>([]);
  // Shots deleted in the Journal meanwhile (their files may be gone) drop out.
  useFocusEffect(
    useCallback(() => {
      setShotUris((prev) => {
        const kept = prev.filter((uri) => findCaptureByUri(uri) !== null);
        return kept.length === prev.length ? prev : kept;
      });
    }, [])
  );
  const lastFreeRef = useRef<{ uri: string; capturedAt: number } | null>(null);

  const exposureShared = useSharedValue(0);
  const zoom = useCameraZoom({ minZoom, maxZoom });
  const focus = useTapToFocus({
    onFocus: (p) => {
      void cameraRef.current?.focus(p);
    },
  });
  // No spot to align to here — the hook still drives `tiltShared` off
  // DeviceMotion so the LevelHorizon renders, matching compare's live level.
  const sensors = useAlignmentSensors({ spotLat: undefined, spotLng: undefined });
  // Same lifecycle hook as compare/[spotId].tsx: pauses the session on
  // background and re-arms it after a native onError instead of leaving a
  // dead preview with no recovery. This screen has no settings sheet, so
  // `settingsOpen` is always false — the hook still owns AppState + re-arm.
  const {
    active: cameraActive,
    onCameraReady,
    onMountError,
  } = useCameraLifecycle({
    settingsOpen: false,
    initialActive: true,
  });

  const handleDeviceInfo = useCallback((info: CameraDeviceInfo | null) => {
    if (!info) return;
    setStops(availableStopsFromDeviceInfo(info));
    setMinZoom(info.minZoom);
    setMaxZoom(info.maxZoom);
  }, []);

  const ensureMedia = useCallback(async () => {
    if (mediaPerm?.granted) return true;
    const res = await requestMediaPerm();
    return res.granted;
  }, [mediaPerm, requestMediaPerm]);

  const onShutter = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePhoto({ enableShutterSound: true });
      focus.releaseLock();
      if (!photo?.uri) return;
      const capturedAt = Date.now();
      const user = await locationService.getCurrentLocation().catch(() => null);
      // Unique per free capture — the album's keys depend on this id, so it
      // must never collide with another free shot taken in the same ms.
      const spotId = `free-${capturedAt}-${Math.round(Math.random() * 1e6)}`;
      await recordFreeCapture({
        spotId,
        uri: photo.uri,
        capturedAt,
        source: 'camera',
        userLocation: user ? { latitude: user.latitude, longitude: user.longitude } : undefined,
      });
      lastFreeRef.current = { uri: photo.uri, capturedAt };
      setShotUris((prev) => [photo.uri, ...prev].slice(0, 12));
      if (await ensureMedia()) {
        await MediaLibrary.saveToLibraryAsync(photo.uri).catch(() => undefined);
      }
      hapticsBridge.success();
      setSavedToast({ icon: 'checkmark-circle', label: t('pilgrimage.capture.savedToAlbum') });
      // Mount suggestion — only when a real cached spot is within range
      // (Rule 8: no guess). Skipped entirely when location is unavailable.
      if (user) {
        const near = await findNearestCachedSpot(user);
        if (near) setSuggestion(near);
      }
    } catch (e) {
      console.warn('[capture] shutter failed', e);
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }, [ensureMedia, focus, t]);

  const acceptMount = useCallback(async () => {
    const s = suggestion;
    const last = lastFreeRef.current;
    setSuggestion(null);
    if (!s || !last) return;
    hapticsBridge.selection();
    // Re-file the free capture under the matched spot. recordCapture upserts by
    // uri, so the free-bucket copy is moved, not duplicated.
    try {
      await recordCapture({
        spotId: s.spot.id,
        uri: last.uri,
        capturedAt: last.capturedAt,
        source: 'camera',
        animeId: s.animeId,
        spotName: s.spot.name,
        spotImage: s.spot.image,
        spotEp: s.spot.ep,
        spotGeo: s.spot.geo,
      });
    } catch (error) {
      console.warn('[capture] mount to spot failed', error);
      hapticsBridge.error();
    }
  }, [suggestion]);

  // A reference turns this free camera into the full compare camera (overlay,
  // frame match, preview) — for a known anime scene or the user's own image.
  const openWithReference = useCallback(
    (reference: PickedReference) => {
      setPickedReference(reference);
      const params =
        reference.kind === 'scene'
          ? buildSceneCompareParams(reference.spot, {
              animeId: reference.animeId,
              animeTitle: reference.animeTitle,
              themeColor: theme.accent,
            })
          : buildImportedCompareParams(reference.uri, {
              label: t('pilgrimageUi.referencePicker.importedLabel'),
              themeColor: theme.accent,
              now: Date.now(),
              nonce: Math.round(Math.random() * 1e6),
            });
      router.push({ pathname: '/compare/[spotId]', params });
    },
    [router, t, theme.accent]
  );

  // The gallery button imports a photo from the library as a free capture.
  const importFromLibrary = useCallback(async () => {
    try {
      const result = await importLibraryPhoto();
      if (result.status !== 'ok') return;
      const capturedAt = Date.now();
      await recordFreeCapture({
        spotId: `free-${capturedAt}-${Math.round(Math.random() * 1e6)}`,
        uri: result.uri,
        capturedAt,
        source: 'library',
      });
      setShotUris((prev) => [result.uri, ...prev].slice(0, 12));
      hapticsBridge.success();
      setSavedToast({ icon: 'checkmark-circle', label: t('pilgrimage.capture.savedToAlbum') });
    } catch (error) {
      console.warn('[capture] library import failed', error);
      hapticsBridge.error();
      Alert.alert(t('pilgrimageUi.referencePicker.importFailed'));
    }
  }, [t]);

  const dismissMount = useCallback(() => {
    hapticsBridge.tap();
    setSuggestion(null);
  }, []);

  const openAlbum = useCallback(() => {
    hapticsBridge.tap();
    if (journalTarget.isVisibleTab) {
      router.navigate(journalTarget.href);
      return;
    }
    router.push(journalTarget.href);
  }, [journalTarget.href, journalTarget.isVisibleTab, router]);

  if (!hasPermission) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]}>
        {tabRoot ? null : <Stack.Screen options={{ headerShown: false }} />}
        {tabRoot ? null : (
          // As a pushed route the gate must not be a dead end (edge-swipe only).
          <View style={[styles.permClose, { top: insets.top + Spacing.xs }]}>
            <ThemedIconButton
              variant="ghost"
              accessibilityLabel={t('common.close')}
              icon={(color) => <Ionicons name="close" size={22} color={color} />}
              onPress={() => router.back()}
            />
          </View>
        )}
        <SafeAreaView style={styles.permBody}>
          <ThemedText variant="titleLarge" weight="700">
            {t('pilgrimage.capture.permTitle')}
          </ThemedText>
          <ThemedText variant="bodyMedium" tone="secondary" align="center">
            {t('pilgrimage.capture.permBody')}
          </ThemedText>
          <ThemedButton
            label={t('pilgrimage.capture.permCta')}
            onPress={async () => {
              const ok = await requestPermission();
              if (!ok) Linking.openSettings().catch(() => undefined);
            }}
            size="lg"
          />
        </SafeAreaView>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      {tabRoot ? null : <Stack.Screen options={{ headerShown: false }} />}
      <CameraStage
        ref={cameraRef}
        facing={facing}
        zoomShared={zoom.zoomShared}
        exposureShared={exposureShared}
        enableTorch={false}
        active={cameraActive}
        pinchGesture={zoom.pinchGesture}
        tapGesture={focus.tapGesture}
        resolutionTier="4k"
        aspect="4:3"
        qualityPrioritization="balanced"
        quality={0.9}
        orientationSource="device"
        onDeviceInfo={handleDeviceInfo}
        onCameraReady={onCameraReady}
        onMountError={onMountError}
      />
      <CameraScrim />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={styles.levelHorizonWrap}>
          <LevelHorizon tiltShared={sensors.tiltShared} color={theme.accent} />
        </View>
        <FocusReticle
          focusPoint={focus.focusPoint}
          accent={theme.accent}
          afLocked={focus.afLocked}
        />
      </View>
      <CameraTopBar
        placeName={t('pilgrimage.capture.title')}
        themeColor={theme.accent}
        topInset={insets.top}
        leftInset={insets.left}
        rightInset={insets.right}
        onClose={
          tabRoot
            ? undefined
            : () => {
                hapticsBridge.tap();
                router.back();
              }
        }
        leftControl={
          <Pressable
            onPress={() => {
              hapticsBridge.tap();
              setReferencePickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('pilgrimageUi.referencePicker.openA11y')}
            style={({ pressed }) => [styles.referencePill, pressed && { opacity: 0.7 }]}>
            {pickedReference ? (
              <SpotImage
                uri={
                  pickedReference.kind === 'scene'
                    ? pickedReference.spot.image
                    : pickedReference.uri
                }
                style={styles.referenceThumb}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="images-outline" size={16} color={ON_DARK} />
            )}
            <ThemedText
              variant="captionSmall"
              weight="700"
              numberOfLines={1}
              style={styles.referenceText}>
              {pickedReference?.kind === 'scene'
                ? getPilgrimageSpotTitles(pickedReference.spot).primary
                : pickedReference?.kind === 'imported'
                  ? t('pilgrimageUi.referencePicker.importedLabel')
                  : t('pilgrimageUi.referencePicker.open')}
            </ThemedText>
          </Pressable>
        }
        actions={
          <CameraHeaderButton
            icon="camera-reverse-outline"
            accessibilityLabel={t('pilgrimage.capture.flipCamera')}
            themeColor={theme.accent}
            active={facing === 'front'}
            accessibilityState={{ selected: facing === 'front' }}
            onPress={() => {
              hapticsBridge.selection();
              setFacing((f) => (f === 'back' ? 'front' : 'back'));
            }}
          />
        }
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none" edges={['bottom']}>
        <View style={[styles.bottom, tabRoot && { paddingBottom: FLOATING_TAB_BAR_CONTENT_INSET }]}>
          <View style={styles.toastWrap}>
            <CamSwitchToast toast={savedToast} themeColor={theme.accent} />
          </View>
          <View style={styles.zoomWrap}>
            <ZoomPresets
              stops={stops}
              activeStop={zoom.activeStop}
              themeColor={theme.accent}
              onPick={zoom.setStop}
            />
          </View>
          <View style={styles.shutterWrap}>
            <ShutterRow
              themeColor={theme.accent}
              capturing={capturing}
              isLandscape={false}
              isFrontFacing={facing === 'front'}
              onShutter={onShutter}
              onFlip={() => {
                hapticsBridge.selection();
                setFacing((f) => (f === 'back' ? 'front' : 'back'));
              }}
              rightNode={
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    router.push('/pilgrimage/identify');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('pilgrimage.detail.identifyScene')}
                  style={({ pressed }) => [styles.identifyButton, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="scan-outline" size={18} color={ON_DARK} />
                  <ThemedText variant="captionSmall" weight="700" style={{ color: ON_DARK }}>
                    {t('pilgrimage.capture.identifyShort')}
                  </ThemedText>
                </Pressable>
              }
              galleryNode={
                <GalleryThumb
                  uris={shotUris}
                  themeColor={theme.accent}
                  onPickLibrary={() => void importFromLibrary()}
                  onExpand={openAlbum}
                />
              }
            />
          </View>
        </View>
      </SafeAreaView>
      <ReferencePickerSheet
        visible={referencePickerOpen}
        onClose={() => setReferencePickerOpen(false)}
        onPick={openWithReference}
      />
      {suggestion ? (
        <MountSuggestion
          suggestion={suggestion}
          themeColor={theme.accent}
          t={t}
          bottomInset={tabRoot ? insets.bottom + FLOATING_TAB_BAR_CONTENT_INSET : 0}
          onConfirm={acceptMount}
          onDismiss={dismissMount}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}

function MountSuggestion({
  suggestion,
  themeColor,
  t,
  bottomInset,
  onConfirm,
  onDismiss,
}: {
  suggestion: NearestSpotSuggestion;
  themeColor: string;
  t: ReturnType<typeof useT>;
  bottomInset: number;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const name = getPilgrimageSpotTitles(suggestion.spot).primary;
  const distance = Math.round(suggestion.distanceMeters);
  return (
    <View pointerEvents="box-none" style={[styles.mountRoot, { bottom: bottomInset }]}>
      <ThemedSurface variant="elevated" padded style={styles.mountCard}>
        <ThemedText variant="titleSmall" weight="700">
          {t('pilgrimage.capture.mountTitle', { name })}
        </ThemedText>
        <ThemedText variant="bodyMedium" tone="secondary">
          {t('pilgrimage.capture.mountBody', { distance })}
        </ThemedText>
        <View style={styles.mountActions}>
          <View style={styles.mountActionFlex}>
            <ThemedButton
              variant="secondary"
              label={t('pilgrimage.capture.mountDismiss')}
              onPress={onDismiss}
              fullWidth
            />
          </View>
          <View style={styles.mountActionFlex}>
            <ThemedButton
              label={t('pilgrimage.capture.mountConfirm')}
              onPress={onConfirm}
              accent={themeColor}
              fullWidth
            />
          </View>
        </View>
      </ThemedSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permRoot: { flex: 1 },
  permClose: { position: 'absolute', left: Spacing.md, zIndex: 1 },
  permBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  levelHorizonWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  toastWrap: { alignItems: 'center' },
  // Floats over the live preview, so it uses the camera chrome, not theme surfaces.
  referencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    minHeight: Size.minTouchTarget,
    maxWidth: 170,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  referenceThumb: { width: 25, height: 25, borderRadius: Radius.sm },
  referenceText: { color: ON_DARK, flexShrink: 1 },
  identifyButton: {
    minHeight: Size.minTouchTarget,
    minWidth: 88,
    maxWidth: 112,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xxs,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
    ...cameraControlShadow,
  },
  zoomWrap: { alignItems: 'center' },
  shutterWrap: { paddingTop: Spacing.xs },
  mountRoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  mountCard: { gap: Spacing.sm, borderRadius: Radius.cardLg },
  mountActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  mountActionFlex: { flex: 1 },
});
