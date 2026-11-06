import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Skeleton, ThemedText } from '../themed';
import { TrendingRow } from '../rate/discover/DiscoverAnimeCards';
import type { Anime } from '../rate/types';
import { Spacing } from '../../constants/DesignSystem';
import { AnimeRepository } from '../../libs/repositories/anime-repository';
import { useT } from '../../libs/i18n';

const LIMIT = 8;

/** Empty-query search: this week's real AniList trending list, one tap to detail. */
export function TrendingSuggestions() {
  const t = useT();
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; data: Anime[] }>(
    () => {
      const cached = AnimeRepository.getTrendingAnimeSync();
      return cached ? { status: 'ready', data: cached } : { status: 'loading', data: [] };
    }
  );
  useEffect(() => {
    if (state.status === 'ready') return;
    let active = true;
    AnimeRepository.getTrendingAnime().then(
      (data) => active && setState({ status: 'ready', data }),
      () => active && setState({ status: 'error', data: [] })
    );
    return () => {
      active = false;
    };
  }, [state.status]);
  if (state.status === 'error' || (state.status === 'ready' && state.data.length === 0)) {
    return null;
  }
  return (
    <View style={styles.section}>
      <ThemedText variant="titleMedium" weight="700">
        {t('tabs.discoverHome.trending')}
      </ThemedText>
      {state.status === 'loading' ? (
        <Skeleton.ListRow count={5} avatarShape="square" />
      ) : (
        state.data
          .slice(0, LIMIT)
          .map((anime, index) => <TrendingRow key={anime.id} anime={anime} rank={index + 1} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.xxs },
});
