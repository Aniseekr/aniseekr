import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';
import type { NewsSource } from '../../libs/services/news/types';
import { ThemedButton, ThemedSurface, ThemedText } from '../themed';

export function NewsSourceRow({
  source,
  followed,
  onToggle,
}: {
  source: NewsSource;
  followed: boolean;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(), []);

  return (
    <ThemedSurface padded={Spacing.md} radius={Radius.lg} style={styles.row}>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={1}>
            {source.name.en ?? source.name.ja}
          </ThemedText>
          {source.recommended ? (
            <View style={[styles.badge, { backgroundColor: theme.background.tertiary }]}>
              <ThemedText variant="captionSmall" tone="secondary" weight="700">
                {t('news.recommended')}
              </ThemedText>
            </View>
          ) : null}
        </View>
        <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
          {source.homepageUrl}
        </ThemedText>
      </View>
      <ThemedButton
        label={followed ? t('news.following') : t('news.follow')}
        variant={followed ? 'secondary' : 'primary'}
        size="sm"
        onPress={onToggle}
      />
    </ThemedSurface>
  );
}

function makeStyles() {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
    },
    body: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.xs,
      minWidth: 0,
    },
    badge: {
      borderRadius: Radius.full,
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
    },
  });
}
