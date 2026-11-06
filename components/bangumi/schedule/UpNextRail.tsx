import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Anime } from '../../rate/types';
import { AnimeTitleText, ThemedText } from '../../themed';
import { ProgressiveImage } from '../../common/ProgressiveImage';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { airingCountdown } from '../../../libs/utils/airing';
import { prefetchAnimeDetail, pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';

const SOON_HOURS = 24;

/**
 * What I follow, in the order it airs next. The countdown carries the
 * urgency: within a day it turns accent, so the next thing to watch stands out.
 */
export const UpNextRail = memo(function UpNextRail({ anime }: { anime: Anime[] }) {
  const t = useT();
  if (anime.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText variant="titleMedium" weight="700">
        {t('tabs.schedule.upNext.title')}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}>
        {anime.map((item) => (
          <UpNextCard key={item.id} anime={item} />
        ))}
      </ScrollView>
    </View>
  );
});

function UpNextCard({ anime }: { anime: Anime }) {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const next = anime.nextAiringEpisode;
  if (!next) return null;
  const countdown = airingCountdown(next.airingAt);
  const soon =
    countdown.unit !== 'days' && (countdown.unit !== 'hours' || countdown.value < SOON_HOURS);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={anime.title}
      onPressIn={() => prefetchAnimeDetail(anime)}
      onPress={() => {
        hapticsBridge.tap();
        pushAnimeDetail(router, anime);
      }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.background.secondary, opacity: pressed ? 0.85 : 1 },
      ]}>
      <ProgressiveImage
        source={{ uri: anime.image }}
        containerStyle={styles.poster}
        borderRadius={Radius.sm}
      />
      <View style={styles.body}>
        <AnimeTitleText
          anime={anime}
          numberOfLines={2}
          style={[Typography.caption, { color: theme.text.primary }]}
        />
        <ThemedText variant="captionSmall" tone="secondary">
          {t('tabs.schedule.upNext.episode', { episode: next.episode })}
        </ThemedText>
        <ThemedText
          variant="titleSmall"
          weight="700"
          style={{ color: soon ? theme.accent : theme.text.secondary }}>
          {t(`tabs.schedule.upNext.${countdown.unit}`, { count: countdown.value })}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.xs },
  rail: { gap: Spacing.sm, paddingRight: Spacing.screenPadding },
  card: {
    width: 208,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.xs,
    borderRadius: Radius.card,
  },
  poster: { width: 56, height: 78 },
  body: { flex: 1, gap: Spacing.xxs, justifyContent: 'center' },
});
