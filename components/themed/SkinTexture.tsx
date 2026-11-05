import { memo } from 'react';
import { Image, StyleSheet, type ImageSourcePropType } from 'react-native';
import type { ThemePalette, ThemeSkin, SkinTextureKind } from '../../context/ThemeContext';

// White-on-transparent tiles (scripts/skins/textures.py), tinted at runtime so
// one file serves light and dark mode. A native repeat-tiled Image: no SVG work
// per frame, so it is cheap enough to sit inside every list card.
const TILES: Record<SkinTextureKind, ImageSourcePropType> = {
  washi: require('../../assets/skins/washi.png'),
  halftone: require('../../assets/skins/halftone.png'),
  grain: require('../../assets/skins/grain.png'),
  scanline: require('../../assets/skins/scanline.png'),
  petals: require('../../assets/skins/petals.png'),
  clouds: require('../../assets/skins/clouds.png'),
};

function tint(theme: ThemePalette, tone: ThemeSkin['texture']['tone']): string {
  if (tone === 'accent') return theme.accent;
  if (tone === 'paper') return theme.background.primary;
  return theme.text.primary;
}

/** Decorative skin texture; absolute-fills its parent behind the content. */
export const SkinTexture = memo(function SkinTexture({ theme }: { theme: ThemePalette }) {
  const texture = theme.skin?.texture;
  if (!texture) return null;
  return (
    <Image
      source={TILES[texture.kind]}
      resizeMode="repeat"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { tintColor: tint(theme, texture.tone), opacity: texture.opacity },
      ]}
    />
  );
});
