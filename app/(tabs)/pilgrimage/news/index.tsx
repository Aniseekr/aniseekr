import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';

import { NewsArticleRow } from '../../../../components/news/NewsArticleRow';
import { ModeSelector } from '../../../../components/rate/ModeSelector';
import { LocalityAttributionFooter } from '../../../../components/pilgrimage/common/LocalityAttributionFooter';
import {
  LOCALITY_CARD_RADIUS,
  LOCALITY_INNER_RADIUS,
  LocalityCardDecor,
  LocalityMiniStamp,
  localityCategoryIcon,
  localityEventAccent,
} from '../../../../components/pilgrimage/common/LocalityAesthetic';
import {
  formatCalendarDate,
  LocalityEventCalendar,
  type LocalityCalendarEventRow,
} from '../../../../components/pilgrimage/LocalityEventCalendar';
import { EventStateChip } from '../../../../components/pilgrimage/detail/IntelEventBanner';
import {
  deriveEventDateBlock,
  type EventDateBlock,
} from '../../../../components/pilgrimage/event-date-block';
import {
  readableTextOn,
  Skeleton,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
  TranslatedText,
} from '../../../../components/themed';
import { Radius, Shadow, Spacing } from '../../../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../../../context/ThemeContext';
import { useNewsStream } from '../../../../hooks/useNewsStream';
import { useI18n, useT, type TranslationKey } from '../../../../libs/i18n';
import { getNewsSource } from '../../../../libs/services/news/news-sources';
import { bannerEnter, listItemEnter } from '../../../../libs/animations/presets';
import { formatNewsRelativeTime } from '../../../../libs/services/news/news-relative-time';
import { isSafeArticleUrl } from '../../../../libs/services/news/news-url';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import {
  getIndexedById,
  type AnitabiIndexEntry,
} from '../../../../libs/services/pilgrimage/anitabi-index';
import { resolveLocalIntelText } from '../../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import { getLocalityEventListRows } from '../../../../libs/services/pilgrimage/locality/event-detail';
import {
  mapLocalityEventRowsByDay,
  type LocalityCalendarMonth,
} from '../../../../libs/services/pilgrimage/locality/event-calendar';
import { localityRepository } from '../../../../libs/services/pilgrimage/locality/locality-repository';
import type {
  EventCategory,
  IsoDate,
  LocalityEvent,
} from '../../../../libs/services/pilgrimage/locality/types';
import { getPilgrimageAnimeTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageEventDetailRoute } from '../../../../libs/services/pilgrimage/pilgrimage-navigation';

type HubTab = 'event' | 'tag' | 'calendar' | 'news';

interface EventRow extends LocalityCalendarEventRow {
  animeTitle: string | null;
  bangumiId: number | null;
}

interface WorkFilter {
  bangumiId: number;
  title: string;
  cover: string | null;
}

interface CalendarViewState {
  month: LocalityCalendarMonth;
  selectedDate: IsoDate;
}

function subscribeLocality(listener: () => void): () => void {
  return localityRepository.subscribe(listener);
}

function getLocalitySnapshot() {
  return localityRepository.getSnapshot();
}

export default function LocalityHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  const [activeTab, setActiveTab] = useState<HubTab>('event');
  const { snapshot, loading, refreshing, error, refresh } = useNewsStream({
    enabled: activeTab === 'news',
  });
  const [selectedBangumiId, setSelectedBangumiId] = useState<number | null>(null);
  const localitySnapshot = useSyncExternalStore(
    subscribeLocality,
    getLocalitySnapshot,
    getLocalitySnapshot
  );
  const [now] = useState(() => new Date());
  const today = useMemo(() => toLocalIsoDate(now), [now]);
  const [calendarView, setCalendarView] = useState<CalendarViewState>(() => ({
    month: { year: now.getFullYear(), month: now.getMonth() + 1 },
    selectedDate: toLocalIsoDate(now),
  }));

  const tabs = useMemo(
    () => [
      { value: 'event' as const, label: t('news.tabs.event'), icon: 'calendar-outline' as const },
      { value: 'tag' as const, label: t('news.tabs.tag'), icon: 'pricetag-outline' as const },
      {
        value: 'calendar' as const,
        label: t('news.tabs.calendar'),
        icon: 'calendar-number-outline' as const,
      },
      { value: 'news' as const, label: t('news.tabs.news'), icon: 'newspaper-outline' as const },
    ],
    [t]
  );

  const eventRows = useMemo<EventRow[]>(() => {
    void localitySnapshot;
    return getLocalityEventListRows(now, localityRepository).map((item) => {
      const bangumiId = item.event.animeIds.find((id) => getIndexedById(id) !== null) ?? null;
      const indexed = bangumiId !== null ? getIndexedById(bangumiId) : null;
      return {
        ...item,
        bangumiId,
        cover: indexed?.cover ?? null,
        animeTitle: indexed ? getPilgrimageAnimeTitles(indexed).primary : null,
        accent: localityEventAccent(item.state, item.event.category, theme),
      };
    });
  }, [now, localitySnapshot, theme]);

  const workFilters = useMemo<WorkFilter[]>(() => {
    const byId = new Map<number, AnitabiIndexEntry>();
    for (const row of eventRows) {
      for (const bangumiId of row.event.animeIds) {
        const indexed = getIndexedById(bangumiId);
        if (indexed) byId.set(bangumiId, indexed);
      }
    }
    return [...byId.values()]
      .map((anime) => ({
        bangumiId: anime.id,
        title: getPilgrimageAnimeTitles(anime).primary,
        cover: anime.cover || null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [eventRows]);

  const taggedEventRows = useMemo(() => {
    if (selectedBangumiId === null) return eventRows;
    return eventRows.filter((row) => row.event.animeIds.includes(selectedBangumiId));
  }, [eventRows, selectedBangumiId]);

  const calendarRowsByDay = useMemo(
    () => mapLocalityEventRowsByDay(eventRows, calendarView.month),
    [calendarView.month, eventRows]
  );
  const selectedCalendarRows = calendarRowsByDay.get(calendarView.selectedDate) ?? [];
  const selectedCalendarLabel = useMemo(
    () => formatCalendarDate(calendarView.selectedDate, language),
    [calendarView.selectedDate, language]
  );
  const unplacedEventCount = useMemo(
    () =>
      eventRows.filter(
        (row) =>
          row.state.state === 'unannounced' ||
          (row.state.state === 'active' && row.state.occurrence === null)
      ).length,
    [eventRows]
  );

  const moveCalendarMonth = useCallback((offset: number) => {
    setCalendarView((current) => {
      const month = shiftCalendarMonth(current.month, offset);
      return {
        month,
        selectedDate: moveDateIntoMonth(current.selectedDate, month),
      };
    });
  }, []);

  const selectCalendarDate = useCallback((date: IsoDate) => {
    setCalendarView((current) => ({ ...current, selectedDate: date }));
  }, []);

  const returnCalendarToToday = useCallback(() => {
    setCalendarView({
      month: { year: now.getFullYear(), month: now.getMonth() + 1 },
      selectedDate: today,
    });
  }, [now, today]);

  const relativeTime = useCallback(
    (publishedAt: number) => formatNewsRelativeTime(publishedAt, t),
    [t]
  );

  const openEvent = useCallback(
    (row: EventRow) => {
      hapticsBridge.tap();
      const name = resolveLocalIntelText(row.event.name, language).value;
      router.push(
        buildPilgrimageEventDetailRoute(row.event.id, {
          name,
          animeTitle: row.animeTitle,
          poster: row.cover,
        })
      );
    },
    [language, router]
  );

  const openArticle = useCallback(
    async (url: string) => {
      if (!isSafeArticleUrl(url)) {
        Alert.alert(t('news.openArticleFailed'), t('news.invalidArticleUrl'));
        return;
      }
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) {
          Alert.alert(t('news.openArticleFailed'), t('news.invalidArticleUrl'));
          return;
        }
        await Linking.openURL(url);
      } catch {
        Alert.alert(t('news.openArticleFailed'), t('news.invalidArticleUrl'));
      }
    },
    [t]
  );

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: theme.background.primary }]}
      edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <ThemedIconButton
          accessibilityLabel={t('common.back')}
          variant="ghost"
          icon={(color) => <Ionicons name="chevron-back" size={20} color={color} />}
          onPress={() => router.back()}
        />
        <View style={styles.headerText}>
          <ThemedText variant="titleLarge" weight="800">
            {t('news.title')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary">
            {t('news.subtitle')}
          </ThemedText>
        </View>
        <ThemedIconButton
          accessibilityLabel={activeTab === 'news' ? t('news.manageSources') : t('news.openMap')}
          variant="glass"
          icon={(color) => (
            <Ionicons
              name={activeTab === 'news' ? 'options-outline' : 'map-outline'}
              size={18}
              color={color}
            />
          )}
          onPress={() =>
            router.push(activeTab === 'news' ? '/pilgrimage/news/sources' : '/pilgrimage/map')
          }
        />
      </View>

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={
          activeTab === 'news' ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={bannerEnter()}>
          <ThemedSurface padded={Spacing.xs} radius={LOCALITY_CARD_RADIUS} style={styles.tabFrame}>
            <LocalityCardDecor accent={theme.accent} tape="center" />
            <ModeSelector
              options={tabs}
              value={activeTab}
              onChange={setActiveTab}
              compact
              horizontalMargin={Spacing.screenPadding + Spacing.xs}
            />
          </ThemedSurface>
        </Animated.View>

        {activeTab === 'event' ? (
          <EventList
            rows={eventRows}
            emptyTitle={t('news.events.emptyTitle')}
            emptyBody={t('news.events.emptyBody')}
            onOpen={openEvent}
          />
        ) : null}

        {activeTab === 'tag' ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}>
              <ThemedButton
                label={t('news.tags.allWorks')}
                variant={selectedBangumiId === null ? 'primary' : 'secondary'}
                size="sm"
                icon={
                  <Ionicons
                    name="sparkles-outline"
                    size={15}
                    color={
                      selectedBangumiId === null
                        ? readableTextOn(theme.accent)
                        : theme.text.secondary
                    }
                  />
                }
                onPress={() => setSelectedBangumiId(null)}
                haptic="selection"
              />
              {workFilters.map((work) => (
                <ThemedButton
                  key={work.bangumiId}
                  label={work.title}
                  variant={selectedBangumiId === work.bangumiId ? 'primary' : 'secondary'}
                  size="sm"
                  icon={
                    <LocalityMiniStamp
                      accent={theme.accent}
                      imageUri={work.cover}
                      icon="sparkles-outline"
                      size="sm"
                    />
                  }
                  onPress={() => setSelectedBangumiId(work.bangumiId)}
                  haptic="selection"
                />
              ))}
            </ScrollView>
            <ThemedSurface
              variant="outlined"
              padded
              radius={LOCALITY_INNER_RADIUS}
              style={styles.tagNote}>
              <LocalityCardDecor accent={theme.secondary} tape="none" />
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('news.tags.scopeNote')}
              </ThemedText>
            </ThemedSurface>
            <EventList
              rows={taggedEventRows}
              emptyTitle={t('news.tags.emptyTitle')}
              emptyBody={t('news.tags.emptyBody')}
              onOpen={openEvent}
            />
          </>
        ) : null}

        {activeTab === 'calendar' ? (
          <>
            <LocalityEventCalendar
              month={calendarView.month}
              selectedDate={calendarView.selectedDate}
              today={today}
              eventsByDay={calendarRowsByDay}
              unplacedEventCount={unplacedEventCount}
              onPreviousMonth={() => moveCalendarMonth(-1)}
              onNextMonth={() => moveCalendarMonth(1)}
              onToday={returnCalendarToToday}
              onSelectDate={selectCalendarDate}
            />
            <ThemedSurface
              padded
              radius={LOCALITY_INNER_RADIUS}
              style={styles.calendarSelectionHeader}>
              <LocalityCardDecor accent={theme.accent} tape="none" />
              <View style={styles.calendarSelectionCopy}>
                <ThemedText variant="captionSmall" tone="tertiary" weight="800">
                  {t('news.calendar.selectedDate')}
                </ThemedText>
                <ThemedText variant="titleLarge" weight="800">
                  {selectedCalendarLabel}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.calendarCountChip,
                  { borderColor: theme.accent, backgroundColor: theme.background.secondary },
                ]}>
                <ThemedText variant="captionSmall" weight="800" style={{ color: theme.accent }}>
                  {t('news.calendar.eventCount', { count: selectedCalendarRows.length })}
                </ThemedText>
              </View>
            </ThemedSurface>
            <EventList
              rows={selectedCalendarRows}
              emptyTitle={t('news.calendar.emptyDayTitle')}
              emptyBody={t('news.calendar.emptyDayBody')}
              onOpen={openEvent}
            />
          </>
        ) : null}

        {activeTab === 'news' ? (
          <NewsList
            loading={loading}
            error={error}
            snapshot={snapshot}
            onRefresh={refresh}
            relativeTime={relativeTime}
            onOpenArticle={openArticle}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function EventList({
  rows,
  emptyTitle,
  emptyBody,
  onOpen,
}: {
  rows: readonly EventRow[];
  emptyTitle: string;
  emptyBody: string;
  onOpen: (row: EventRow) => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);

  if (rows.length === 0) {
    return (
      <ThemedSurface variant="outlined" padded radius={LOCALITY_CARD_RADIUS} style={styles.empty}>
        <LocalityCardDecor accent={theme.accent} tape="center" />
        <Ionicons name="calendar-outline" size={28} color={theme.text.tertiary} />
        <ThemedText variant="bodyMedium" weight="800" align="center">
          {emptyTitle}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary" align="center">
          {emptyBody}
        </ThemedText>
      </ThemedSurface>
    );
  }

  return (
    <View style={styles.eventList}>
      {rows.map((row, index) => (
        <Animated.View
          key={row.event.id}
          entering={index < 8 ? listItemEnter(index, 16) : undefined}>
          <EventRowCard row={row} categoryLabel={t(eventCategoryKey(row.event))} onOpen={onOpen} />
        </Animated.View>
      ))}
    </View>
  );
}

function EventRowCard({
  row,
  categoryLabel,
  onOpen,
}: {
  row: EventRow;
  categoryLabel: string;
  onOpen: (row: EventRow) => void;
}) {
  const { theme } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  const accent = row.accent;
  const accentForeground = readableTextOn(accent);
  const dateBlock = deriveEventDateBlock(row.state, language, {
    ongoing: t('pilgrimageUi.eventDetail.permanent'),
    tba: t('pilgrimageUi.eventDetail.dateTba'),
  });
  const eventName = resolveLocalIntelText(row.event.name, language);
  const location = row.primaryLocation
    ? resolveLocalIntelText(row.primaryLocation, language).value
    : null;
  const locationLabel =
    location && row.additionalLocationCount > 0
      ? t('news.events.locationMore', {
          location,
          count: row.additionalLocationCount,
        })
      : location;

  return (
    <Pressable
      onPress={() => onOpen(row)}
      accessibilityRole="button"
      accessibilityLabel={eventName.value}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedSurface padded={0} radius={LOCALITY_CARD_RADIUS} style={styles.eventCard}>
        <LocalityCardDecor accent={accent} tape="left" />
        <View style={styles.eventMainRow}>
          <DateBlock block={dateBlock} accent={accent} theme={theme} />
          <LocalityMiniStamp
            accent={accent}
            imageUri={row.cover}
            icon={localityCategoryIcon(row.event.category)}
          />
          <View style={styles.eventBody}>
            <View style={styles.eventMetaRow}>
              <View style={[styles.eventChip, { backgroundColor: accent }]}>
                <ThemedText
                  variant="captionSmall"
                  weight="800"
                  numberOfLines={1}
                  style={{ color: accentForeground }}>
                  {categoryLabel}
                </ThemedText>
              </View>
              <EventStateChip
                state={row.state}
                theme={theme}
                ongoing={row.event.schedule.kind === 'ongoing'}
              />
            </View>
            <TranslatedText
              original={row.event.name.ja}
              translated={eventName.value}
              source={eventName.source}
              variant="bodyMedium"
              weight="800"
              numberOfLines={2}
              disableLongPress
            />
            {row.animeTitle ? (
              <View style={styles.infoLine}>
                <Ionicons name="sparkles-outline" size={13} color={theme.text.tertiary} />
                <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                  {row.animeTitle}
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.infoLine}>
              <Ionicons name="location-outline" size={13} color={theme.text.tertiary} />
              {locationLabel ? (
                <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                  {locationLabel}
                </ThemedText>
              ) : null}
              <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                {t('news.events.stopCount', { count: row.stopCount })}
              </ThemedText>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
        </View>
        <LocalityAttributionFooter
          provenance={row.event.provenance}
          variant="compact"
          style={styles.eventAttribution}
        />
      </ThemedSurface>
    </Pressable>
  );
}

function DateBlock({
  block,
  accent,
  theme,
}: {
  block: EventDateBlock;
  accent: string;
  theme: ThemePalette;
}) {
  const active = block.emphasis === 'active';
  const foreground = active ? readableTextOn(accent) : theme.text.primary;
  return (
    <View
      style={[
        stylesStatic.dateBlock,
        {
          backgroundColor: active ? accent : theme.background.tertiary,
          borderColor: active ? accent : theme.glassBorder,
        },
      ]}>
      <ThemedText
        variant="captionSmall"
        weight="800"
        align="center"
        style={{ color: active ? foreground : theme.text.tertiary }}>
        {block.top}
      </ThemedText>
      {block.main ? (
        <ThemedText
          variant="titleLarge"
          weight="800"
          align="center"
          style={{ color: block.emphasis === 'upcoming' ? accent : foreground }}>
          {block.main}
        </ThemedText>
      ) : null}
    </View>
  );
}

function NewsList({
  loading,
  error,
  snapshot,
  onRefresh,
  relativeTime,
  onOpenArticle,
}: {
  loading: boolean;
  error: Error | null;
  snapshot: ReturnType<typeof useNewsStream>['snapshot'];
  onRefresh: () => void;
  relativeTime: (publishedAt: number) => string;
  onOpenArticle: (url: string) => void;
}) {
  const { theme } = useTheme();
  const router = useRouter();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  return (
    <>
      {loading && snapshot.articles.length === 0 ? <Skeleton.ListRow count={6} /> : null}
      {error && snapshot.articles.length === 0 ? (
        <ThemedSurface variant="outlined" padded radius={LOCALITY_CARD_RADIUS} style={styles.empty}>
          <LocalityCardDecor accent={theme.status.warning} tape="center" />
          <Ionicons name="warning-outline" size={28} color={theme.status.warning} />
          <ThemedText variant="bodyMedium" weight="800" align="center">
            {t('news.errorTitle')}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" align="center">
            {t('news.errorBody')}
          </ThemedText>
          <ThemedButton label={t('common.retry')} onPress={onRefresh} />
        </ThemedSurface>
      ) : null}
      {!loading && snapshot.articles.length === 0 && !error ? (
        <ThemedSurface variant="outlined" padded radius={LOCALITY_CARD_RADIUS} style={styles.empty}>
          <LocalityCardDecor accent={theme.status.info} tape="center" />
          <Ionicons name="newspaper-outline" size={28} color={theme.text.tertiary} />
          <ThemedText variant="bodyMedium" weight="800" align="center">
            {t('news.emptyTitle')}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" align="center">
            {t('news.emptyBody')}
          </ThemedText>
          <ThemedButton
            label={t('news.manageSources')}
            onPress={() => router.push('/pilgrimage/news/sources')}
          />
        </ThemedSurface>
      ) : null}
      {snapshot.articles.map((article, index) => (
        <Animated.View
          key={`${article.sourceId}:${article.id}`}
          entering={index < 8 ? listItemEnter(index, 16) : undefined}>
          <NewsArticleRow
            article={article}
            source={getNewsSource(article.sourceId)}
            relativeTime={relativeTime(article.publishedAt)}
            onOpen={() => onOpenArticle(article.link)}
          />
        </Animated.View>
      ))}
    </>
  );
}

function eventCategoryKey(event: LocalityEvent): TranslationKey {
  const keys: Record<EventCategory, TranslationKey> = {
    stamp_rally: 'news.eventCategory.stampRally',
    festival: 'news.eventCategory.festival',
    collab_cafe: 'news.eventCategory.collabCafe',
    exhibition: 'news.eventCategory.exhibition',
    other: 'news.eventCategory.other',
  };
  return keys[event.category];
}

const stylesStatic = StyleSheet.create({
  dateBlock: {
    width: 58,
    minHeight: 66,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
});

function makeStyles() {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.screenPadding,
      paddingVertical: Spacing.sm,
    },
    headerText: { flex: 1, minWidth: 0 },
    scroller: { flex: 1 },
    content: { padding: Spacing.screenPadding, gap: Spacing.md },
    tabFrame: { position: 'relative', ...Shadow.subtle },
    chipRow: { gap: Spacing.sm, paddingRight: Spacing.screenPadding },
    empty: {
      alignItems: 'center',
      gap: Spacing.sm,
      position: 'relative',
    },
    tagNote: { position: 'relative' },
    eventList: { gap: Spacing.sm },
    eventCard: { position: 'relative', ...Shadow.subtle },
    eventMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      paddingBottom: Spacing.sm,
      paddingTop: Spacing.lg,
    },
    eventBody: { flex: 1, gap: Spacing.xxs, minWidth: 0 },
    eventMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: Spacing.xs,
    },
    eventChip: {
      maxWidth: 104,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xxs,
    },
    infoLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xxs,
      minWidth: 0,
    },
    eventAttribution: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.md,
    },
    pressed: { opacity: 0.84 },
    calendarSelectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      position: 'relative',
    },
    calendarSelectionCopy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
    calendarCountChip: {
      minHeight: Spacing.xxl,
      borderRadius: Radius.full,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.sm,
    },
  });
}

function shiftCalendarMonth(month: LocalityCalendarMonth, offset: number): LocalityCalendarMonth {
  const absoluteMonth = month.year * 12 + (month.month - 1) + offset;
  return {
    year: Math.floor(absoluteMonth / 12),
    month: (((absoluteMonth % 12) + 12) % 12) + 1,
  };
}

function moveDateIntoMonth(date: IsoDate, month: LocalityCalendarMonth): IsoDate {
  const requestedDay = Number(date.slice(8, 10));
  const lastDay = new Date(Date.UTC(month.year, month.month, 0, 12)).getUTCDate();
  return toIsoDate(month.year, month.month, Math.min(requestedDay, lastDay));
}

function toLocalIsoDate(date: Date): IsoDate {
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
