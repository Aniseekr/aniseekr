import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Radius, Shadow, Size, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useI18n, useT } from '../../libs/i18n';
import type { NewsArticle, NewsSource } from '../../libs/services/news/types';
import { newsImageSource } from '../../libs/services/news/news-image';
import { resolveLocalIntelText } from '../../libs/services/pilgrimage/local-intel/local-intel-localization';
import {
  LOCALITY_CARD_RADIUS,
  LocalityCardDecor,
  LocalityMiniStamp,
} from '../pilgrimage/common/LocalityAesthetic';
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
    <ThemedSurface padded={Spacing.md} radius={LOCALITY_CARD_RADIUS} style={styles.row}>
      <LocalityCardDecor accent={theme.status.info} tape="right" />
      {!imageHidden && imageSource ? (
        <View style={[styles.thumbFrame, { borderColor: theme.status.info }]}>
          <Image
            source={imageSource}
            style={styles.thumb}
            contentFit="cover"
            onError={() => setImageHidden(true)}
          />
        </View>
      ) : (
        <LocalityMiniStamp accent={theme.status.info} icon="newspaper-outline" />
      )}
      <View style={styles.body}>
        <View style={styles.metaRow}>
          {sourceName ? (
            <View style={[styles.chip, { backgroundColor: theme.background.tertiary }]}>
              <ThemedText variant="captionSmall" weight="700" numberOfLines={1}>
                {sourceName}
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
      position: 'relative',
      flexDirection: 'row',
      gap: Spacing.md,
      paddingTop: Spacing.lg,
      ...Shadow.subtle,
    },
    thumbFrame: {
      width: Size.cardSmall,
      height: Size.cardSmall,
      borderRadius: Radius.md,
      borderWidth: 1.5,
      padding: Spacing.xxs,
      transform: [{ rotate: '-1deg' }],
    },
    thumb: {
      width: '100%',
      height: '100%',
      borderRadius: Radius.sm,
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
