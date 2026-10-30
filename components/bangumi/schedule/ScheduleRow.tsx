import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { Anime } from '../../rate/types';
import { AnimeTitleText, ThemedIconButton, ThemedText } from '../../themed';
import { ProgressiveImage } from '../../common/ProgressiveImage';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { formatAiringClock } from '../../../libs/utils/airing';
import { prefetchAnimeDetail, pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { useIsAnimeScheduled } from '../../../modules/notifications/animeNotificationService';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';

export const ScheduleRow = memo(function ScheduleRow({
  anime,
  onLongPress,
  onBell,
}: {
  anime: Anime;
  onLongPress: (anime: Anime) => void;
  onBell: (anime: Anime, scheduled: boolean) => void;
}) {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const scheduled = useIsAnimeScheduled(anime.id);
  const next = anime.nextAiringEpisode;
  let relativeDay: string | null = null;
  if (next) {
    const airDate = new Date(next.airingAt * 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dateOnly = new Date(airDate);
    dateOnly.setHours(0, 0, 0, 0);
    relativeDay =
      dateOnly.getTime() === today.getTime()
        ? t('tabs.schedule.today')
        : dateOnly.getTime() === tomorrow.getTime()
          ? t('tabs.schedule.tomorrow')
          : `${airDate.getMonth() + 1}/${airDate.getDate()}`;
  }
  return (
    <View style={[styles.row, { borderBottomColor: theme.glassBorder }]}>
      <Pressable
        style={styles.main}
        accessibilityRole="button"
        accessibilityLabel={anime.title}
        onPressIn={() => prefetchAnimeDetail(anime)}
        onPress={() => {
          hapticsBridge.tap();
          pushAnimeDetail(router, anime);
        }}
        onLongPress={() => {
          hapticsBridge.selection();
          onLongPress(anime);
        }}>
        <ProgressiveImage
          source={{ uri: anime.image }}
          containerStyle={styles.poster}
          borderRadius={Radius.sm}
        />
        <View style={styles.body}>
          <AnimeTitleText
            anime={anime}
            numberOfLines={2}
            style={[Typography.titleMedium, { color: theme.text.primary }]}
          />
          <ThemedText variant="bodySmall" tone="secondary">
            {next
              ? t('tabs.schedule.episodeTime', {
                  episode: next.episode,
                  time: formatAiringClock(next.airingAt),
                })
              : t('tabs.schedule.undated')}
          </ThemedText>
          {relativeDay ? (
            <ThemedText variant="caption" tone="tertiary">
              {relativeDay}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
      <ThemedIconButton
        variant="ghost"
        haptic="selection"
        accessibilityLabel={t(scheduled ? 'tabs.schedule.cancelReminder' : 'tabs.schedule.follow')}
        onPress={() => onBell(anime, scheduled)}
        icon={(color) => (
          <MaterialIcons
            name={scheduled ? 'notifications-active' : 'notifications-none'}
            size={22}
            color={scheduled ? theme.accent : color}
          />
        )}
      />
    </View>
  );
});
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  poster: { width: 56, height: 78 },
  body: { flex: 1, gap: Spacing.xxs },
});
