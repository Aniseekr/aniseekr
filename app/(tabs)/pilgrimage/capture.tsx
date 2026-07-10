// Standalone free-capture camera (spec 3.2). A thin shell around the shared
// camera engine + chrome — deliberately NOT a fork of `compare/[spotId].tsx`.
// Shutter → geotag (best-effort) → save to library + `recordFreeCapture` →
// if a real cached spot is nearby, offer to attach the shot to that scene.
// Rule 9: zoom/exposure stay in SharedValues, capture-in-flight lives in a
// ref, the mount suggestion is the only piece of render state this screen
// owns beyond facing/capturing/device caps.
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCameraPermission } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { ThemedText, ThemedButton, ThemedSurface } from '../../../components/themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { CameraStage } from '../../../components/pilgrimage/camera/CameraStage';
import type { CameraDeviceInfo, CameraEngineHandle } from '../../../components/pilgrimage/camera/camera-engine';
import ShutterRow from '../../../components/pilgrimage/camera/ShutterRow';
import ZoomPresets from '../../../components/pilgrimage/camera/ZoomPresets';
import CameraScrim from '../../../components/pilgrimage/camera/CameraScrim';
import CameraTopBar from '../../../components/pilgrimage/camera/CameraTopBar';
import { LevelHorizon } from '../../../components/pilgrimage/camera/LevelHorizon';
import { FocusReticle } from '../../../components/pilgrimage/camera/FocusReticle';
import GalleryThumb from '../../../components/pilgrimage/camera/GalleryThumb';
import CamSwitchToast, { type CamSwitchToastValue } from '../../../components/pilgrimage/camera/CamSwitchToast';
import type { CameraFacing, FocalStop } from '../../../components/pilgrimage/camera/types';
import { useCameraLifecycle } from '../../../hooks/useCameraLifecycle';
import { useCameraZoom } from '../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../hooks/useTapToFocus';
import { useAlignmentSensors } from '../../../hooks/useAlignmentSensors';
import { availableStopsFromDeviceInfo } from '../../../libs/services/pilgrimage/lens-switching';
import { locationService } from '../../../libs/services/pilgrimage/location-service';
import { recordFreeCapture, recordCapture, clearFreeCapture } from '../../../libs/services/pilgrimage/captures';
import { findNearestCachedSpot, type NearestSpotSuggestion } from '../../../libs/services/pilgrimage/nearest-cached-spot';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';

export default function StandaloneCaptureScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
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
  // Recent free shots this session, newest first — feeds the ShutterRow gallery
  // thumb (same bottom-row layout as compare/[spotId].tsx).
  const [shotUris, setShotUris] = useState<string[]>([]);
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
  const { active: cameraActive, onCameraReady, onMountError } = useCameraLifecycle({
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
    // Move the free capture under the matched spot: record under the real
    // spotId, then drop the free-bucket entry so it isn't duplicated.
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
    await clearFreeCapture(last.uri);
  }, [suggestion]);

  const dismissMount = useCallback(() => {
    hapticsBridge.tap();
    setSuggestion(null);
  }, []);

  const openAlbum = useCallback(() => {
    hapticsBridge.tap();
    router.push('/pilgrimage/album');
  }, [router]);

  if (!hasPermission) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]}>
        <Stack.Screen options={{ headerShown: false }} />
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
      <Stack.Screen options={{ headerShown: false }} />
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
        <FocusReticle focusPoint={focus.focusPoint} accent={theme.accent} afLocked={focus.afLocked} />
      </View>
      <CameraTopBar
        placeName={t('pilgrimage.capture.title')}
        themeColor={theme.accent}
        topInset={insets.top}
        leftInset={insets.left}
        rightInset={insets.right}
        onClose={() => {
          hapticsBridge.tap();
          router.back();
        }}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none" edges={['bottom']}>
        <View style={styles.bottom}>
          <View style={styles.toastWrap}>
            <CamSwitchToast toast={savedToast} themeColor={theme.accent} />
          </View>
          <View style={styles.zoomWrap}>
            <ZoomPresets stops={stops} activeStop={zoom.activeStop} themeColor={theme.accent} onPick={zoom.setStop} />
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
              galleryNode={
                <GalleryThumb
                  uris={shotUris}
                  themeColor={theme.accent}
                  onPickLibrary={openAlbum}
                  onExpand={openAlbum}
                />
              }
            />
          </View>
        </View>
      </SafeAreaView>
      {suggestion ? (
        <MountSuggestion
          suggestion={suggestion}
          themeColor={theme.accent}
          t={t}
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
  onConfirm,
  onDismiss,
}: {
  suggestion: NearestSpotSuggestion;
  themeColor: string;
  t: ReturnType<typeof useT>;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const name = getPilgrimageSpotTitles(suggestion.spot).primary;
  const distance = Math.round(suggestion.distanceMeters);
  return (
    <View pointerEvents="box-none" style={styles.mountRoot}>
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
