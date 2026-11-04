import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';

export function PosterRailCard({
  accessibilityLabel,
  imageUri,
  poster,
  title,
  meta,
  onPress,
  onPressIn,
  onImageError,
}: {
  accessibilityLabel: string;
  imageUri?: string | null;
  poster?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  onPress: () => void;
  onPressIn?: () => void;
  onImageError?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}>
      {poster ?? (
        <Image
          source={imageUri ? { uri: imageUri } : undefined}
          style={[styles.poster, { backgroundColor: theme.background.secondary }]}
          contentFit="cover"
          onError={onImageError}
        />
      )}
      <View style={styles.copy}>
        {title}
        {meta}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 112, gap: Spacing.xxs },
  poster: { width: 112, height: 158, borderRadius: Radius.sm },
  copy: { gap: Spacing.xxs },
});
