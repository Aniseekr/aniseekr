import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing, Typography } from '../../../constants/DesignSystem';
import { CapsText, Halftone, ThemedSurface, ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import { formatScore, type YearRecap } from '../../../libs/services/collection/stats-service';

/** One year's recap. Also the image that gets shared, with `footer` as the mark. */
export function YearRecapCard({ recap, footer }: { recap: YearRecap; footer?: ReactNode }) {
  const { theme } = useTheme();
  const t = useT();
  const top = recap.topAnime;

  return (
    <ThemedSurface style={styles.card}>
      <Halftone color={theme.accent} />
      <CapsText style={[styles.caps, { color: theme.text.secondary }]}>
        {t('collectionStats.yearInReview.eyebrow')}
      </CapsText>
      <ThemedText style={styles.title}>
        {t('collectionStats.yearInReview.heroTitle', { year: recap.year })}
      </ThemedText>

      <View style={styles.stats}>
        <Stat label={t('collectionStats.yearInReview.statShows')} value={String(recap.shows)} />
        {recap.hours > 0 ? (
          <Stat label={t('collectionStats.yearInReview.statHours')} value={String(recap.hours)} />
        ) : null}
        {recap.longestStreak > 1 ? (
          <Stat
            label={t('collectionStats.yearInReview.statLongestStreak')}
            value={t('collectionStats.yearInReview.daysShort', { count: recap.longestStreak })}
          />
        ) : null}
      </View>

      {top ? (
        <View style={[styles.top, { borderTopColor: theme.glassBorder }]}>
          <CapsText style={[styles.caps, { color: theme.text.secondary }]}>
            {t('collectionStats.yearInReview.topAnimeBadge')}
          </CapsText>
          <ThemedText variant="titleLarge" weight="800" numberOfLines={2}>
            {top.title || t('collectionStats.yearInReview.untitled')}
          </ThemedText>
          <View style={styles.meta}>
            {top.episodes > 0 ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('collectionStats.yearInReview.epsShort', { count: top.episodes })}
              </ThemedText>
            ) : null}
            {top.score ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('collectionStats.yearInReview.scoreLabel', { score: formatScore(top.score) })}
              </ThemedText>
            ) : null}
          </View>
        </View>
      ) : null}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </ThemedSurface>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText variant="captionSmall" tone="secondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  caps: {
    ...Typography.captionSmall,
    fontWeight: '700',
  },
  title: {
    ...Typography.displayLarge,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.sm,
  },
  stat: {
    gap: Spacing.xxs,
  },
  statValue: {
    ...Typography.headlineMedium,
    fontWeight: '800',
  },
  top: {
    borderTopWidth: 1,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.xxs,
  },
  meta: {
    flexDirection: 'row',
    gap: Spacing.xxs,
  },
  footer: {
    alignItems: 'flex-end',
    marginTop: Spacing.sm,
  },
});
