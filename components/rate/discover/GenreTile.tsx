import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { TranslatedText } from '../../themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useTranslatedGenre } from '../../../libs/i18n/use-translated-genre';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { Genre } from '../types';

/** Cover tile for one genre: its most popular title's poster, name underneath. */
export function GenreTile({
  genre,
  onPress,
  onPressIn,
}: {
  genre: Genre;
  onPress: () => void;
  onPressIn: () => void;
}) {
  const { theme } = useTheme();
  const label = useTranslatedGenre(genre.displayName);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.value}
      onPressIn={onPressIn}
      onPress={() => {
        hapticsBridge.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, { opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.cover, { backgroundColor: theme.background.secondary }]}>
        {genre.image ? (
          <Image
            source={{ uri: genre.image }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            contentPosition="top"
            transition={150}
          />
        ) : null}
      </View>
      <TranslatedText
        original={genre.displayName}
        translated={label.value}
        source={label.source}
        variant="titleSmall"
        weight="700"
        numberOfLines={1}
        disableLongPress
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: Spacing.xs },
  cover: { aspectRatio: 16 / 10, borderRadius: Radius.card, overflow: 'hidden' },
});
