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
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';

import { NewsArticleRow } from '../../../../components/news/NewsArticleRow';
import { ModeSelector } from '../../../../components/rate/ModeSelector';
import {
  readableTextOn,
  Skeleton,
  ThemedButton,
  ThemedIconButton,
  ThemedSurface,
  ThemedText,
} from '../../../../components/themed';
import { Radius, Spacing } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { useNewsStream } from '../../../../hooks/useNewsStream';
import { useT, type TranslationKey } from '../../../../libs/i18n';
import { getNewsSource } from '../../../../libs/services/news/news-sources';
import { listItemEnter } from '../../../../libs/animations/presets';
import { formatNewsRelativeTime } from '../../../../libs/services/news/news-relative-time';
import { isSafeArticleUrl } from '../../../../libs/services/news/news-url';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import { anitabiImageSource } from '../../../../libs/services/pilgrimage/anitabi-image';
import {
  getIndexedById,
  type AnitabiIndexEntry,
} from '../../../../libs/services/pilgrimage/anitabi-index';
import {
  getHubRailEvents,
  getLocalIntelVersion,
  subscribeLocalIntel,
  type HubRailEvent,
} from '../../../../libs/services/pilgrimage/local-intel/local-intel-repository';
import type {
  EventCategory,
  LocalIntelEvent,
} from '../../../../libs/services/pilgrimage/local-intel/types';
import { resolveLocalIntelText } from '../../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import { getPilgrimageAnimeTitles } from '../../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../../../libs/services/pilgrimage/pilgrimage-navigation';

type HubTab = 'event' | 'tag' | 'news';

interface EventRow extends HubRailEvent {
  animeTitle: string | null;
  bangumiId: number | null;
  cover: string | null;
}

interface WorkFilter {
  bangumiId: number;
  title: string;
}

export default function NewsStreamScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  const { snapshot, loading, refreshing, error, refresh } = useNewsStream();
  const [activeTab, setActiveTab] = useState<HubTab>('event');
  const [selectedBangumiId, setSelectedBangumiId] = useState<number | null>(null);
  const localIntelVersion = useSyncExternalStore(
    subscribeLocalIntel,
    getLocalIntelVersion,
    getLocalIntelVersion
  );
  const [now] = useState(() => new Date());

  const tabs = useMemo(
    () => [
      { value: 'event' as const, label: t('news.tabs.event'), icon: 'calendar-outline' as const },
      { value: 'tag' as const, label: t('news.tabs.tag'), icon: 'pricetag-outline' as const },
      { value: 'news' as const, label: t('news.tabs.news'), icon: 'newspaper-outline' as const },
    ],
    [t]
  );

  const eventRows = useMemo<EventRow[]>(() => {
    return getHubRailEvents(now).map((item) => {
      const bangumiId = item.event.bangumiIds.find((id) => getIndexedById(id) !== null) ?? null;
      const indexed = bangumiId !== null ? getIndexedById(bangumiId) : null;
      return {
        ...item,
        bangumiId,
        cover: indexed?.cover ?? null,
        animeTitle: indexed ? getPilgrimageAnimeTitles(indexed).primary : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version invalidates repository reads
  }, [now, localIntelVersion]);

  const workFilters = useMemo<WorkFilter[]>(() => {
    const byId = new Map<number, AnitabiIndexEntry>();
    for (const row of eventRows) {
      for (const bangumiId of row.event.bangumiIds) {
        const indexed = getIndexedById(bangumiId);
        if (indexed) byId.set(bangumiId, indexed);
      }
    }
    return [...byId.values()]
      .map((anime) => ({
        bangumiId: anime.id,
        title: getPilgrimageAnimeTitles(anime).primary,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [eventRows]);

  const taggedEventRows = useMemo(() => {
    if (selectedBangumiId === null) return eventRows;
    return eventRows.filter((row) => row.event.bangumiIds.includes(selectedBangumiId));
  }, [eventRows, selectedBangumiId]);

  const relativeTime = useCallback(
    (publishedAt: number) => formatNewsRelativeTime(publishedAt, t),
    [t]
  );

  const openEvent = useCallback(
    (row: EventRow) => {
      if (row.bangumiId === null) return;
      hapticsBridge.tap();
      router.push(
        buildPilgrimageDetailRoute(row.bangumiId, {
          title: row.animeTitle ?? undefined,
          poster: row.cover ?? undefined,
        })
      );
    },
    [router]
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
          accessibilityLabel={t('news.manageSources')}
          variant="glass"
          icon={(color) => <Ionicons name="options-outline" size={18} color={color} />}
          onPress={() => router.push('/pilgrimage/news/sources')}
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
        <ModeSelector options={tabs} value={activeTab} onChange={setActiveTab} />

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
                onPress={() => setSelectedBangumiId(null)}
                haptic="selection"
              />
              {workFilters.map((work) => (
                <ThemedButton
                  key={work.bangumiId}
                  label={work.title}
                  variant={selectedBangumiId === work.bangumiId ? 'primary' : 'secondary'}
                  size="sm"
                  onPress={() => setSelectedBangumiId(work.bangumiId)}
                  haptic="selection"
                />
              ))}
            </ScrollView>
            <ThemedText variant="captionSmall" tone="tertiary">
              {t('news.tags.scopeNote')}
            </ThemedText>
            <EventList
              rows={taggedEventRows}
              emptyTitle={t('news.tags.emptyTitle')}
              emptyBody={t('news.tags.emptyBody')}
              onOpen={openEvent}
            />
          </>
        ) : null}

        {activeTab === 'news' ? (
          <>
            {loading && snapshot.articles.length === 0 ? <Skeleton.ListRow count={6} /> : null}

            {error && snapshot.articles.length === 0 ? (
              <View style={[styles.empty, { borderColor: theme.glassBorder }]}>
                <Ionicons name="warning-outline" size={28} color={theme.status.warning} />
                <ThemedText variant="bodyMedium" weight="800" align="center">
                  {t('news.errorTitle')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {t('news.errorBody')}
                </ThemedText>
                <ThemedButton label={t('common.retry')} onPress={refresh} />
              </View>
            ) : null}

            {!loading && snapshot.articles.length === 0 && !error ? (
              <View style={[styles.empty, { borderColor: theme.glassBorder }]}>
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
              </View>
            ) : null}

            {snapshot.articles.map((article, index) => (
              <Animated.View
                key={`${article.sourceId}:${article.id}`}
                entering={index < 8 ? listItemEnter(index) : undefined}>
                <NewsArticleRow
                  article={article}
                  source={getNewsSource(article.sourceId)}
                  relativeTime={relativeTime(article.publishedAt)}
                  onOpen={() => openArticle(article.link)}
                />
              </Animated.View>
            ))}
          </>
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
  rows: EventRow[];
  emptyTitle: string;
  emptyBody: string;
  onOpen: (row: EventRow) => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);

  if (rows.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: theme.glassBorder }]}>
        <Ionicons name="calendar-outline" size={28} color={theme.text.tertiary} />
        <ThemedText variant="bodyMedium" weight="800" align="center">
          {emptyTitle}
        </ThemedText>
        <ThemedText variant="bodySmall" tone="secondary" align="center">
          {emptyBody}
        </ThemedText>
      </View>
    );
  }

  return (
    <>
      {rows.map((row, index) => (
        <Animated.View key={row.event.id} entering={index < 8 ? listItemEnter(index) : undefined}>
          <EventRowCard row={row} categoryLabel={t(eventCategoryKey(row.event))} onOpen={onOpen} />
        </Animated.View>
      ))}
    </>
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
  const styles = useMemo(() => makeStyles(), []);
  const foreground = readableTextOn(theme.accent);

  return (
    <Pressable
      onPress={() => onOpen(row)}
      disabled={row.bangumiId === null}
      accessibilityRole="button"
      accessibilityLabel={resolveLocalIntelText(row.event.name).value}
      accessibilityState={{ disabled: row.bangumiId === null }}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedSurface padded={Spacing.md} radius={Radius.lg} style={styles.eventRow}>
        {row.cover ? (
          <Image
            source={anitabiImageSource(row.cover)}
            style={styles.eventCover}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.eventCover, { backgroundColor: theme.background.tertiary }]} />
        )}
        <View style={styles.eventBody}>
          <View style={styles.eventMetaRow}>
            <View style={[styles.eventChip, { backgroundColor: theme.accent }]}>
              <ThemedText
                variant="captionSmall"
                weight="800"
                numberOfLines={1}
                style={{ color: foreground }}>
                {categoryLabel}
              </ThemedText>
            </View>
            {row.animeTitle ? (
              <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
                {row.animeTitle}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={2}>
            {resolveLocalIntelText(row.event.name).value}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
            {resolveLocalIntelText(row.event.description).value}
          </ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.text.tertiary} />
      </ThemedSurface>
    </Pressable>
  );
}

function eventCategoryKey(event: LocalIntelEvent): TranslationKey {
  const keys: Record<EventCategory, TranslationKey> = {
    stamp_rally: 'news.eventCategory.stampRally',
    festival: 'news.eventCategory.festival',
    collab_cafe: 'news.eventCategory.collabCafe',
    exhibition: 'news.eventCategory.exhibition',
    other: 'news.eventCategory.other',
  };
  return keys[event.category];
}

function makeStyles() {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.screenPadding,
      paddingVertical: Spacing.sm,
    },
    headerText: {
      flex: 1,
      minWidth: 0,
    },
    scroller: {
      flex: 1,
    },
    content: {
      padding: Spacing.screenPadding,
      gap: Spacing.md,
    },
    chipRow: {
      gap: Spacing.sm,
      paddingRight: Spacing.screenPadding,
    },
    empty: {
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderRadius: Radius.lg,
      padding: Spacing.xl,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    eventCover: {
      width: 58,
      height: 76,
      borderRadius: Radius.md,
    },
    eventBody: {
      flex: 1,
      gap: Spacing.xs,
      minWidth: 0,
    },
    eventMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      minWidth: 0,
    },
    eventChip: {
      maxWidth: 104,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
    },
    pressed: {
      opacity: 0.84,
    },
  });
}
