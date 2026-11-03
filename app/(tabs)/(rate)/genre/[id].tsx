import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenHeader, Skeleton, ThemedButton, ThemedText } from '../../../../components/themed';
import { TrendingRow } from '../../../../components/rate/discover/DiscoverAnimeCards';
import type { Anime } from '../../../../components/rate/types';
import { bottomPad, Radius, Spacing, TabBar } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { AnimeRepository } from '../../../../libs/repositories/anime-repository';
import { peekDeck } from '../../../../libs/services/rate/deck-cache';
import { loadGenreSwipePage } from '../../../../libs/services/rate/genre-deck-prefetch';
import { useT } from '../../../../libs/i18n';
import { useTranslatedGenre } from '../../../../libs/i18n/use-translated-genre';

type Popular = { status: 'loading' | 'ready' | 'error'; data: Anime[] };

/** Cards the user has already swiped in this genre's live deck, or 0. */
function readSeenCount(genreId: string): number {
  const snapshot = peekDeck(genreId);
  if (!snapshot || snapshot.currentIndex >= snapshot.deck.length) return 0;
  return snapshot.deck.slice(0, snapshot.currentIndex).filter((item) => item.kind === 'photo')
    .length;
}

export default function GenreScreen() {
  const { id, image } = useLocalSearchParams<{ id: string; image?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const label = useTranslatedGenre(id);
  const [popular, setPopular] = useState<Popular>(() => {
    const cached = AnimeRepository.getAnimeByGenreSync(id, 1);
    return cached ? { status: 'ready', data: cached } : { status: 'loading', data: [] };
  });
  const [seenCount, setSeenCount] = useState(() => readSeenCount(id));

  const load = useCallback(() => {
    setPopular((prev) => (prev.data.length > 0 ? prev : { status: 'loading', data: [] }));
    loadGenreSwipePage(id, 1).then(
      (data) => setPopular({ status: 'ready', data }),
      () => setPopular((prev) => (prev.data.length > 0 ? prev : { status: 'error', data: [] }))
    );
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setSeenCount(readSeenCount(id));
      if (popular.status !== 'ready') load();
      // Refresh trigger only: a ready list is never cleared on re-focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, load])
  );

  const startDeck = () =>
    router.push({ pathname: '/(rate)/rating', params: { genreId: id, genreName: label.value } });
  const hero = image || popular.data[0]?.image;
  const subtitle =
    label.value === id
      ? t('tabs.genrePage.subtitle')
      : `${id} · ${t('tabs.genrePage.subtitle')}`;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: theme.background.primary }]}>
      <View style={styles.headerWrap}>
        <ScreenHeader title={label.value} subtitle={subtitle} />
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPad(insets) + TabBar.height },
        ]}>
        <View style={[styles.hero, { backgroundColor: theme.background.secondary }]}>
          {hero ? (
            <Image
              source={{ uri: hero }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              contentPosition="top"
              transition={150}
            />
          ) : null}
        </View>
        <View style={styles.cta}>
          <ThemedButton
            size="lg"
            fullWidth
            label={
              seenCount > 0
                ? t('tabs.genrePage.resume', { count: seenCount })
                : t('tabs.genrePage.start')
            }
            onPress={startDeck}
          />
          <ThemedText variant="bodySmall" tone="secondary" align="center">
            {t('tabs.genrePage.hint')}
          </ThemedText>
        </View>
        <View style={styles.section}>
          <ThemedText variant="titleLarge" weight="700">
            {t('tabs.genrePage.popular')}
          </ThemedText>
          {popular.status === 'loading' ? (
            <Skeleton.ListRow count={6} avatarShape="square" />
          ) : popular.status === 'error' ? (
            <View style={styles.section}>
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('tabs.discoverHome.unavailable')}
              </ThemedText>
              <ThemedButton
                variant="ghost"
                size="sm"
                label={t('common.retry')}
                onPress={load}
                style={styles.retry}
              />
            </View>
          ) : popular.data.length === 0 ? (
            <ThemedText variant="bodyMedium" tone="secondary">
              {t('tabs.genrePage.empty')}
            </ThemedText>
          ) : (
            popular.data.map((anime, index) => (
              <TrendingRow key={anime.id} anime={anime} rank={index + 1} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerWrap: { paddingHorizontal: Spacing.screenPadding },
  content: { paddingHorizontal: Spacing.screenPadding, paddingTop: Spacing.sm, gap: Spacing.lg },
  hero: { height: 168, borderRadius: Radius.xl, overflow: 'hidden' },
  cta: { gap: Spacing.sm },
  section: { gap: Spacing.sm },
  retry: { alignSelf: 'flex-start' },
});
