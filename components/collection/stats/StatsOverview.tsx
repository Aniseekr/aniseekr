import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '../../../libs/i18n';
import { Spacing } from '../../../constants/DesignSystem';
import { ThemedText, Skeleton } from '../../themed';
import { EmptyStateView } from '../../common/EmptyStateView';
import { ErrorStateView } from '../../common/ErrorStateView';
import { StatsHeroCard } from './StatsHeroCard';
import { StatusDonutCard } from './StatusDonutCard';
import { MonthlyHoursBar } from './MonthlyHoursBar';
import { AchievementsGrid } from './AchievementsGrid';
import { ExhibitCard } from './ExhibitCard';
import {
  loadUserAnimeRows,
  monthlyHours,
  summarize,
  StatsSummary,
} from '../../../libs/services/collection/stats-service';
import {
  achievementService,
  AchievementWithProgress,
} from '../../../libs/services/achievements/achievement-service';

const STATUS_COLORS = {
  watching: '#30D158',
  completed: '#0A84FF',
  planned: '#5E5CE6',
  dropped: '#FF453A',
  onHold: '#FF9F0A',
} as const;

interface Props {
  /**
   * Bucket label derived from total-count thresholds. Not a real percentile —
   * keep `false` unless the surface intentionally mirrors the legacy hero card.
   */
  showThresholdHighlight?: boolean;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function StatsOverview({
  showThresholdHighlight = false,
  emptyActionLabel,
  onEmptyAction,
}: Props) {
  const router = useRouter();
  const t = useT();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [monthly, setMonthly] = useState<ReturnType<typeof monthlyHours>>([]);
  const [achievements, setAchievements] = useState<AchievementWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [rows, ach] = await Promise.all([loadUserAnimeRows(), achievementService.list()]);
        if (cancelled) return;
        const s = summarize(rows);
        setSummary(s);
        setMonthly(monthlyHours(rows));
        setAchievements(ach);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('collectionUi.failedToLoadStats'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const year = new Date().getFullYear();
  const heroBadge = `Year in review · ${year}`;

  const heroHighlight = useMemo(() => {
    if (!showThresholdHighlight || !summary) return undefined;
    if (summary.total >= 200) return 'Top 5%';
    if (summary.total >= 100) return 'Top 10%';
    if (summary.total >= 50) return 'Top 25%';
    return undefined;
  }, [summary, showThresholdHighlight]);

  const donutSlices = useMemo(() => {
    if (!summary) return [];
    return [
      { label: t('commonUi.watching'), value: summary.watching, color: STATUS_COLORS.watching },
      { label: t('commonUi.completed'), value: summary.completed, color: STATUS_COLORS.completed },
      { label: t('commonUi.plan'), value: summary.planned, color: STATUS_COLORS.planned },
      { label: t('collectionUi.onHold'), value: summary.onHold, color: STATUS_COLORS.onHold },
      { label: t('commonUi.dropped'), value: summary.dropped, color: STATUS_COLORS.dropped },
    ];
  }, [summary, t]);

  const monthlyHasData = useMemo(() => monthly.some((b) => b.hours > 0), [monthly]);

  const exhibits = useMemo(
    () => [
      {
        id: 'persona',
        title: t('collectionUi.animePersona'),
        subtitle: t('collectionUi.discoverYourViewingArchetype'),
        icon: 'auto-awesome' as const,
        gradientFrom: '#7C5BFF',
        gradientTo: '#21D4FD',
        route: '/collection/stats/persona',
        featured: true,
        minTotal: 3,
      },
      {
        id: 'year-in-review',
        title: t('collectionUi.yearInReview'),
        subtitle: t('collectionUi.yourWatchingYearRecapped'),
        icon: 'auto-stories' as const,
        gradientFrom: '#FF6CAB',
        gradientTo: '#FF8E1E',
        route: '/collection/stats/year-in-review',
        minTotal: 1,
      },
      {
        id: 'hall-of-fame',
        title: t('collectionUi.hallOfFame'),
        subtitle: t('collectionUi.trophiesMedallionsMilestones'),
        icon: 'emoji-events' as const,
        gradientFrom: '#F2994A',
        gradientTo: '#F2C94C',
        route: '/collection/stats/hall-of-fame',
        minTotal: 0,
      },
      {
        id: 'top-picks',
        title: t('collectionUi.top10Picks'),
        subtitle: t('collectionUi.curatedByYourRatings'),
        icon: 'star-rate' as const,
        gradientFrom: '#0F2027',
        gradientTo: '#2C5364',
        route: '/collection/stats/top-picks',
        minTotal: 3,
      },
      {
        id: 'top-favorites',
        title: t('collectionUi.myTopFavorites'),
        subtitle: 'Why your #1 still hits',
        icon: 'favorite' as const,
        gradientFrom: '#FF5C8A',
        gradientTo: '#7C5BFF',
        route: '/collection/stats/top-favorites',
        minTotal: 1,
      },
    ],
    [t]
  );

  if (loading) return <Skeleton.StatsDashboard />;

  if (error) return <ErrorStateView title={t('collectionUi.couldnTLoadStats')} message={error} />;

  if (!summary || summary.total === 0) {
    return (
      <EmptyStateView
        icon="bar-chart"
        title={t('collectionUi.noStatsYet')}
        description={t('collectionUi.startAddingAnimeToYour')}
        actionLabel={emptyActionLabel ?? 'Browse anime'}
        onAction={onEmptyAction ?? (() => router.push('/(rate)'))}
      />
    );
  }

  return (
    <>
      <StatsHeroCard
        badge={heroBadge}
        highlight={heroHighlight}
        values={[
          {
            label: t('collectionUi.watchHoursEst'),
            value: summary.watchHoursEst > 0 ? String(summary.watchHoursEst) : '—',
            hidden: summary.episodesWatched === 0,
          },
          {
            label: t('commonUi.anime'),
            value: String(summary.total),
          },
          {
            label: t('collectionUi.avgScore'),
            value: summary.avgScore > 0 ? summary.avgScore.toFixed(1) : '—',
            hidden: summary.rated === 0,
          },
        ]}
      />

      <View style={styles.row}>
        <View style={styles.flex1}>
          <StatusDonutCard slices={donutSlices} total={summary.total} centerLabel="anime" />
        </View>
      </View>

      {monthlyHasData ? <MonthlyHoursBar data={monthly} year={year} /> : null}

      {achievements.length > 0 ? (
        <AchievementsGrid
          achievements={achievements}
          onPressViewAll={() => router.push('/collection/stats/hall-of-fame')}
        />
      ) : null}

      <View style={styles.exhibitSection}>
        <ThemedText variant="titleLarge" weight="700">
          {t('collectionUi.exhibits')}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary">
          {t('collectionUi.tapIntoAnyExhibitTo')}
        </ThemedText>
        <View style={styles.exhibitGrid}>
          {exhibits.flatMap((e) =>
            summary.total >= e.minTotal
              ? [
                  <ExhibitCard
                    key={e.id}
                    title={e.title}
                    subtitle={e.subtitle}
                    icon={e.icon}
                    gradientFrom={e.gradientFrom}
                    gradientTo={e.gradientTo}
                    featured={e.featured}
                    onPress={() => router.push(e.route as never)}
                  />,
                ]
              : []
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  flex1: { flex: 1 },
  exhibitSection: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  exhibitGrid: {
    gap: Spacing.sm,
  },
});
