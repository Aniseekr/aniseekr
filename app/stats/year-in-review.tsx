import { useEffect, useMemo, useState } from 'react';
import { ThemedText, Skeleton } from '../../components/themed';
import { EmptyStateView } from '../../components/common/EmptyStateView';
import { StatsExhibitFrame } from '../../components/collection/stats/StatsExhibitFrame';
import { MonthlyHoursBar } from '../../components/collection/stats/MonthlyHoursBar';
import { YearRecapCard } from '../../components/collection/stats/YearRecapCard';
import { StatsShareSheet } from '../../components/collection/stats/StatsShareSheet';
import { ProOptionChips } from '../../components/pilgrimage/ProOptionChips';
import { PaywallSheet } from '../../components/subscription/PaywallSheet';
import { useSubscription } from '../../context/SubscriptionContext';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import {
  loadUserAnimeRows,
  yearRecap,
  yearsWithCompletions,
  type UserAnimeRow,
} from '../../libs/services/collection/stats-service';

function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '±0';
}

export default function YearInReviewExhibit() {
  const { theme } = useTheme();
  const t = useT();
  const { isPro } = useSubscription();
  const [currentYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<UserAnimeRow[] | null>(null);
  const [pickedYear, setPickedYear] = useState(String(currentYear));
  const [shareVisible, setShareVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadUserAnimeRows()
      .then((loaded) => {
        if (!cancelled) setRows(loaded);
      })
      .catch((error) => {
        console.warn('[year-in-review] load failed', error);
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Past years are Pro; without it the screen always shows this year.
  const year = isPro ? Number(pickedYear) : currentYear;
  const recap = useMemo(() => (rows ? yearRecap(rows, year) : null), [rows, year]);
  const previous = useMemo(
    () => (rows && isPro ? yearRecap(rows, year - 1) : null),
    [rows, isPro, year]
  );
  const yearOptions = useMemo(() => {
    const years = new Set([currentYear, ...(rows ? yearsWithCompletions(rows) : [])]);
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ id: String(y), label: String(y), pro: y !== currentYear }));
  }, [rows, currentYear]);

  const title = t('collectionStats.yearInReview.title');

  if (!recap) {
    return (
      <StatsExhibitFrame title={title}>
        <Skeleton.StatsDashboard />
      </StatsExhibitFrame>
    );
  }

  const hasData = recap.shows > 0;

  return (
    <StatsExhibitFrame title={title} onShare={hasData ? () => setShareVisible(true) : undefined}>
      {yearOptions.length > 1 ? (
        <ProOptionChips
          options={yearOptions}
          value={String(year)}
          isPro={isPro}
          accent={theme.accent}
          onChange={setPickedYear}
          onLocked={() => setPaywallVisible(true)}
          accessibilityLabel={(o) => o.label}
        />
      ) : null}

      {hasData ? (
        <>
          <YearRecapCard recap={recap} />
          {previous && previous.shows > 0 ? (
            <ThemedText variant="caption" tone="secondary">
              {t('collectionStats.yearInReview.vsYear', {
                year: previous.year,
                shows: signed(recap.shows - previous.shows),
                hours: signed(recap.hours - previous.hours),
              })}
            </ThemedText>
          ) : null}
          {recap.monthly.some((b) => b.hours > 0) ? (
            <MonthlyHoursBar
              data={recap.monthly}
              year={year}
              title={t('collectionStats.yearInReview.monthlyTitle')}
            />
          ) : null}
        </>
      ) : (
        <EmptyStateView
          icon="auto-stories"
          title={t('collectionStats.yearInReview.emptyTitle', { year })}
          description={t('collectionStats.yearInReview.emptyBody')}
        />
      )}

      <StatsShareSheet visible={shareVisible} onClose={() => setShareVisible(false)}>
        {(mark) => <YearRecapCard recap={recap} footer={mark} />}
      </StatsShareSheet>
      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </StatsExhibitFrame>
  );
}
