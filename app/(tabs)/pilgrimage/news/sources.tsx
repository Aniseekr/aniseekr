import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { NewsSourceRow } from '../../../../components/news/NewsSourceRow';
import { ThemedIconButton, ThemedText } from '../../../../components/themed';
import { Spacing } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { useT } from '../../../../libs/i18n';
import {
  followSource,
  loadFollowedSourceIdsSync,
  saveFollowedSourceIds,
  unfollowSource,
} from '../../../../libs/services/news/news-follows';
import { getAllNewsSources } from '../../../../libs/services/news/news-sources';
import type { NewsCategory, NewsSource } from '../../../../libs/services/news/types';

const CATEGORY_ORDER: NewsCategory[] = ['pilgrimage', 'event', 'news', 'goods', 'industry'];

export default function NewsSourcesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  const [followed, setFollowed] = useState(loadFollowedSourceIdsSync);
  const followedSet = useMemo(() => new Set(followed), [followed]);
  const grouped = useMemo(() => groupSources(getAllNewsSources()), []);

  const toggle = useCallback(
    (source: NewsSource) => {
      const next = followedSet.has(source.id)
        ? unfollowSource(followed, source.id)
        : followSource(followed, source.id);
      setFollowed(next);
      saveFollowedSourceIds(next);
    },
    [followed, followedSet]
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background.primary }]} edges={['top']}>
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
            {t('news.sourcesTitle')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary">
            {t('news.sourcesSubtitle')}
          </ThemedText>
        </View>
      </View>

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}>
        {CATEGORY_ORDER.map((category) => {
          const sources = grouped.get(category) ?? [];
          if (sources.length === 0) return null;
          return (
            <View key={category} style={styles.section}>
              <ThemedText variant="captionSmall" tone="tertiary" weight="800">
                {t(`news.category.${category}`)}
              </ThemedText>
              {sources.map((source) => (
                <NewsSourceRow
                  key={source.id}
                  source={source}
                  followed={followedSet.has(source.id)}
                  onToggle={() => toggle(source)}
                />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function groupSources(sources: readonly NewsSource[]): Map<NewsCategory, NewsSource[]> {
  const map = new Map<NewsCategory, NewsSource[]>();
  for (const source of sources) {
    const rows = map.get(source.category) ?? [];
    rows.push(source);
    map.set(source.category, rows);
  }
  return map;
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
      gap: Spacing.lg,
    },
    section: {
      gap: Spacing.sm,
    },
  });
}
