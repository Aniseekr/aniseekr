import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import { GestureDetector } from 'react-native-gesture-handler';
import type { ComposedGesture } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { AnimatedStyle } from 'react-native-reanimated';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { ThemedText } from '../../themed';
import type { OverlayMode } from './types';

interface OverlayLayerProps {
  mode: OverlayMode;
  hiResImageUrl: string;
  winW: number;
  winH: number;
  opacity: number;
  editMode: boolean;
  themeColor: string;
  composedGesture: ComposedGesture;
  animatedStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  edgeOrSketchImage: SkImage | null;
  edgeOrSketchLoading: boolean;
  edgeOrSketchError?: Error | null;
  edgeSourceOpacity: number;
}

export default function OverlayLayer({
  mode,
  hiResImageUrl,
  winW,
  winH,
  opacity,
  editMode,
  themeColor,
  composedGesture,
  animatedStyle,
  edgeOrSketchImage,
  edgeOrSketchLoading,
  edgeOrSketchError = null,
  edgeSourceOpacity,
}: OverlayLayerProps) {
  const content = (
    <OverlayContent
      mode={mode}
      hiResImageUrl={hiResImageUrl}
      winW={winW}
      winH={winH}
      opacity={opacity}
      themeColor={themeColor}
      edgeOrSketchImage={edgeOrSketchImage}
      edgeOrSketchLoading={edgeOrSketchLoading}
      edgeOrSketchError={edgeOrSketchError}
      edgeSourceOpacity={edgeSourceOpacity}
    />
  );

  // WHY: when the layer is non-interactive the entire layer must be INVISIBLE to
  // touch (pointerEvents="none") so pinch/pan falls THROUGH to the CameraStage
  // below for camera zoom. It is interactive only when editMode is on AND the
  // overlay is actually visible (opacity > 0) — otherwise an Off/hidden overlay
  // would leave a full-screen GestureDetector that silently swallows camera
  // pinch-zoom. When interactive the wrapper is 'box-none' so the inner
  // GestureDetector can capture pinch/pan/rotate bound to overlay transforms.
  const interactive = editMode && opacity > 0;
  return (
    <View style={styles.root} pointerEvents={interactive ? 'box-none' : 'none'}>
      {interactive ? (
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.overlayWrap, animatedStyle]} pointerEvents="auto">
            {content}
          </Animated.View>
        </GestureDetector>
      ) : (
        <Animated.View style={[styles.overlayWrap, animatedStyle]} pointerEvents="none">
          {content}
        </Animated.View>
      )}
    </View>
  );
}

interface OverlayContentProps {
  mode: OverlayMode;
  hiResImageUrl: string;
  winW: number;
  winH: number;
  opacity: number;
  themeColor: string;
  edgeOrSketchImage: SkImage | null;
  edgeOrSketchLoading: boolean;
  edgeOrSketchError: Error | null;
  edgeSourceOpacity: number;
}

function OverlayContent({
  mode,
  hiResImageUrl,
  winW,
  winH,
  opacity,
  themeColor,
  edgeOrSketchImage,
  edgeOrSketchLoading,
  edgeOrSketchError,
  edgeSourceOpacity,
}: OverlayContentProps) {
  if (mode === 'anime') {
    return (
      <ExpoImage
        source={anitabiImageSource(hiResImageUrl)}
        style={[styles.overlayImage, { width: winW, height: winH, opacity }]}
        contentFit="contain"
        transition={120}
      />
    );
  }
  const edgeBackdrop =
    mode === 'edge' && edgeSourceOpacity > 0 ? (
      <ExpoImage
        source={anitabiImageSource(hiResImageUrl)}
        style={[
          styles.absoluteOverlayImage,
          { width: winW, height: winH, opacity: opacity * edgeSourceOpacity },
        ]}
        contentFit="contain"
        transition={120}
      />
    ) : null;
  const errorLabel =
    mode === 'subject' ? '無法載入主體' : mode === 'sketch' ? '無法載入草稿' : '無法載入描邊';

  if (edgeOrSketchLoading) {
    return (
      <View style={[styles.overlayImage, { width: winW, height: winH }]}>
        {edgeBackdrop}
        <View style={styles.edgeLoader}>
          <ActivityIndicator color={themeColor} />
        </View>
      </View>
    );
  }
  // Rule 8: a Skia failure must read as a real error, never a blank screen.
  // The compact scrim tile sits over the live camera (camera-scrim exception).
  if (!edgeOrSketchImage && edgeOrSketchError) {
    return (
      <View style={[styles.overlayImage, { width: winW, height: winH }]}>
        {edgeBackdrop}
        <View style={styles.edgeLoader}>
          <View style={styles.errorTile}>
            <ThemedText variant="captionSmall" weight="700" style={styles.errorText}>
              {errorLabel}
            </ThemedText>
          </View>
        </View>
      </View>
    );
  }
  // No image, no error, not loading — nothing to draw.
  if (!edgeOrSketchImage) return edgeBackdrop;
  return (
    <View style={[styles.overlayImage, { width: winW, height: winH }]}>
      {edgeBackdrop}
      <Canvas style={[styles.absoluteOverlayImage, { width: winW, height: winH, opacity }]}>
        <SkiaImage image={edgeOrSketchImage} x={0} y={0} width={winW} height={winH} fit="contain" />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  overlayWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayImage: {
    width: '100%',
    height: '100%',
  },
  absoluteOverlayImage: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  edgeLoader: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // rgba scrim over the live camera preview (CLAUDE.md camera-scrim exception).
  errorTile: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  errorText: { color: '#fff' },
});
