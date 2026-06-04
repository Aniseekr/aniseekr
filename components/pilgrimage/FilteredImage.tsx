// Drop-in replacement for <Image> that applies a Skia ColorMatrix to the
// rendered pixels. Used by ShareCard's user-shot cell so filter presets and
// the future auto-color-match toggle render live in the preview (and get
// captured by react-native-view-shot at export time).
//
// The component falls back to expo-image when:
//   - the matrix prop is missing or identity (no-op filter)
//   - useImage() is still loading (so the screen isn't blank)
//   - the cell hasn't been measured yet (Skia needs explicit pixel sizes)
//
// This keeps cold paint correct (Rule 10: zero awaits between mount and
// first paint) while still showing the user-applied filter as soon as Skia
// decodes the source bitmap.

import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Canvas, Image as SkiaImage, ColorMatrix, useImage } from '@shopify/react-native-skia';
import { IDENTITY_COLOR_MATRIX } from '../../libs/services/pilgrimage/share-filters';

export type FilteredImageProps = {
  uri: string;
  /** 4×5 ColorMatrix (Skia row-major). Pass `null` or identity to bypass Skia. */
  matrix?: number[] | null;
  /** Mirror of expo-image contentFit; only "cover" makes sense for share cards. */
  contentFit?: 'cover' | 'contain';
};

function isIdentity(m: number[] | null | undefined): boolean {
  if (!m) return true;
  if (m.length !== 20) return true;
  for (let i = 0; i < 20; i++) if (m[i] !== IDENTITY_COLOR_MATRIX[i]) return false;
  return true;
}

export function FilteredImage({ uri, matrix, contentFit = 'cover' }: FilteredImageProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const skip = isIdentity(matrix ?? null);
  // useImage runs unconditionally so hook order stays stable when the user
  // toggles filters on/off mid-session.
  const image = useImage(uri);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }
    );
  }, []);

  if (skip || !image || !size) {
    return (
      <View onLayout={onLayout} style={StyleSheet.absoluteFill}>
        <ExpoImage
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
        />
      </View>
    );
  }

  return (
    <View onLayout={onLayout} style={StyleSheet.absoluteFill}>
      <Canvas style={{ width: size.w, height: size.h }}>
        <SkiaImage
          image={image}
          x={0}
          y={0}
          width={size.w}
          height={size.h}
          fit={contentFit}>
          <ColorMatrix matrix={matrix as number[]} />
        </SkiaImage>
      </Canvas>
    </View>
  );
}
