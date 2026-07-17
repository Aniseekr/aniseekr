import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import type { NewsArticle, NewsSource } from '../../libs/services/news/types';
import { newsImageSource } from '../../libs/services/news/news-image';
import { ThemedButton, ThemedSurface, ThemedText } from '../themed';

export function NewsArticleRow({
  article,
  source,
  relativeTime,
  onOpen,
}: {
  article: NewsArticle;
  source: NewsSource | null;
  relativeTime: string;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const [imageHidden, setImageHidden] = useState(false);
  const styles = useMemo(() => makeStyles(), []);

  return (
    <ThemedSurface padded={Spacing.md} radius={Radius.lg} style={styles.row}>
      {!imageHidden && article.thumbnailUrl ? (
        <Image
          source={newsImageSource(article.thumbnailUrl)}
          style={styles.thumb}
          contentFit="cover"
          onError={() => setImageHidden(true)}
        />
      ) : null}
      <View style={styles.body}>
        <View style={styles.metaRow}>
          {source ? (
            <View style={[styles.chip, { backgroundColor: theme.background.tertiary }]}>
              <ThemedText variant="captionSmall" weight="700" numberOfLines={1}>
                {source.name.en ?? source.name.ja}
              </ThemedText>
            </View>
          ) : null}
          <ThemedText variant="captionSmall" tone="tertiary">
            {relativeTime}
          </ThemedText>
        </View>
        <ThemedText variant="bodyMedium" weight="800" numberOfLines={2}>
          {article.title}
        </ThemedText>
        {article.excerpt ? (
          <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
            {article.excerpt}
          </ThemedText>
        ) : null}
        <ThemedButton
          label={t('news.openArticle')}
          variant="secondary"
          size="sm"
          onPress={onOpen}
          icon={<Ionicons name="open-outline" size={15} color={theme.text.primary} />}
          style={styles.openButton}
        />
      </View>
    </ThemedSurface>
  );
}

function makeStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    thumb: {
      width: 86,
      height: 86,
      borderRadius: Radius.md,
    },
    body: {
      flex: 1,
      gap: Spacing.xs,
      minWidth: 0,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      minHeight: 22,
    },
    chip: {
      maxWidth: 148,
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 4,
    },
    openButton: {
      alignSelf: 'flex-start',
      marginTop: Spacing.xs,
    },
  });
}
