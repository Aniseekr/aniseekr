import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { AnimeTitleText, ThemedSurface, ThemedText } from '../../themed';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { prefetchAnimeDetail, pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { FolderAnimeWithProgress } from '../../../libs/services/collection/collection-service';

export const LibraryAnimeCard = memo(function LibraryAnimeCard({
  item,
}: {
  item: FolderAnimeWithProgress;
}) {
  const { theme } = useTheme();
  const t = useT();
  const router = useRouter();
  const title = item.title || t('tabs.collectionScreen.untitled');
  const seed = { id: item.id, title, image: item.imageUrl ?? undefined };
  const total = item.totalEpisodes && item.totalEpisodes > 0 ? item.totalEpisodes : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPressIn={() => prefetchAnimeDetail(seed)}
      onPress={() => {
        hapticsBridge.tap();
        pushAnimeDetail(router, seed);
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <ThemedSurface style={styles.poster}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={item.id}
          />
        ) : null}
      </ThemedSurface>
      <AnimeTitleText
        anime={{ id: item.id, title }}
        numberOfLines={1}
        style={[styles.title, { color: theme.text.primary }]}
      />
      {total !== null ? (
        <>
          <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
            <View
              style={{
                height: '100%',
                width: `${Math.max(0, Math.min(1, item.progress / total)) * 100}%`,
                backgroundColor: theme.accent,
              }}
            />
          </View>
          <ThemedText variant="captionSmall" tone="secondary">
            {t('tabs.collectionScreen.episodeProgress', { progress: item.progress, total })}
          </ThemedText>
        </>
      ) : item.progress > 0 ? (
        <ThemedText variant="captionSmall" tone="secondary">
          {t('tabs.collectionScreen.episodesWatched', { count: item.progress })}
        </ThemedText>
      ) : null}
    </Pressable>
  );
});
const styles = StyleSheet.create({
  poster: { aspectRatio: 2 / 2.8, borderRadius: Radius.md, overflow: 'hidden' },
  title: { ...Typography.bodySmall, marginTop: Spacing.xs },
  track: {
    height: 3,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Spacing.xxs,
    marginBottom: Spacing.xxs,
  },
});
