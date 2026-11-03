// SpotImage — shared scene/cover image for pilgrimage surfaces. Every remote
// pilgrimage image renders through this so a load failure shows an honest
// error tile (CLAUDE.md Rule 8) instead of a silent blank box.
import { useState } from 'react';
import { StyleSheet, View, type StyleProp } from 'react-native';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import { anitabiImageSource } from '../../libs/services/pilgrimage/anitabi-image';
import { sanitizeImageUri } from './spot-image-uri';

export { sanitizeImageUri } from './spot-image-uri';

export interface SpotImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  /** 'top' for portrait posters in wider frames so faces aren't cropped. */
  contentPosition?: 'center' | 'top';
  /** Tried once when `uri` fails (e.g. anitabi 403) before the no-image tile. */
  fallbackUri?: string | null;
  recyclingKey?: string;
  accessibilityLabel?: string;
  fallbackIconSize?: number;
}

export function SpotImage({
  uri,
  style,
  contentFit = 'cover',
  contentPosition = 'center',
  fallbackUri,
  recyclingKey,
  accessibilityLabel,
  fallbackIconSize = 18,
}: SpotImageProps) {
  const { theme } = useTheme();
  const t = useT();
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const primary = sanitizeImageUri(uri);
  const fallback = sanitizeImageUri(fallbackUri);
  const clean =
    primary !== null && !failed.has(primary)
      ? primary
      : fallback !== null && !failed.has(fallback)
        ? fallback
        : null;

  if (clean === null) {
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
      source={anitabiImageSource(clean)}
      style={style}
      contentFit={contentFit}
      contentPosition={contentPosition}
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={recyclingKey}
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailed((prev) => new Set(prev).add(clean))}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
