import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSize } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { bangumiSubjectImageUrl } from '@/libs/clients/bangumi-client';

/**
 * Key art for a stamp rally: the linked work's Bangumi poster (2:3), fetched by
 * subject id so every rally has one — no per-rally artwork field exists. Falls
 * back to a neutral image glyph, never an invented picture, if the load fails.
 */
export function RallyPoster({
  bangumiId,
  style,
}: {
  bangumiId: number | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = bangumiId !== undefined && !failed;
  return (
    <View
      style={[styles.frame, { backgroundColor: theme.background.tertiary }, style]}
      importantForAccessibility="no-hide-descendants">
      {showImage ? (
        <Image
          source={{ uri: bangumiSubjectImageUrl(bangumiId, 'common') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
          onError={() => setFailed(true)}
        />
      ) : (
        <Ionicons name="image-outline" size={IconSize.md} color={theme.text.tertiary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
