import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Anime } from '../rate/types';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { pushAnimeDetail } from '../../libs/utils/navigate-to-anime';
import { EmptyStateView } from '../common/EmptyStateView';
import { ErrorStateView } from '../common/ErrorStateView';
import { IconSize, Radius, Shadow, Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme, type ThemePalette } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { trackingService } from '../../libs/services/tracking/tracking-service';
import { isStringArray, safeJsonParse } from '../../libs/utils/safe-json';
import { pilgrimageRepository } from '../../libs/services/pilgrimage/pilgrimage-repository';
import { lookupBangumiByPlatformId } from '../../libs/services/pilgrimage/anitabi-cross-index';
import {
  pilgrimageSearchService,
  type PilgrimageSearchResult,
} from '../../libs/services/pilgrimage/pilgrimage-search-service';
import {
  formatPilgrimageSubtitle,
  getPilgrimageAnimeTitles,
} from '../../libs/services/pilgrimage/pilgrimage-localization';
import { buildPilgrimageDetailRoute } from '../../libs/services/pilgrimage/pilgrimage-navigation';
import { getStringParam } from '../../libs/utils/route-params';
import { sameArrayBy } from '../../libs/utils/state-array';

import { kvGet, kvSet } from '../../libs/services/storage/app-storage';
import { SEARCH_RECENT_KEY } from '../../libs/services/storage/keys';
import { Skeleton, ThemedButton, ThemedIconButton, ThemedText } from '../themed';
import { useT } from '../../libs/i18n';
import { useAnimeDisplayTitle } from '../../libs/i18n/use-display-title';
import { listItemEnter } from '../../libs/animations/presets';
import { floatingTabBarOverlayBottom } from '../../libs/navigation/floating-tab-bar-layout';

const MAX_RECENT = 8;

/**
 * Synchronous MMKV read for the recent-searches list, used as the `useState`
 * initializer so the empty/populated chips render correctly on frame 1
 * instead of momentarily flashing the empty state.
 */
function readRecentSync(): string[] {
  const parsed = safeJsonParse(kvGet(SEARCH_RECENT_KEY), isStringArray);
  return parsed ? parsed.slice(0, MAX_RECENT) : [];
}
const DEBOUNCE_MS = 320;

type SortKey = 'relevance' | 'score' | 'year';
type FilterKey = 'all' | 'tv' | 'movie' | 'recent';

type SearchAnime = Anime & {
  bangumiId?: number;
  hasPilgrimage?: boolean;
  pilgrimageSource?: PilgrimageSearchResult['source'];
  secondaryTitle?: string;
};

const FILTER_KEYS: readonly { key: FilterKey; labelKey: string }[] = [
  { key: 'all', labelKey: 'search.filter.all' },
  { key: 'tv', labelKey: 'search.filter.tv' },
  { key: 'movie', labelKey: 'search.filter.movie' },
  { key: 'recent', labelKey: 'search.filter.recent' },
];

const SORT_KEYS: readonly { key: SortKey; labelKey: string }[] = [
  { key: 'relevance', labelKey: 'search.sort.relevance' },
  { key: 'score', labelKey: 'search.sort.score' },
  { key: 'year', labelKey: 'search.sort.newest' },
];

function sameSearchResults(current: SearchAnime[], next: SearchAnime[]): boolean {
  return sameArrayBy(current, next, (anime) => [
    anime.id,
    anime.title,
    anime.titleEnglish,
    anime.titleRomaji,
    anime.titleJapanese,
    anime.secondaryTitle,
    anime.image,
    anime.bannerImage,
    anime.rank,
    anime.score,
    anime.startDate?.year,
    anime.startDate?.month,
    anime.startDate?.day,
    anime.type,
    anime.format,
    anime.status,
    anime.episodes,
    anime.durationMinutes,
    anime.nextAiringEpisode?.airingAt,
    anime.nextAiringEpisode?.episode,
    anime.bangumiId,
    anime.hasPilgrimage,
    anime.pilgrimageSource,
  ]);
}

interface SearchScreenProps {
  tabRoot?: boolean;
}

export default function SearchScreen({ tabRoot = false }: SearchScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const t = useT();
  // `context=pilgrimage` is set by the pilgrimage hub so we route picks to
  // /pilgrimage/[bangumiId] instead of /anime/[id]. Any other value falls
  // through to the default global-search behaviour.
  const params = useLocalSearchParams<{ context?: string; q?: string }>();
  const isPilgrimageMode = tabRoot || params.context === 'pilgrimage';
  const initialQuery = getStringParam(params, 'q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchAnime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecentSync);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [sortOpen, setSortOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => new Set());
  const [bookmarkPendingId, setBookmarkPendingId] = useState<string | null>(null);
  const [bookmarkToast, setBookmarkToast] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeQueryRef = useRef(initialQuery);

  // Track the keyboard so the bookmark toast rides above it instead of being
  // covered (this screen intentionally has no KeyboardAvoidingView — the
  // full-height list doesn't need one, only the floating toast does).
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) =>
      setKeyboardHeight(e.endCoordinates.height)
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);
  const resolveRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    trackingService
      .getTrackedIdSet()
      .then((ids) => {
        if (!cancelled) setTrackedIds(ids);
      })
      .catch(() => undefined);
    const unsubscribe = trackingService.onTrackedIdsChange((ids) => {
      setTrackedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const showBookmarkToast = useCallback((message: string) => {
    setBookmarkToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setBookmarkToast(null), 2000);
  }, []);

  useEffect(() => {
    const next = getStringParam(params, 'q') ?? '';
    if (next === routeQueryRef.current) return;
    routeQueryRef.current = next;
    setQuery(next);
  }, [params]);

  // `recent` is seeded synchronously from MMKV above; no async hydrate.

  const persistRecent = useCallback((next: string[]) => {
    kvSet(SEARCH_RECENT_KEY, JSON.stringify(next));
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      const requestId = ++searchRequestRef.current;
      const trimmed = q.trim();
      if (!trimmed) {
        setResults((prev) => (prev.length === 0 ? prev : []));
        setError((prev) => (prev === null ? prev : null));
        setLoading((prev) => (prev ? false : prev));
        return;
      }
      setLoading(true);
      setError(null);
      setResolveError(null);
      try {
        let nextResults: SearchAnime[];
        if (isPilgrimageMode) {
          const data = await pilgrimageSearchService.search(trimmed, { limit: 30 });
          nextResults = data.map((r) => mapPilgrimageResultToAnime(r, t));
        } else {
          const data = await AnimeRepository.searchAnime(trimmed, 1);
          nextResults = (data ?? []) as SearchAnime[];
        }
        if (requestId !== searchRequestRef.current) return;
        setResults((prev) => (sameSearchResults(prev, nextResults) ? prev : nextResults));
      } catch (e) {
        if (requestId !== searchRequestRef.current) return;
        setError(e instanceof Error ? e.message : t('search.errorGeneric'));
        setResults((prev) => (prev.length === 0 ? prev : []));
      } finally {
        if (requestId === searchRequestRef.current) {
          setLoading(false);
        }
      }
    },
    [isPilgrimageMode, t]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const handleSelect = useCallback(
    async (anime: SearchAnime) => {
      const resolveRequestId = ++resolveRequestRef.current;
      hapticsBridge.tap();
      const next = [anime.title, ...recent.filter((r) => r !== anime.title)].slice(0, MAX_RECENT);
      setRecent(next);
      persistRecent(next);
      Keyboard.dismiss();

      if (isPilgrimageMode) {
        const chromeSeed = {
          title: anime.title,
          titleSecondary: anime.secondaryTitle ?? anime.titleEnglish ?? null,
          poster: anime.image,
        };
        const returnTarget = tabRoot ? 'explorer-search' : 'search';
        if (typeof anime.bangumiId === 'number') {
          router.push(
            buildPilgrimageDetailRoute(anime.bangumiId, {
              returnTo: returnTarget,
              returnQuery: query,
              ...chromeSeed,
            })
          );
          return;
        }

        // Translate the browse-source id (usually AniList) → Bangumi subject
        // id before routing to the pilgrimage detail. If we can't resolve a
        // bangumi id at all there is no pilgrimage page to land on, so warn
        // the user inline instead of opening a dead screen.
        setResolveError(null);
        setResolvingId(anime.id);
        try {
          const bangumiId = await pilgrimageRepository.resolveBangumiId({
            sourcePlatform: 'anilist',
            id: anime.id,
          });
          if (resolveRequestId !== resolveRequestRef.current) return;
          if (bangumiId === null) {
            hapticsBridge.warning();
            setResolveError(t('search.pilgrimage.noMapping', { title: anime.title }));
            return;
          }
          router.push(
            buildPilgrimageDetailRoute(bangumiId, {
              returnTo: returnTarget,
              returnQuery: query,
              ...chromeSeed,
            })
          );
        } catch (e) {
          if (resolveRequestId !== resolveRequestRef.current) return;
          hapticsBridge.warning();
          setResolveError(e instanceof Error ? e.message : t('search.pilgrimage.resolveFailed'));
        } finally {
          if (resolveRequestId === resolveRequestRef.current) {
            setResolvingId(null);
          }
        }
        return;
      }

      pushAnimeDetail(router, anime);
    },
    [recent, persistRecent, router, isPilgrimageMode, query, t, tabRoot]
  );

  const handleBookmarkToggle = useCallback(
    async (anime: SearchAnime) => {
      if (bookmarkPendingId === anime.id) return;
      const wasTracked = trackedIds.has(anime.id);
      hapticsBridge.selection();
      setBookmarkPendingId(anime.id);
      // Optimistic update so the icon flips instantly. trackingService emits
      // through onTrackedIdsChange after the DB write completes, which will
      // overwrite this set with the authoritative value — same result, but
      // the user sees the change immediately.
      setTrackedIds((prev) => {
        const next = new Set(prev);
        if (wasTracked) next.delete(anime.id);
        else next.add(anime.id);
        return next;
      });
      try {
        if (wasTracked) {
          await trackingService.removeTracking(anime.id);
          showBookmarkToast(t('search.bookmark.removed', { title: anime.title }));
        } else {
          await trackingService.upsertTracking({
            animeId: anime.id,
            status: 'planned',
            title: anime.title,
            imageUrl: anime.image,
          });
          showBookmarkToast(
            isPilgrimageMode
              ? t('search.bookmark.addedPilgrimage', { title: anime.title })
              : t('search.bookmark.added', { title: anime.title })
          );
        }
      } catch (err) {
        console.warn('[search] bookmark toggle failed', err);
        hapticsBridge.warning();
        // Roll back the optimistic flip.
        setTrackedIds((prev) => {
          const next = new Set(prev);
          if (wasTracked) next.add(anime.id);
          else next.delete(anime.id);
          return next;
        });
        showBookmarkToast(
          wasTracked ? t('search.bookmark.removeFailed') : t('search.bookmark.addFailed')
        );
      } finally {
        setBookmarkPendingId(null);
      }
    },
    [bookmarkPendingId, trackedIds, isPilgrimageMode, showBookmarkToast, t]
  );

  const handleRecentTap = useCallback((term: string) => {
    hapticsBridge.selection();
    setQuery(term);
  }, []);

  const handleSubmitSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    runSearch(query);
  }, [query, runSearch]);

  const handleClearRecent = useCallback(() => {
    hapticsBridge.warning();
    setRecent([]);
    persistRecent([]);
  }, [persistRecent]);

  const handleClose = () => {
    hapticsBridge.tap();
    if (isPilgrimageMode && !router.canGoBack()) {
      router.replace('/pilgrimage');
      return;
    }
    router.back();
  };

  const handleFilterTap = useCallback((key: FilterKey) => {
    hapticsBridge.selection();
    setFilter(key);
  }, []);

  const handleSortTap = useCallback(() => {
    hapticsBridge.selection();
    setSortOpen((v) => !v);
  }, []);

  const handleSortPick = useCallback((key: SortKey) => {
    hapticsBridge.selection();
    setSort(key);
    setSortOpen(false);
  }, []);

  // Apply client-side filter + sort to keep things responsive without adding
  // backend params. Filters narrow on type; sort reorders only.
  const filteredResults = useMemo(() => {
    if (isPilgrimageMode) return results;
    let list = results;
    if (filter === 'tv') {
      list = list.filter((a) => (a.type ?? a.format ?? '').toUpperCase().includes('TV'));
    } else if (filter === 'movie') {
      list = list.filter((a) => (a.type ?? a.format ?? '').toUpperCase().includes('MOVIE'));
    } else if (filter === 'recent') {
      const currentYear = new Date().getFullYear();
      list = list.filter((a) => (a.startDate?.year ?? 0) >= currentYear - 1);
    }
    if (sort === 'score') {
      list = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else if (sort === 'year') {
      list = [...list].sort((a, b) => (b.startDate?.year ?? 0) - (a.startDate?.year ?? 0));
    }
    return list;
  }, [filter, isPilgrimageMode, results, sort]);

  const sortLabel = t(SORT_KEYS.find((s) => s.key === sort)?.labelKey ?? 'search.sort.relevance');

  return (
    <View style={styles.root}>
      {tabRoot ? null : <Stack.Screen options={{ headerShown: false }} />}
      <LinearGradient colors={theme.gradient} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View
          style={[styles.headerShell, { paddingTop: insets.top > 0 ? Spacing.xs : Spacing.sm }]}>
          {tabRoot ? (
            <View style={styles.tabTitleBlock}>
              <ThemedText variant="headlineMedium" weight="700">
                {t('search.pilgrimage.title')}
              </ThemedText>
              <ThemedText variant="bodySmall" tone="secondary">
                {t('search.pilgrimage.description')}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.searchHeader}>
            {!tabRoot ? (
              <ThemedIconButton
                onPress={handleClose}
                accessibilityLabel={t('common.back')}
                haptic="none"
                icon={(color) => <Ionicons name="chevron-back" size={20} color={color} />}
              />
            ) : null}

            <View style={styles.searchBar}>
              <Ionicons
                name={isPilgrimageMode ? 'location' : 'search'}
                size={16}
                color={isPilgrimageMode ? theme.accent : theme.text.secondary}
              />
              <TextInput
                autoFocus={!tabRoot}
                placeholder={
                  isPilgrimageMode
                    ? t('search.placeholder.pilgrimage')
                    : t('search.placeholder.default')
                }
                placeholderTextColor={theme.text.tertiary}
                value={query}
                onChangeText={setQuery}
                style={styles.input}
                returnKeyType="search"
                onSubmitEditing={handleSubmitSearch}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {loading && results.length > 0 ? (
                // Old results stay visible while a new query runs — without this
                // spinner the screen reads as stale/stuck (the skeleton only
                // covers the zero-results case).
                <Skeleton.Block width={18} height={18} borderRadius={9} />
              ) : null}
              {query.length > 0 ? (
                <ThemedIconButton
                  onPress={() => setQuery('')}
                  accessibilityLabel={t('search.clearA11y')}
                  variant="ghost"
                  icon={(color) => <Ionicons name="close-circle" size={18} color={color} />}
                />
              ) : null}
            </View>
          </View>
        </View>

        {isPilgrimageMode && resolveError ? (
          <View style={styles.resolveBanner}>
            <Ionicons name="information-circle" size={14} color={theme.text.primary} />
            <Text style={styles.resolveBannerText} numberOfLines={2}>
              {resolveError}
            </Text>
            <ThemedIconButton
              onPress={() => setResolveError(null)}
              accessibilityLabel={t('search.dismissA11y')}
              variant="ghost"
              icon={(color) => <Ionicons name="close" size={18} color={color} />}
            />
          </View>
        ) : null}

        {/* Fixed-height slot: the chip row fades in/out inside it so typing
            the first character doesn't shove the whole list down (and
            clearing doesn't shove it back up). */}
        {!isPilgrimageMode ? (
          <View style={styles.filterChipsWrap}>
            {query.length > 0 ? (
              <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterChipsRow}>
                  {FILTER_KEYS.map((f) => {
                    const active = filter === f.key;
                    return (
                      <ThemedButton
                        key={f.key}
                        onPress={() => handleFilterTap(f.key)}
                        label={t(f.labelKey)}
                        accessibilityLabel={t(f.labelKey)}
                        variant={active ? 'primary' : 'secondary'}
                        size="md"
                        haptic="none"
                        textStyle={Typography.captionSmall}
                      />
                    );
                  })}
                </ScrollView>
              </Animated.View>
            ) : null}
          </View>
        ) : null}

        {error ? (
          <ErrorStateView
            title={t('search.errorTitle')}
            message={error}
            onRetry={() => runSearch(query)}
            variant="fullscreen"
          />
        ) : query.length === 0 ? (
          <ScrollView
            contentContainerStyle={[
              { paddingBottom: insets.bottom + 100 },
              // The discover prompt centers in the viewport; the recents list
              // keeps normal top-aligned flow.
              recent.length === 0 && styles.centerGrow,
            ]}
            keyboardShouldPersistTaps="handled">
            {recent.length > 0 ? (
              <View style={styles.recentSection}>
                <View style={styles.sectionRow}>
                  <Text style={styles.sectionTitle}>{t('search.recent')}</Text>
                  <Pressable onPress={handleClearRecent} hitSlop={8}>
                    <Text style={styles.clearText}>{t('search.clear')}</Text>
                  </Pressable>
                </View>
                <View style={styles.recentRow}>
                  {recent.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => handleRecentTap(term)}
                      style={({ pressed }) => [styles.recentChip, pressed && { opacity: 0.8 }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('search.recentTermA11y', { term })}>
                      <MaterialIcons name="history" size={14} color={theme.text.secondary} />
                      <Text style={styles.recentText} numberOfLines={1}>
                        {term}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <EmptyStateView
                icon="search"
                title={
                  isPilgrimageMode ? t('search.pilgrimage.emptyTitle') : t('search.discoverTitle')
                }
                description={
                  isPilgrimageMode
                    ? t('search.pilgrimage.emptyDescription')
                    : t('search.discoverDescription')
                }
              />
            )}
          </ScrollView>
        ) : loading && results.length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              padding: Spacing.md,
              paddingBottom: insets.bottom + 100,
            }}
            keyboardShouldPersistTaps="handled">
            <Skeleton.AnimeCardList count={6} />
          </ScrollView>
        ) : filteredResults.length === 0 ? (
          <View style={styles.centerFill}>
            <EmptyStateView
              icon="search-off"
              title={t('search.noMatchesTitle')}
              description={
                isPilgrimageMode
                  ? t('search.pilgrimage.noMatchesDescription', { query })
                  : t('search.noMatchesDescription', { query })
              }
            />
          </View>
        ) : (
          <FlatList
            data={filteredResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: Spacing.md,
              paddingTop: 0,
              paddingBottom: insets.bottom + 100,
              gap: 10,
            }}
            ListHeaderComponent={
              <View style={styles.sortRow}>
                <Text style={styles.resultCount}>
                  {loading
                    ? t('search.searching')
                    : t('search.resultCount', { count: filteredResults.length })}
                </Text>
                {!isPilgrimageMode ? (
                  <>
                    <ThemedButton
                      onPress={handleSortTap}
                      label={sortLabel}
                      accessibilityLabel={t('search.sortByA11y')}
                      variant="secondary"
                      haptic="none"
                      icon={
                        <Ionicons name="swap-vertical" size={14} color={theme.text.secondary} />
                      }
                      iconRight={
                        <Ionicons
                          name={sortOpen ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.text.secondary}
                        />
                      }
                    />
                    {sortOpen ? (
                      <View style={styles.sortMenu}>
                        {SORT_KEYS.map((s) => (
                          <ThemedButton
                            key={s.key}
                            onPress={() => handleSortPick(s.key)}
                            label={t(s.labelKey)}
                            variant="ghost"
                            fullWidth
                            haptic="none"
                            textStyle={sort === s.key ? { color: theme.accent } : undefined}
                            iconRight={
                              sort === s.key ? (
                                <Ionicons name="checkmark" size={14} color={theme.accent} />
                              ) : null
                            }
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            }
            renderItem={({ item, index }) => {
              const card = (
                <ResultCard
                  anime={item}
                  pending={resolvingId === item.id}
                  hasPilgrimage={
                    item.hasPilgrimage === true ||
                    lookupBangumiByPlatformId('anilist', item.id) !== null
                  }
                  isBookmarked={trackedIds.has(item.id)}
                  bookmarkPending={bookmarkPendingId === item.id}
                  onPress={() => handleSelect(item)}
                  onBookmarkPress={() => handleBookmarkToggle(item)}
                />
              );
              return index < 8 ? (
                <Animated.View entering={listItemEnter(index)}>{card}</Animated.View>
              ) : (
                card
              );
            }}
            ListFooterComponent={
              loading ? (
                <View style={styles.footerLoader}>
                  <Skeleton.AnimeCardList count={2} />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
      {bookmarkToast ? (
        <View
          style={[
            styles.toast,
            {
              bottom:
                keyboardHeight > 0
                  ? keyboardHeight + Spacing.sm
                  : tabRoot
                    ? floatingTabBarOverlayBottom(insets.bottom)
                    : insets.bottom + Spacing.lg,
            },
          ]}>
          <Ionicons name="bookmark" size={16} color={theme.accent} />
          <Text style={styles.toastText} numberOfLines={2}>
            {bookmarkToast}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface ResultCardProps {
  anime: SearchAnime;
  pending?: boolean;
  /**
   * Whether the L2 Anitabi cross-index resolved a pilgrimage entry for this
   * anime. Renders a 📍 marker on the title row so users can see at a glance
   * which results have real pilgrimage data — no fake markers; falsy = no
   * marker, never a placeholder.
   */
  hasPilgrimage?: boolean;
  /** Whether the user has already saved this anime to their tracked list. */
  isBookmarked?: boolean;
  /** True while the bookmark toggle's async write is in flight. */
  bookmarkPending?: boolean;
  onPress: () => void;
  /** Tap on the bookmark icon. Independent from the row press. */
  onBookmarkPress?: () => void;
}

function mapPilgrimageResultToAnime(
  result: PilgrimageSearchResult,
  t: ReturnType<typeof useT>
): SearchAnime {
  const titles = getPilgrimageAnimeTitles({
    id: result.bangumiId,
    title: result.title,
    titleCn: result.titleCn,
    titleEnglish: result.titleEnglish,
    titleRomaji: result.titleRomaji,
  });
  const tags = [
    result.city,
    result.pointsLength > 0 ? t('search.spotsCount', { count: result.pointsLength }) : null,
  ].filter((tag): tag is string => typeof tag === 'string' && tag.length > 0);

  return {
    id: String(result.bangumiId),
    bangumiId: result.bangumiId,
    hasPilgrimage: true,
    pilgrimageSource: result.source,
    title: titles.primary,
    secondaryTitle: formatPilgrimageSubtitle(titles),
    titleEnglish: titles.english,
    image: result.cover,
    rank: 0,
    type: 'Pilgrimage',
    format: 'Pilgrimage',
    tags,
    mood: '',
    durationMinutes: 0,
  };
}

function ResultCard({
  anime,
  pending,
  hasPilgrimage,
  isBookmarked,
  bookmarkPending,
  onPress,
  onBookmarkPress,
}: ResultCardProps) {
  const t = useT();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Pilgrimage rows carry a Bangumi id and a title already localized by
  // pilgrimage-localization — don't run them through the AniList-id pipeline.
  const isPilgrimageRow = anime.pilgrimageSource !== undefined;
  const localizedTitle = useAnimeDisplayTitle(isPilgrimageRow ? null : anime);
  const displayTitle = isPilgrimageRow ? anime.title : localizedTitle || anime.title;
  const score = typeof anime.score === 'number' ? formatScore(anime.score) : null;
  const tags = anime.tags?.slice(0, 3) ?? [];
  return (
    <Pressable
      onPress={onPress}
      disabled={pending}
      accessibilityRole="button"
      accessibilityLabel={
        hasPilgrimage ? t('search.resultPilgrimageA11y', { title: displayTitle }) : displayTitle
      }
      style={({ pressed }) => [
        styles.resultCard,
        pressed && { opacity: 0.85 },
        pending && { opacity: 0.6 },
      ]}>
      <Image
        source={{ uri: anime.image }}
        style={styles.thumb}
        contentFit="cover"
        transition={150}
      />
      <View style={styles.resultBody}>
        <View style={styles.resultTitleRow}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {displayTitle}
          </Text>
          {hasPilgrimage ? (
            <Ionicons
              name="location-sharp"
              size={IconSize.sm}
              color={theme.accent}
              style={styles.pilgrimagePin}
              accessibilityLabel={t('search.hasPilgrimageSpotsA11y')}
            />
          ) : null}
        </View>
        {anime.secondaryTitle ? (
          <Text style={styles.resultSubtitle} numberOfLines={1}>
            {anime.secondaryTitle}
          </Text>
        ) : null}
        <View style={styles.resultMetaRow}>
          {anime.format || anime.type ? (
            <View style={styles.typeChip}>
              <Text style={styles.typeChipText}>{anime.format ?? anime.type}</Text>
            </View>
          ) : null}
          {anime.startDate?.year ? (
            <Text style={styles.resultMeta}>{anime.startDate.year}</Text>
          ) : null}
          {anime.status ? <Text style={styles.resultMetaSubtle}>· {anime.status}</Text> : null}
          {score ? (
            <View style={styles.resultScore}>
              <Ionicons name="star" size={11} color={theme.accent} />
              <Text style={styles.resultScoreText}>{score}</Text>
            </View>
          ) : null}
        </View>
        {tags.length > 0 ? (
          <Text style={styles.resultTags} numberOfLines={1}>
            {tags.join(' · ')}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onBookmarkPress?.();
        }}
        hitSlop={6}
        disabled={bookmarkPending}
        accessibilityRole="button"
        accessibilityLabel={
          isBookmarked ? t('search.bookmarkRemoveA11y') : t('search.bookmarkAddA11y')
        }
        accessibilityState={{ selected: !!isBookmarked, busy: !!bookmarkPending }}
        style={({ pressed }) => [
          styles.bookmarkBtn,
          isBookmarked && styles.bookmarkBtnActive,
          pressed && { opacity: 0.78 },
          bookmarkPending && { opacity: 0.6 },
        ]}>
        <Ionicons
          name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
          size={16}
          color={isBookmarked ? theme.accent : theme.text.secondary}
        />
      </Pressable>
    </Pressable>
  );
}

function formatScore(score: number): string {
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    safe: { flex: 1 },
    headerShell: { gap: Spacing.xs, paddingBottom: Spacing.sm },
    tabTitleBlock: {
      gap: Spacing.xxs,
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.xs,
    },
    searchHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      gap: 10,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: Spacing.md,
      minHeight: 48,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    input: {
      flex: 1,
      color: theme.text.primary,
      ...Typography.bodyMedium,
      fontWeight: '600',
      paddingVertical: 0,
    },
    resolveBanner: {
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      backgroundColor: `${theme.status.warning}1F`,
      borderWidth: 1,
      borderColor: `${theme.status.warning}73`,
    },
    resolveBannerText: {
      flex: 1,
      color: theme.text.primary,
      ...Typography.bodySmall,
      fontWeight: '600',
    },
    filterChipsWrap: {
      height: 46,
      paddingBottom: Spacing.sm,
      justifyContent: 'center',
    },
    filterChipsRow: { paddingHorizontal: Spacing.md, gap: Spacing.xs },
    sortRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: Spacing.sm,
      position: 'relative',
    },
    centerFill: { flex: 1, justifyContent: 'center' },
    centerGrow: { flexGrow: 1, justifyContent: 'center' },
    resultCount: { color: theme.text.secondary, ...Typography.captionSmall, fontWeight: '600' },
    sortMenu: {
      position: 'absolute',
      top: 42,
      right: 0,
      minWidth: 140,
      paddingVertical: Spacing.xs,
      borderRadius: Radius.md,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      zIndex: 10,
      ...Shadow.heavy,
    },
    recentSection: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    sectionTitle: { color: theme.text.primary, ...Typography.titleLarge },
    clearText: { color: theme.accent, ...Typography.bodySmall, fontWeight: '700' },
    recentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
    recentChip: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.full,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      maxWidth: 220,
    },
    recentText: { color: theme.text.primary, ...Typography.bodySmall, fontWeight: '500' },
    resultCard: {
      minHeight: 108,
      flexDirection: 'row',
      gap: Spacing.sm,
      padding: Spacing.sm,
      borderRadius: Radius.card,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      alignItems: 'center',
    },
    thumb: {
      width: 64,
      height: 88,
      borderRadius: Radius.md,
      backgroundColor: theme.background.tertiary,
    },
    resultBody: { flex: 1, minWidth: 0, gap: Spacing.xxs },
    resultTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xs },
    resultTitle: {
      flex: 1,
      minWidth: 0,
      color: theme.text.primary,
      ...Typography.bodyMedium,
      fontWeight: '700',
    },
    resultSubtitle: { color: theme.text.tertiary, ...Typography.captionSmall, fontWeight: '600' },
    pilgrimagePin: { padding: Spacing.xs, marginTop: -Spacing.xs, marginRight: -Spacing.xs },
    resultMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
    },
    typeChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.sm,
      backgroundColor: theme.background.tertiary,
    },
    typeChipText: { color: theme.text.secondary, ...Typography.captionSmall, fontWeight: '700' },
    resultMeta: { color: theme.text.secondary, ...Typography.captionSmall, fontWeight: '600' },
    resultMetaSubtle: { color: theme.text.tertiary, ...Typography.captionSmall },
    resultScore: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
    resultScoreText: { color: theme.accent, ...Typography.captionSmall, fontWeight: '700' },
    resultTags: { color: theme.text.tertiary, ...Typography.captionSmall },
    bookmarkBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.background.tertiary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
    },
    bookmarkBtnActive: {
      backgroundColor: `${theme.accent}29`,
      borderColor: `${theme.accent}8C`,
    },
    toast: {
      position: 'absolute',
      left: Spacing.md,
      right: Spacing.md,
      bottom: Spacing.lg,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.md,
      backgroundColor: theme.background.secondary,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      ...Shadow.heavy,
    },
    toastText: { flex: 1, color: theme.text.primary, ...Typography.bodySmall, fontWeight: '600' },
    footerLoader: { paddingVertical: Spacing.lg, alignItems: 'center' },
  });
}
