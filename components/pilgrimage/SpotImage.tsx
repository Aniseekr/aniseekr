// SpotImage — shared scene/cover image for pilgrimage surfaces. Every remote
// pilgrimage image renders through this so a load failure shows an honest
// error tile (CLAUDE.md Rule 8) instead of a silent blank box.
import { useState } from 'react';
import { StyleSheet, View, type StyleProp } from 'react-native';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { sanitizeImageUri } from './spot-image-uri';

export { sanitizeImageUri } from './spot-image-uri';

export interface SpotImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  accessibilityLabel?: string;
  fallbackIconSize?: number;
}

export function SpotImage({
  uri,
  style,
  contentFit = 'cover',
  recyclingKey,
  accessibilityLabel,
  fallbackIconSize = 18,
}: SpotImageProps) {
  const { theme } = useTheme();
  const t = useT();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const clean = sanitizeImageUri(uri);

  if (clean === null || failedUri === clean) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('pilgrimage.image.unavailable')}
        style={[styles.fallback, { backgroundColor: theme.background.tertiary }, style]}>
        <Ionicons name="image-outline" size={fallbackIconSize} color={theme.text.tertiary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: clean }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={recyclingKey}
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailedUri(clean)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
