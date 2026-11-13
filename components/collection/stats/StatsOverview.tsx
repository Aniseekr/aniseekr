import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useT } from '../../../libs/i18n';
import { IconSize, Spacing } from '../../../constants/DesignSystem';
import { chartRamp, useTheme } from '../../../context/ThemeContext';
import { ThemedButton, ThemedText, Skeleton } from '../../themed';
import { EmptyStateView } from '../../common/EmptyStateView';
import { ErrorStateView } from '../../common/ErrorStateView';
import { StatsHeroCard } from './StatsHeroCard';
import { StatusDonutCard } from './StatusDonutCard';
import { MonthlyHoursBar } from './MonthlyHoursBar';
import { AchievementsGrid } from './AchievementsGrid';
import { ExhibitCard } from './ExhibitCard';
import { ScoreDistributionCard } from './ScoreDistributionCard';
import { PaywallSheet } from '../../subscription/PaywallSheet';
import { useSubscription } from '../../../context/SubscriptionContext';
import {
  loadUserAnimeRows,
  monthlyHours,
  scoreDistribution,
  ScoreBucket,
  summarize,
  StatsSummary,
} from '../../../libs/services/collection/stats-service';
import {
  achievementService,
  AchievementWithProgress,
} from '../../../libs/services/achievements/achievement-service';

interface Props {
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function StatsOverview({ emptyActionLabel, onEmptyAction }: Props) {
  const router = useRouter();
  const t = useT();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [monthly, setMonthly] = useState<ReturnType<typeof monthlyHours>>([]);
  const [scores, setScores] = useState<ScoreBucket[]>([]);
  const { isPro } = useSubscription();
  const [paywallVisible, setPaywallVisible] = useState(false);
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
        setScores(scoreDistribution(rows));
        setAchievements(ach);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : t('collectionUi.failedToLoadStats'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const year = new Date().getFullYear();

  // Status colours come from the theme's chart ramp (watching → dropped), so a
  // premium skin recolours the donut; free themes keep the old status colours.
  const { theme } = useTheme();
  const ramp = chartRamp(theme);
  const donutSlices = useMemo(() => {
    if (!summary) return [];
    return [
      { label: t('commonUi.watching'), value: summary.watching, color: ramp[0] },
      { label: t('commonUi.completed'), value: summary.completed, color: ramp[1] },
      { label: t('commonUi.plan'), value: summary.planned, color: ramp[2] },
      { label: t('collectionUi.onHold'), value: summary.onHold, color: ramp[3] },
      { label: t('commonUi.dropped'), value: summary.dropped, color: ramp[4] },
    ];
  }, [summary, t, ramp]);

  const monthlyHasData = useMemo(() => monthly.some((b) => b.hours > 0), [monthly]);

  const exhibits = useMemo(
    () => [
      {
        id: 'persona',
        title: t('collectionUi.animePersona'),
        subtitle: t('collectionUi.discoverYourViewingArchetype'),
        icon: 'psychology' as const,
        route: '/stats/persona',
        featured: true,
        minTotal: 3,
      },
      {
        id: 'year-in-review',
        title: t('collectionUi.yearInReview'),
        subtitle: t('collectionUi.yourWatchingYearRecapped'),
        icon: 'auto-stories' as const,
        route: '/stats/year-in-review',
        minTotal: 1,
      },
      {
        id: 'hall-of-fame',
        title: t('collectionUi.hallOfFame'),
        subtitle: t('collectionUi.trophiesMedallionsMilestones'),
        icon: 'emoji-events' as const,
        route: '/stats/hall-of-fame',
        minTotal: 0,
      },
      {
        id: 'top-picks',
        title: t('collectionUi.top10Picks'),
        subtitle: t('collectionUi.curatedByYourRatings'),
        icon: 'star-rate' as const,
        route: '/stats/top-picks',
        minTotal: 3,
      },
      {
        id: 'top-favorites',
        title: t('collectionUi.myTopFavorites'),
        subtitle: t('collectionUi.yourAllTimeFavorites'),
        icon: 'favorite' as const,
        route: '/stats/top-favorites',
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
        actionLabel={emptyActionLabel ?? t('collectionUi.browseAnime')}
        onAction={onEmptyAction ?? (() => router.push('/(rate)'))}
      />
    );
  }

  return (
    <>
      <StatsHeroCard
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

      <StatusDonutCard
        slices={donutSlices}
        total={summary.total}
        centerLabel={t('commonUi.anime')}
      />

      {monthlyHasData ? <MonthlyHoursBar data={monthly} year={year} /> : null}

      {summary.rated === 0 ? null : isPro ? (
        <ScoreDistributionCard title={t('collectionStats.scoreSpread.title')} data={scores} />
      ) : (
        <ThemedButton
          variant="secondary"
          size="md"
          fullWidth
          haptic="tap"
          label={t('collectionStats.scoreSpread.locked')}
          icon={
            <Ionicons name="lock-closed-outline" size={IconSize.sm} color={theme.text.secondary} />
          }
          onPress={() => setPaywallVisible(true)}
        />
      )}

      {achievements.length > 0 ? (
        <AchievementsGrid
          achievements={achievements}
          onPressViewAll={() => router.push('/stats/hall-of-fame')}
        />
      ) : null}

      <View style={styles.exhibitSection}>
        <ThemedText variant="titleLarge" weight="700">
          {t('collectionUi.exhibits')}
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
                    featured={e.featured}
                    onPress={() => router.push(e.route as never)}
                  />,
                ]
              : []
          )}
        </View>
      </View>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  exhibitSection: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  exhibitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.sm,
  },
});
