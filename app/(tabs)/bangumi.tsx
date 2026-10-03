import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  Skeleton,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
} from '../../components/themed';
import { WeekStrip } from '../../components/bangumi/schedule/WeekStrip';
import { ScheduleSegments } from '../../components/bangumi/schedule/ScheduleSegments';
import { ScheduleRow } from '../../components/bangumi/schedule/ScheduleRow';
import { ScheduleMenu, type ScheduleTool } from '../../components/bangumi/schedule/ScheduleMenu';
import { SpecialContentSection } from '../../components/bangumi/SpecialContentSection';
import { YearPickerSheet } from '../../components/bangumi/YearPickerSheet';
import { BangumiSettingsSheet } from '../../components/bangumi/BangumiSettingsSheet';
import { NotificationManagerSheet } from '../../components/bangumi/NotificationManagerSheet';
import { AddTrackingSheet } from '../../components/bangumi/AddTrackingSheet';
import { BangumiActionSnackbar } from '../../components/bangumi/BangumiActionSnackbar';
import { ScheduleDeck } from '../../components/bangumi/schedule/ScheduleDeck';
import { ShareScheduleCard } from '../../components/bangumi/ShareScheduleCard';
import { shareSchedule } from '../../components/bangumi/shareSchedule';
import type { Anime } from '../../components/rate/types';
import { useSeasonSchedule } from '../../hooks/useSeasonSchedule';
import { useSchedulePreferences } from '../../hooks/useSchedulePreferences';
import { useScheduleActions } from '../../hooks/useScheduleActions';
import {
  groupAnimeByWeekday,
  matchesTypeFilter,
  splitSpecialAnime,
} from '../../libs/services/bangumi/schedule';
import { getBroadcastSeason } from '../../libs/utils/season-utils';
import { animeNotificationService } from '../../modules/notifications/animeNotificationService';
import { bottomPad, Spacing, TabBar } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';

const SEASON_KEYS = {
  WINTER: 'rate.winter',
  SPRING: 'rate.spring',
  SUMMER: 'rate.summer',
  FALL: 'rate.fall',
} as const;
const SHARE_DAYS = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];
type Sheet = 'season' | 'menu' | 'settings' | 'notifications' | { anime: Anime } | null;
type Segment = 'tracking' | 'season';

export default function BangumiScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ segment?: string }>();
  const router = useRouter();
  const [selection, setSelection] = useState(getBroadcastSeason);
  const [day, setDay] = useState(() => new Date().getDay());
  const [segmentChoice, setSegmentChoice] = useState<Segment | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [deckAnime, setDeckAnime] = useState<Anime[] | null>(null);
  const [sharing, setSharing] = useState(false);
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shareRef = useRef<View>(null);
  const deckOpen = deckAnime !== null;
  const {
    prefs,
    adult,
    trackedIds,
    trackingReady,
    trackingError,
    retryTracking,
    setPrefs,
    setAdult,
  } = useSchedulePreferences();
  const schedule = useSeasonSchedule(selection.season, selection.year, adult);
  const actions = useScheduleActions(
    selection.season,
    selection.year,
    prefs.notificationsEnabled,
    () => setSheet('notifications')
  );
  const seasonAnime = useMemo(
    () => schedule.rawAnime.filter((anime) => matchesTypeFilter(anime, prefs.typeFilter)),
    [schedule.rawAnime, prefs.typeFilter]
  );
  const trackedCount = schedule.rawAnime.filter((anime) => trackedIds.has(anime.id)).length;
  const segment =
    params.segment === 'season'
      ? 'season'
      : (segmentChoice ?? (trackedCount > 0 ? 'tracking' : 'season'));
  const visibleAnime =
    segment === 'tracking' ? seasonAnime.filter((anime) => trackedIds.has(anime.id)) : seasonAnime;
  const { regular, special } = splitSpecialAnime(visibleAnime);
  const grouped = groupAnimeByWeekday(
    prefs.typeFilter === 'all' && segment === 'season' ? regular : visibleAnime
  );
  const dayAnime = grouped[day];
  const untriaged = seasonAnime.filter(
    (anime) => !trackedIds.has(anime.id) && !actions.skips.has(anime.id)
  );
  const seasonLabel = t('tabs.schedule.seasonYear', {
    year: selection.year,
    season: t(SEASON_KEYS[selection.season]),
  });
  const shareGroups = useMemo(() => {
    const groups = groupAnimeByWeekday(seasonAnime);
    return [
      ...SHARE_DAYS.map((dayName, weekday) => ({ day: dayName, anime: groups[weekday] })),
      { day: 'Unknown', anime: groups.unknown },
    ];
  }, [seasonAnime]);

  useFocusEffect(
    useCallback(() => {
      if (params.segment === 'season') {
        setSegmentChoice('season');
        router.setParams({ segment: undefined });
      }
      // Hydrate the bell mirror without requesting OS permission.
      void animeNotificationService
        .init()
        .catch((error) => console.warn('[schedule] notification hydration failed', error));
    }, [params.segment, router])
  );
  useEffect(
    () => () => {
      if (menuTimer.current) clearTimeout(menuTimer.current);
    },
    []
  );

  useEffect(() => {
    if (
      params.segment !== 'season' &&
      segmentChoice === null &&
      schedule.status === 'ready' &&
      trackingReady
    ) {
      setSegmentChoice(trackedCount > 0 ? 'tracking' : 'season');
    }
  }, [params.segment, segmentChoice, schedule.status, trackingReady, trackedCount]);

  const openDeck = () => {
    if (trackingReady && schedule.status !== 'loading') setDeckAnime(untriaged);
  };
  const openTool = (tool: ScheduleTool) => {
    setSheet(null);
    menuTimer.current = setTimeout(() => {
      if (tool === 'deck') openDeck();
      else if (tool === 'share') void handleShare();
      else setSheet(tool);
    }, 280);
  };
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await shareSchedule({
        seasonLabel,
        groupedAnime: shareGroups,
        totalCount: seasonAnime.length,
        viewRef: shareRef,
      });
    } catch (error) {
      console.warn('[schedule] share failed', error);
      actions.notify(t('tabs.schedule.shareFailed'), 'error-outline');
    } finally {
      setSharing(false);
    }
  };
  const restoreSkipped = () => {
    actions.restoreSkipped();
    if (deckOpen) setDeckAnime(seasonAnime.filter((anime) => !trackedIds.has(anime.id)));
  };
  const renderRows = (list: Anime[]) =>
    list.map((anime) => (
      <ScheduleRow
        key={anime.id}
        anime={anime}
        onLongPress={(target) => setSheet({ anime: target })}
        onBell={(target, scheduled) => {
          void actions.handleBell(target, scheduled);
        }}
      />
    ));

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.background.primary }]}>
      {deckOpen ? (
        <ScheduleDeck
          anime={deckAnime}
          deckKey={`${selection.season}-${selection.year}-${prefs.typeFilter}-${actions.skipEpoch}`}
          onClose={() => setDeckAnime(null)}
          onSkip={actions.handleSkip}
          onWant={(anime) => {
            void actions.handleWant(anime);
          }}
          skippedCount={actions.skips.size}
          onRestore={restoreSkipped}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottomPad(insets) + TabBar.height },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={schedule.refreshing}
              onRefresh={() => {
                void schedule.refresh();
              }}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }>
          <View style={styles.header}>
            <ThemedText variant="headlineLarge" weight="700" style={styles.grow}>
              {t('tabs.bangumi')}
            </ThemedText>
            <ThemedButton
              size="sm"
              variant="secondary"
              label={seasonLabel}
              iconRight={
                <MaterialIcons name="keyboard-arrow-down" size={14} color={theme.text.primary} />
              }
              onPress={() => setSheet('season')}
            />
            <ThemedIconButton
              variant="ghost"
              accessibilityLabel={t('tabs.schedule.options')}
              onPress={() => setSheet('menu')}
              icon={(color) => <MaterialIcons name="more-horiz" size={24} color={color} />}
            />
          </View>
          <View style={styles.section}>
            <WeekStrip selected={day} onSelect={setDay} />
            <ScheduleSegments
              selected={segment}
              onSelect={setSegmentChoice}
              trackedCount={trackingReady && schedule.status !== 'loading' ? trackedCount : null}
              seasonCount={schedule.status !== 'loading' ? seasonAnime.length : null}
            />
          </View>
          <View style={styles.section}>
            {schedule.status === 'error' || trackingError ? (
              <ThemedSurface padded style={styles.section}>
                <ThemedText tone="secondary">
                  {t(
                    trackingError
                      ? 'tabs.schedule.trackingFailed'
                      : 'tabs.bangumiScreen.errorLoadFailed'
                  )}
                </ThemedText>
                <ThemedButton
                  label={t('common.retry')}
                  onPress={() => {
                    if (trackingError) retryTracking();
                    else void schedule.refresh();
                  }}
                />
              </ThemedSurface>
            ) : null}
            {(schedule.status === 'loading' && schedule.rawAnime.length === 0) ||
            (!trackingReady && !trackingError && segment === 'tracking') ? (
              <Skeleton.ListRow count={5} avatarSize={56} avatarShape="square" />
            ) : dayAnime.length ? (
              renderRows(dayAnime)
            ) : schedule.status === 'error' || trackingError ? null : (
              <View style={styles.section}>
                <ThemedText tone="secondary">
                  {t(
                    segment === 'tracking'
                      ? 'tabs.schedule.emptyTracking'
                      : 'tabs.schedule.emptySeason'
                  )}
                </ThemedText>
                {segment === 'tracking' ? (
                  <ThemedButton
                    variant="ghost"
                    label={t('tabs.schedule.showSeason')}
                    onPress={() => setSegmentChoice('season')}
                  />
                ) : null}
              </View>
            )}
            {segment === 'season' && prefs.showUnknownDays && grouped.unknown.length > 0 ? (
              <View>
                <ThemedText variant="titleMedium" weight="700">
                  {t('tabs.schedule.undated')}
                </ThemedText>
                {renderRows(grouped.unknown)}
              </View>
            ) : null}
            {segment === 'season' && prefs.typeFilter === 'all' && special.length > 0 ? (
              <SpecialContentSection
                title={t('tabs.bangumiScreen.movieAndSpecialsTitle')}
                anime={special}
              />
            ) : null}
          </View>
          {trackingReady && schedule.status === 'ready' && untriaged.length > 0 ? (
            <ThemedSurface padded style={styles.section}>
              <ThemedText variant="titleLarge" weight="700">
                {t('tabs.schedule.triageTitle')}
              </ThemedText>
              <ThemedButton
                label={t('tabs.schedule.triageAction', { count: untriaged.length })}
                onPress={openDeck}
              />
            </ThemedSurface>
          ) : null}
        </ScrollView>
      )}
      {sheet === 'menu' ? (
        <ScheduleMenu
          onClose={() => setSheet(null)}
          onSelect={openTool}
          deckEnabled={trackingReady && schedule.status === 'ready'}
          shareEnabled={!sharing && schedule.status === 'ready'}
        />
      ) : null}
      {sheet === 'season' ? (
        <YearPickerSheet
          visible
          selectedYear={selection.year}
          selectedSeason={selection.season}
          onClose={() => setSheet(null)}
          onSelect={(year) => setSelection((previous) => ({ ...previous, year }))}
          onSeasonSelect={(season) => setSelection((previous) => ({ ...previous, season }))}
          onPrevYear={() => setSelection((previous) => ({ ...previous, year: previous.year - 1 }))}
          onNextYear={() => setSelection((previous) => ({ ...previous, year: previous.year + 1 }))}
        />
      ) : null}
      {sheet === 'settings' ? (
        <BangumiSettingsSheet
          visible
          preferences={prefs}
          adultContent={adult}
          onAdultContentChange={setAdult}
          onClose={() => setSheet(null)}
          onChange={setPrefs}
          skippedCount={actions.skips.size}
          onRestoreSkipped={restoreSkipped}
        />
      ) : null}
      {sheet === 'notifications' ? (
        <NotificationManagerSheet visible onClose={() => setSheet(null)} />
      ) : null}
      {sheet && typeof sheet === 'object' ? (
        <AddTrackingSheet visible anime={sheet.anime} onClose={() => setSheet(null)} />
      ) : null}
      <BangumiActionSnackbar
        key={actions.snackbar?.key ?? 'none'}
        visible={!!actions.snackbar}
        message={actions.snackbar?.message ?? ''}
        icon={actions.snackbar?.icon}
        actionLabel={actions.snackbar?.actionLabel}
        onAction={actions.snackbar?.onAction}
        onDismiss={actions.dismissSnackbar}
        bottomOffset={deckOpen ? bottomPad(insets) : bottomPad(insets) + TabBar.height + Spacing.sm}
      />
      {sharing ? (
        <View pointerEvents="none" style={styles.offscreen}>
          <ShareScheduleCard
            ref={shareRef}
            seasonLabel={seasonLabel}
            groupedAnime={shareGroups}
            totalCount={seasonAnime.length}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  grow: { flex: 1 },
  content: { paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.md, gap: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  section: { gap: Spacing.sm },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
});
