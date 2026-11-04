// What a photo import found: how many landed on pilgrimage spots, per work,
// and how many carried no location. Tapping a work opens its folder.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../../../context/ThemeContext';
import { ThemedIconButton, ThemedSurface, ThemedText } from '../../themed';
import { Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import type { PhotoImportSummary } from '../../../libs/services/pilgrimage/photo-import';

interface ImportResultCardProps {
  summary: PhotoImportSummary;
  onOpenWork: (workKey: string) => void;
  onDismiss: () => void;
}

function ImportResultCardImpl({ summary, onOpenWork, onDismiss }: ImportResultCardProps) {
  const t = useT();
  const { theme } = useTheme();
  const notes = [
    summary.matched > 0 ? t('pilgrimage.album.importMatched', { count: summary.matched }) : null,
    summary.noPlace > 0 ? t('pilgrimage.album.importNoPlace', { count: summary.noPlace }) : null,
    summary.duplicates > 0 && summary.imported > 0
      ? t('pilgrimage.album.importDuplicates', { count: summary.duplicates })
      : null,
  ].filter((note): note is string => note !== null);
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
      <ThemedSurface variant="card" padded style={styles.card}>
        <View style={styles.header}>
          <Ionicons name="images-outline" size={18} color={theme.accent} />
          <View style={styles.headerText}>
            <ThemedText variant="bodyMedium" weight="700">
              {summary.imported > 0
                ? t('pilgrimage.album.importResultTitle', { count: summary.imported })
                : t('pilgrimage.album.importDuplicates', { count: summary.duplicates })}
            </ThemedText>
            {notes.length ? (
              <ThemedText variant="captionSmall" tone="secondary">
                {notes.join(' · ')}
              </ThemedText>
            ) : null}
          </View>
          <ThemedIconButton
            variant="ghost"
            accessibilityLabel={t('pilgrimage.album.dismiss')}
            icon={(color) => <Ionicons name="close" size={16} color={color} />}
            onPress={onDismiss}
          />
        </View>
        {summary.works.map((work) => (
          <Pressable
            key={work.workKey}
            accessibilityRole="button"
            onPress={() => onOpenWork(work.workKey)}
            style={({ pressed }) => [
              styles.workRow,
              { borderTopColor: theme.glassBorder, opacity: pressed ? 0.8 : 1 },
            ]}>
            <View style={styles.workText}>
              <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
                {work.title}
              </ThemedText>
              {work.spotNames.length ? (
                <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                  {work.spotNames.join(' · ')}
                </ThemedText>
              ) : null}
            </View>
            <ThemedText variant="captionSmall" weight="700" style={{ color: theme.accent }}>
              {t('pilgrimage.album.importWorkPhotos', { count: work.photos })}
            </ThemedText>
            <Ionicons name="chevron-forward" size={14} color={theme.text.tertiary} />
          </Pressable>
        ))}
        {summary.imported > 0 && summary.matched === 0 ? (
          <ThemedText variant="captionSmall" tone="tertiary">
            {t('pilgrimage.album.importNoMatch')}
          </ThemedText>
        ) : null}
      </ThemedSurface>
    </Animated.View>
  );
}

export const ImportResultCard = memo(ImportResultCardImpl);

const styles = StyleSheet.create({
  card: { gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerText: { flex: 1, gap: Spacing.xxs },
  workRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    minHeight: 44,
  },
  workText: { flex: 1, gap: 2 },
});
