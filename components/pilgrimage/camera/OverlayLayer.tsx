import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { GestureDetector } from 'react-native-gesture-handler';
import type { ComposedGesture } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import type { AnimatedStyle } from 'react-native-reanimated';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
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
    />
  );

  // WHY: when editMode === false the entire layer must be INVISIBLE to touch
  // (pointerEvents="none") so pinch/pan falls THROUGH to the CameraStage below
  // for camera zoom. When editMode === true the wrapper is 'box-none' so the
  // inner GestureDetector can capture pinch/pan/rotate bound to overlay transforms.
  return (
    <View style={styles.root} pointerEvents={editMode ? 'box-none' : 'none'}>
      {editMode ? (
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
}: OverlayContentProps) {
  if (mode === 'anime') {
    return (
      <ExpoImage
        source={{ uri: hiResImageUrl }}
        style={[styles.overlayImage, { width: winW, height: winH, opacity }]}
        contentFit="contain"
        transition={120}
      />
    );
  }
  if (edgeOrSketchLoading) {
    return (
      <View style={[styles.overlayWrap, styles.edgeLoader]}>
        <ActivityIndicator color={themeColor} />
      </View>
    );
  }
  // Rule 8: no placeholder when the Skia image is missing and not loading.
  // Caller decides whether to render a "preview unavailable" tile.
  if (!edgeOrSketchImage) return null;
  return (
    <Canvas style={[styles.overlayImage, { width: winW, height: winH, opacity }]}>
      <SkiaImage
        image={edgeOrSketchImage}
        x={0}
        y={0}
        width={winW}
        height={winH}
        fit="contain"
      />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayImage: {
    width: '100%',
    height: '100%',
  },
  edgeLoader: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
