import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { bottomPad } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { ThemedText, readableTextOn } from '../../../../components/themed';
import { toFullResImageUrl } from '../../../../libs/services/pilgrimage/anitabi-image';
import { applyBrightnessToImage } from '../../../../libs/services/pilgrimage/apply-brightness';
import {
  cameraOrientationLockIntent,
  formatCameraHeader,
  type CameraOrientationMode,
} from '../../../../libs/services/pilgrimage/camera-ui';
import { stopForLens } from '../../../../libs/services/pilgrimage/lens-switching';
import CameraErrorBoundary from '../../../../components/pilgrimage/camera/CameraErrorBoundary';
import CameraStage from '../../../../components/pilgrimage/camera/CameraStage';
import OverlayLayer from '../../../../components/pilgrimage/camera/OverlayLayer';
import { FocusReticle } from '../../../../components/pilgrimage/camera/FocusReticle';
import { LevelHorizon } from '../../../../components/pilgrimage/camera/LevelHorizon';
import FocusExposureBar from '../../../../components/pilgrimage/camera/FocusExposureBar';
import CameraTopBar from '../../../../components/pilgrimage/camera/CameraTopBar';
import AlignmentHUD from '../../../../components/pilgrimage/camera/AlignmentHUD';
import { ToolRibbon } from '../../../../components/pilgrimage/camera/ToolRibbon';
import FocalPills from '../../../../components/pilgrimage/camera/FocalPills';
import ShutterRow from '../../../../components/pilgrimage/camera/ShutterRow';
import OverlayChip from '../../../../components/pilgrimage/camera/chips/OverlayChip';
import FlashChip from '../../../../components/pilgrimage/camera/chips/FlashChip';
import ExposureChip from '../../../../components/pilgrimage/camera/chips/ExposureChip';
import AspectChip from '../../../../components/pilgrimage/camera/chips/AspectChip';
import type {
  AspectRatio,
  FlashMode,
  FocalStop,
  OverlayMode,
} from '../../../../components/pilgrimage/camera/types';
import { useCameraZoom } from '../../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../../hooks/useTapToFocus';
import { useLensSwitcher } from '../../../../hooks/useLensSwitcher';
import { useBrightnessPreview } from '../../../../hooks/useBrightnessPreview';
import { useOverlayTransform } from '../../../../hooks/useOverlayTransform';
import { useAlignmentSensors } from '../../../../hooks/useAlignmentSensors';
import { useEdgeOrSketch } from '../../../../hooks/useEdgeOrSketch';

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
};

export default function CompareCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const params = useLocalSearchParams<CameraRouteParams>();
  const { spotId = '', imageUrl = '', name = 'Scene', ep, animeId, animeTitle = '' } = params;
  const themeColor = params.themeColor || theme.accent;
  // Anitabi `?plan=h160` is a 284×160 thumb; upgrade to full 1920×1080 for the
  // overlay + Skia edge/sketch source.
  const hiResImageUrl = useMemo(() => toFullResImageUrl(imageUrl), [imageUrl]);

  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [aspect, setAspect] = useState<AspectRatio>('16:9');
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('anime');
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [editMode, setEditMode] = useState(false);
  const [evValue, setEvValue] = useState(0);
  const [orientationMode, setOrientationMode] = useState<CameraOrientationMode>('auto');
  const [capturing, setCapturing] = useState(false);

  const zoom = useCameraZoom({ initial: 1 });
  const tapFocus = useTapToFocus({ lockTimeoutMs: 5000 });
  const lensSwitcher = useLensSwitcher({ cameraRef });
  const brightness = useBrightnessPreview({ value: evValue });
  const overlayTransform = useOverlayTransform({ enabled: editMode });
  const sensors = useAlignmentSensors({ spotLat: params.spotLat, spotLng: params.spotLng });
  const edgeOrSketch = useEdgeOrSketch({ mode: overlayMode, hiResImageUrl, themeColor });

  // CameraView.flash only accepts 'on'|'off'|'auto'; torch surfaces via enableTorch.
  const enableTorch = flashMode === 'torch';
  const cameraFlash: 'on' | 'off' | 'auto' = flashMode === 'torch' ? 'off' : flashMode;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().catch(() => undefined);
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined
      );
    };
  }, []);

  useEffect(() => {
    const lockIntent = cameraOrientationLockIntent(orientationMode);
    const op =
      lockIntent === 'landscape'
        ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
        : ScreenOrientation.unlockAsync();
    op.catch(() => undefined);
  }, [orientationMode]);

  const onShutter = useCallback(async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (!photo?.uri) return;
      const baked = await applyBrightnessToImage({
        inputUri: photo.uri,
        colorMatrix: brightness.colorMatrix,
      });
      tapFocus.releaseLock();
      router.replace({
        pathname: '/pilgrimage/compare/preview',
        params: {
          spotId,
          imageUrl: hiResImageUrl,
          shotUri: baked.uri,
          shotWidth: String(baked.width || photo.width || 0),
          shotHeight: String(baked.height || photo.height || 0),
          name,
          ep: ep ?? '',
          animeId: animeId ?? '',
          animeTitle,
          themeColor,
          heading: sensors.heading != null ? sensors.heading.toFixed(0) : '',
          spotLat: params.spotLat ?? '',
          spotLng: params.spotLng ?? '',
          distanceMeters:
            sensors.score.distanceMeters != null ? String(sensors.score.distanceMeters) : '',
          headingDeltaDeg:
            sensors.score.headingDeltaDeg != null ? String(sensors.score.headingDeltaDeg) : '',
          tilt: sensors.tilt != null ? String(sensors.tilt) : '',
        },
      });
    } catch (e) {
      console.warn('[camera] capture failed', e);
    } finally {
      setCapturing(false);
    }
  }, [
    capturing,
    brightness.colorMatrix,
    tapFocus,
    router,
    spotId,
    hiResImageUrl,
    name,
    ep,
    animeId,
    animeTitle,
    themeColor,
    sensors.heading,
    sensors.score.distanceMeters,
    sensors.score.headingDeltaDeg,
    sensors.tilt,
    params.spotLat,
    params.spotLng,
  ]);

  const onPickFocalStop = useCallback(
    (stop: FocalStop) => {
      if (lensSwitcher.hasOpticalZoom) lensSwitcher.setStop(stop);
      else zoom.setStop(stop);
    },
    [lensSwitcher, zoom]
  );

  const toggleLandscapeMode = useCallback(() => {
    hapticsBridge.selection();
    setOrientationMode((mode) => (mode === 'landscape' ? 'auto' : 'landscape'));
  }, []);

  if (!permission) {
    return <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.permContent}>
            <Ionicons name="camera-outline" size={48} color={theme.text.secondary} />
            <ThemedText variant="titleLarge" weight="700" align="center">
              Camera access needed
            </ThemedText>
            <ThemedText
              variant="bodyMedium"
              tone="secondary"
              align="center"
              style={{ marginBottom: 8 }}>
              Allow camera so you can frame this scene against its anime reference.
            </ThemedText>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                if (permission.canAskAgain) void requestPermission();
                else Linking.openSettings().catch(() => undefined);
              }}
              style={({ pressed }) => [
                styles.permBtn,
                { backgroundColor: themeColor, opacity: pressed ? 0.85 : 1 },
              ]}>
              <ThemedText
                variant="titleSmall"
                weight="700"
                style={{ color: readableTextOn(themeColor) }}>
                {permission.canAskAgain ? 'Grant access' : 'Open Settings'}
              </ThemedText>
            </Pressable>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <ThemedText variant="bodyMedium" tone="secondary">
                Not now
              </ThemedText>
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const headerText = formatCameraHeader({ sceneName: name, animeTitle, ep });
  const activeFocalStop = lensSwitcher.hasOpticalZoom
    ? (stopForLens(lensSwitcher.selectedLens) as FocalStop | null)
    : zoom.activeStop;
  const focusEvBarBottom = bottomPad(insets) + (isLandscape ? 72 : 116);
  const dockBottom = bottomPad(insets) + (isLandscape ? 70 : 110) + (tapFocus.afLocked ? 68 : 0);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.root}>
        <CameraErrorBoundary>
          <CameraStage
            cameraRef={cameraRef}
            facing={facing}
            zoom={zoom.zoom}
            autofocus={tapFocus.autofocus}
            flashMode={cameraFlash}
            enableTorch={enableTorch}
            selectedLens={lensSwitcher.selectedLens}
            ratio={aspect === 'full' ? undefined : aspect}
            responsiveOrientationWhenOrientationLocked
            pinchGesture={zoom.pinchGesture}
            tapGesture={tapFocus.tapGesture}
            brightnessOverlayStyle={brightness.overlayStyle}
            onCameraReady={lensSwitcher.refreshAvailableLenses}
          />
        </CameraErrorBoundary>

        <OverlayLayer
          mode={overlayMode}
          hiResImageUrl={hiResImageUrl}
          winW={winW}
          winH={winH}
          opacity={overlayOpacity}
          editMode={editMode}
          themeColor={themeColor}
          composedGesture={overlayTransform.composedGesture}
          animatedStyle={overlayTransform.animatedStyle}
          edgeOrSketchImage={edgeOrSketch.image}
          edgeOrSketchLoading={edgeOrSketch.loading}
        />

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

        <CameraTopBar
          sceneName={headerText.title}
          subtitleText={headerText.subtitle}
          themeColor={themeColor}
          topInset={insets.top}
          onClose={() => router.back()}
          onOpenInfo={() => {
            hapticsBridge.tap();
            router.push({ pathname: '/pilgrimage/compare/align', params: { ...params } });
          }}
        />

        <AlignmentHUD
          score={sensors.score}
          themeColor={themeColor}
          topInset={insets.top}
          bottomInset={insets.bottom}
          isLandscape={isLandscape}
          transformed={overlayTransform.transformed}
          rotationDisplayDeg={overlayTransform.rotationDisplayDeg}
          showPerfectBanner={sensors.showPerfectBanner}
          onReset={overlayTransform.resetTransforms}
        />

        <View style={[styles.sideControls, { top: insets.top + 108, right: 14 }]}>
          {!isLandscape ? (
            <Pressable
              onPress={() => {
                hapticsBridge.selection();
                setEditMode((v) => !v);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ selected: editMode }}
              accessibilityLabel={editMode ? 'Lock overlay' : 'Edit overlay position'}
              style={({ pressed }) => [
                styles.roundControl,
                {
                  backgroundColor: editMode ? themeColor : 'rgba(0,0,0,0.45)',
                  borderColor: editMode ? themeColor : 'rgba(255,255,255,0.18)',
                  opacity: pressed ? 0.75 : 1,
                },
              ]}>
              <Ionicons
                name={editMode ? 'lock-open' : 'move'}
                size={16}
                color={editMode ? readableTextOn(themeColor) : '#fff'}
              />
            </Pressable>
          ) : null}
          <Pressable
            onPress={toggleLandscapeMode}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ selected: orientationMode === 'landscape' }}
            accessibilityLabel={
              orientationMode === 'landscape' ? 'Return to auto rotation' : 'Use landscape'
            }
            style={({ pressed }) => [
              styles.roundControl,
              {
                backgroundColor: orientationMode === 'landscape' ? themeColor : 'rgba(0,0,0,0.45)',
                borderColor:
                  orientationMode === 'landscape' ? themeColor : 'rgba(255,255,255,0.18)',
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            <Ionicons
              name={
                orientationMode === 'landscape'
                  ? 'phone-portrait-outline'
                  : 'phone-landscape-outline'
              }
              size={16}
              color={orientationMode === 'landscape' ? readableTextOn(themeColor) : '#fff'}
            />
          </Pressable>
        </View>

        {/* Dock houses chips + focal pills ABOVE the ShutterRow. ShutterRow pins
            itself to bottom:0 with its own bottomPad, so we offset the dock to
            clear the shutter zone. */}
        <View style={[styles.dock, { bottom: dockBottom }]} pointerEvents="box-none">
          <ToolRibbon
            isLandscape={isLandscape}
            topInset={insets.top}
            bottomInset={insets.bottom}
            overlay={
              <OverlayChip
                mode={overlayMode}
                opacity={overlayOpacity}
                flipped={overlayTransform.flipped}
                themeColor={themeColor}
                onSelectMode={setOverlayMode}
                onChangeOpacity={setOverlayOpacity}
                onToggleFlip={overlayTransform.toggleFlip}
              />
            }
            flash={
              <FlashChip
                flashMode={flashMode}
                isFrontFacing={facing === 'front'}
                onChange={setFlashMode}
              />
            }
            exposure={
              tapFocus.afLocked ? null : <ExposureChip value={evValue} onChange={setEvValue} />
            }
            aspect={<AspectChip aspect={aspect} onChange={setAspect} />}
          />
          <FocalPills
            activeStop={activeFocalStop}
            themeColor={themeColor}
            availableStops={lensSwitcher.hasOpticalZoom ? lensSwitcher.availableStops : undefined}
            opticalHint={lensSwitcher.hasOpticalZoom}
            isFrontFacing={facing === 'front'}
            onPick={onPickFocalStop}
          />
        </View>

        {tapFocus.afLocked ? (
          <FocusExposureBar
            value={evValue}
            themeColor={themeColor}
            bottomOffset={focusEvBarBottom}
            isLandscape={isLandscape}
            onChange={setEvValue}
          />
        ) : null}

        <ShutterRow
          themeColor={themeColor}
          referenceImageUrl={imageUrl}
          capturing={capturing}
          isLandscape={isLandscape}
          bottomInset={insets.bottom}
          onShutter={onShutter}
          onOpenMap={() =>
            router.push({
              pathname: '/(tabs)/pilgrimage/map',
              params: { spotId, animeId: animeId ?? '' },
            })
          }
          onPickReference={() => {
            hapticsBridge.tap();
            setOverlayMode('anime');
          }}
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
  permBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, marginTop: 12 },
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 12 },
  levelHorizonWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideControls: {
    position: 'absolute',
    gap: 10,
  },
  roundControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
