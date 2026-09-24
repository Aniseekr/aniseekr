import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Shadow, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useI18n, useT } from '../../libs/i18n';
import type { NewsArticle, NewsSource } from '../../libs/services/news/types';
import { newsImageSource } from '../../libs/services/news/news-image';
import { resolveLocalIntelText } from '../../libs/services/pilgrimage/local-intel/local-intel-localization';
import { LOCALITY_CARD_RADIUS } from '../pilgrimage/common/LocalityAesthetic';
import { ThemedSurface, ThemedText } from '../themed';

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
  const { language } = useI18n();
  const t = useT();
  const [imageHidden, setImageHidden] = useState(false);
  const styles = useMemo(() => makeStyles(), []);
  const imageSource = useMemo(
    () => (article.thumbnailUrl ? newsImageSource(article.thumbnailUrl) : null),
    [article.thumbnailUrl]
  );
  const sourceName = source ? resolveLocalIntelText(source.name, language).value : null;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="link"
      accessibilityLabel={article.title}
      accessibilityHint={t('news.openArticle')}
      style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedSurface padded={Spacing.md} radius={LOCALITY_CARD_RADIUS} style={styles.row}>
        <View style={styles.body}>
          <View style={styles.metaRow}>
            {sourceName ? (
              <ThemedText variant="captionSmall" weight="700" tone="secondary" numberOfLines={1}>
                {sourceName}
              </ThemedText>
            ) : null}
            <ThemedText variant="captionSmall" tone="tertiary">
              {relativeTime}
            </ThemedText>
            <Ionicons
              name="open-outline"
              size={12}
              color={theme.text.tertiary}
              style={styles.openGlyph}
            />
          </View>
          <ThemedText variant="bodyMedium" weight="700" numberOfLines={2}>
            {article.title}
          </ThemedText>
          {article.excerpt ? (
            <ThemedText variant="bodySmall" tone="secondary" numberOfLines={2}>
              {article.excerpt}
            </ThemedText>
          ) : null}
        </View>
        {/* Only real article art; no placeholder glyph when a feed ships none. */}
        {!imageHidden && imageSource ? (
          <Image
            source={imageSource}
            style={[styles.thumb, { backgroundColor: theme.background.tertiary }]}
            contentFit="cover"
            onError={() => setImageHidden(true)}
          />
        ) : null}
      </ThemedSurface>
    </Pressable>
  );
}

function makeStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Spacing.md,
      ...Shadow.subtle,
    },
    thumb: {
      width: Size.cardSmall,
      height: Size.cardSmall,
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
    },
    openGlyph: {
      marginLeft: 'auto',
    },
    pressed: {
      opacity: 0.84,
    },
  });
}
