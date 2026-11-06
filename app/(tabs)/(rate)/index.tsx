import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Skeleton, ThemedButton, ThemedText } from '../../../components/themed';
import { HomeSearchField } from '../../../components/common/HomeSearchField';
import { SeasonalPoster, TrendingRow } from '../../../components/rate/discover/DiscoverAnimeCards';
import { GenreTile } from '../../../components/rate/discover/GenreTile';
import { PersonalizedPickSheet } from '../../../components/rate/PersonalizedPickSheet';
import { useRateData } from '../../../components/rate/useRateData';
import type { Genre } from '../../../components/rate/types';
import { bottomPad, Radius, Spacing, TabBar } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { clearAllDecks } from '../../../libs/services/rate/deck-cache';
import { loadGenreSwipePage } from '../../../libs/services/rate/genre-deck-prefetch';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { getBroadcastSeason } from '../../../libs/utils/season-utils';
import { useT } from '../../../libs/i18n';
import { useExperienceMode } from '../../../hooks/useExperienceMode';

const SEASON_KEYS = {
  WINTER: 'rate.winter',
  SPRING: 'rate.spring',
  SUMMER: 'rate.summer',
  FALL: 'rate.fall',
} as const;
const GENRE_PREVIEW = 6;

export default function DiscoverHome() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { state, actions } = useRateData();
  const router = useRouter();
  const t = useT();
  const { visibleTabs } = useExperienceMode();
  const [showPick, setShowPick] = useState(false);
  const [allGenres, setAllGenres] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshInFlight = useRef(false);
  const genreWarmupsRef = useRef(new Set<string>());
  const currentSeason = getBroadcastSeason();

  const warmGenreDeck = useCallback((genre: Genre) => {
    if (genreWarmupsRef.current.has(genre.id)) return;
    genreWarmupsRef.current.add(genre.id);
    if (genre.image) void Image.prefetch(genre.image).catch(() => undefined);
    void loadGenreSwipePage(genre.id, 1).catch(() => {
      genreWarmupsRef.current.delete(genre.id);
    });
  }, []);

  const handleGenreSelect = (genre: Genre) => {
    warmGenreDeck(genre);
    router.push({
      pathname: '/(rate)/genre/[id]',
      params: { id: genre.id, image: genre.image },
    });
  };
  const openPick = () => {
    setShowPick(true);
    void actions.loadPersonalizedPick();
  };
  const selectPick = () => {
    setShowPick(false);
    if (state.personalizedPick.anime) pushAnimeDetail(router, state.personalizedPick.anime);
  };
  const onRefresh = async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setRefreshing(true);
    genreWarmupsRef.current.clear();
    try {
      await Promise.allSettled([
        clearAllDecks(),
        actions.loadGenres(true),
        actions.loadSeasonal(true),
        actions.loadWeeklyTrend(true),
      ]);
    } finally {
      refreshInFlight.current = false;
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPad(insets) + TabBar.height },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }>
        <ThemedText variant="headlineLarge" weight="700">
          {t('tabs.rate')}
        </ThemedText>
        <HomeSearchField
          label={t('tabs.discoverHome.search')}
          onPress={() => router.push('/search')}
        />
        {state.seasonal.status !== 'ready' || state.seasonal.data.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.header}>
              <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
                {t('tabs.discoverHome.seasonal')}
              </ThemedText>
              {visibleTabs.includes('bangumi') ? (
                <ThemedButton
                  variant="ghost"
                  size="sm"
                  haptic="none"
                  label={t('tabs.discoverHome.seasonAll', {
                    year: currentSeason.year,
                    season: t(SEASON_KEYS[currentSeason.season]),
                  })}
                  onPress={() =>
                    router.push({ pathname: '/(tabs)/bangumi', params: { segment: 'season' } })
                  }
                />
              ) : null}
            </View>
            {state.seasonal.status === 'loading' ? (
              <Skeleton.AnimeCardList horizontal count={3} />
            ) : state.seasonal.status === 'error' ? (
              <SectionError onRetry={() => void actions.loadSeasonal(true)} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}>
                {state.seasonal.data.slice(0, 15).map((anime) => (
                  <SeasonalPoster key={anime.id} anime={anime} />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
        <View style={styles.section}>
          <View style={styles.header}>
            <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
              {t('tabs.discoverHome.browseGenres')}
            </ThemedText>
            <ThemedButton
              variant="ghost"
              size="sm"
              haptic="none"
              label={t('tabs.discoverHome.pickedForYou')}
              onPress={openPick}
            />
          </View>
          {state.genres.status === 'loading' ? (
            <View style={styles.grid}>
              {Array.from({ length: GENRE_PREVIEW }, (_, index) => (
                <View key={index} style={styles.gridCell}>
                  <Skeleton.Block width="100%" height={96} borderRadius={Radius.card} />
                </View>
              ))}
            </View>
          ) : state.genres.status === 'error' ? (
            <SectionError onRetry={() => void actions.loadGenres(true)} />
          ) : (
            <>
              <View style={styles.grid}>
                {(allGenres ? state.genres.data : state.genres.data.slice(0, GENRE_PREVIEW)).map(
                  (genre) => (
                    <View key={genre.id} style={styles.gridCell}>
                      <GenreTile
                        genre={genre}
                        onPressIn={() => warmGenreDeck(genre)}
                        onPress={() => handleGenreSelect(genre)}
                      />
                    </View>
                  )
                )}
              </View>
              {state.genres.data.length > GENRE_PREVIEW ? (
                <ThemedButton
                  variant="secondary"
                  size="sm"
                  fullWidth
                  haptic="selection"
                  label={
                    allGenres
                      ? t('tabs.discoverHome.fewerGenres')
                      : t('tabs.discoverHome.allGenres', { count: state.genres.data.length })
                  }
                  onPress={() => setAllGenres((value) => !value)}
                />
              ) : null}
            </>
          )}
        </View>
        {state.weeklyTrend.status !== 'ready' || state.weeklyTrend.data.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.header}>
              <ThemedText variant="titleLarge" weight="700" style={styles.headerTitle}>
                {t('tabs.discoverHome.trending')}
              </ThemedText>
              <ThemedButton
                variant="ghost"
                size="sm"
                haptic="none"
                label={t('tabs.discoverHome.fullChart')}
                onPress={() => router.push({ pathname: '/trending', params: { range: 'week' } })}
              />
            </View>
            {state.weeklyTrend.status === 'loading' ? (
              <Skeleton.ListRow count={5} avatarShape="square" />
            ) : state.weeklyTrend.status === 'error' ? (
              <SectionError onRetry={() => void actions.loadWeeklyTrend(true)} />
            ) : (
              state.weeklyTrend.data
                .slice(0, 5)
                .map((anime, index) => (
                  <TrendingRow key={anime.id} anime={anime} rank={index + 1} />
                ))
            )}
          </View>
        ) : null}
      </ScrollView>
      <PersonalizedPickSheet
        visible={showPick}
        data={state.personalizedPick}
        onClose={() => setShowPick(false)}
        onSelect={selectPick}
        onRefresh={actions.loadPersonalizedPick}
      />
    </SafeAreaView>
  );
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <View style={styles.section}>
      <ThemedText variant="bodyMedium" tone="secondary">
        {t('tabs.discoverHome.unavailable')}
      </ThemedText>
      <ThemedButton
        variant="ghost"
        size="sm"
        label={t('common.retry')}
        onPress={onRetry}
        style={styles.retry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.md, gap: Spacing.lg },
  section: { gap: Spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  headerTitle: { flex: 1 },
  rail: { gap: Spacing.sm, paddingRight: Spacing.screenPadding },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.md },
  gridCell: { width: '48.5%' },
  retry: { alignSelf: 'flex-start' },
});
