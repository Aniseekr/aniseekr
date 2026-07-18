import { useCallback, useMemo } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated from 'react-native-reanimated';

import { NewsArticleRow } from '../../../../components/news/NewsArticleRow';
import {
  Skeleton,
  ThemedButton,
  ThemedIconButton,
  ThemedText,
} from '../../../../components/themed';
import { Radius, Spacing } from '../../../../constants/DesignSystem';
import { useTheme } from '../../../../context/ThemeContext';
import { useNewsStream } from '../../../../hooks/useNewsStream';
import { useT } from '../../../../libs/i18n';
import { getNewsSource } from '../../../../libs/services/news/news-sources';
import { listItemEnter } from '../../../../libs/animations/presets';
import { formatNewsRelativeTime } from '../../../../libs/services/news/news-relative-time';
import { isSafeArticleUrl } from '../../../../libs/services/news/news-url';

export default function NewsStreamScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);
  const { snapshot, loading, refreshing, error, refresh } = useNewsStream();

  const relativeTime = useCallback(
    (publishedAt: number) => formatNewsRelativeTime(publishedAt, t),
    [t]
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}>
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
      </ScrollView>
    </SafeAreaView>
  );
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
    empty: {
      alignItems: 'center',
      gap: Spacing.sm,
      borderWidth: 1,
      borderRadius: Radius.lg,
      padding: Spacing.xl,
    },
  });
}
