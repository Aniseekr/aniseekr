import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useT } from '../../libs/i18n';
import { useTheme } from '../../context/ThemeContext';
import { ThemedIconButton, ThemedText, readableTextOn } from '../themed';

interface CollectionHeaderProps {
  /** Total anime count, shown in subtitle. */
  totalAnime?: number;
  /** Number of user-visible folders (favorites + custom), shown in subtitle. */
  folderCount?: number;
  /** Cloud-upload action (enters share mode in design). */
  onPressShare?: () => void;
  /** Plus action (create folder). */
  onAddFolder?: () => void;
  /** Optional search shortcut, rendered as a small glass button. */
  onPressSearch?: () => void;
}

function CollectionHeaderComponent({
  totalAnime,
  folderCount,
  onPressShare,
  onAddFolder,
  onPressSearch,
}: CollectionHeaderProps) {
  const { theme } = useTheme();
  const t = useT();
  const onAccent = readableTextOn(theme.accent);
  const hasMeta = totalAnime !== undefined || folderCount !== undefined;
  const metaParts = [
    totalAnime !== undefined
      ? t('tabs.collectionScreen.metaAnimeCount', { count: String(totalAnime) })
      : null,
    folderCount !== undefined
      ? folderCount === 1
        ? t('tabs.collectionScreen.folderCount.one', { count: String(folderCount) })
        : t('tabs.collectionScreen.folderCount.other', { count: String(folderCount) })
      : null,
  ].filter(Boolean) as string[];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <ThemedText variant="headlineLarge" weight="800" style={styles.title}>
            {t('commonUi.collection')}
          </ThemedText>
          <ThemedText variant="bodySmall" tone="secondary" style={styles.subtitle}>
            {t('collectionUi.yourSavedAnimeLibrary')}
          </ThemedText>
          {hasMeta ? (
            <ThemedText variant="captionSmall" tone="tertiary" style={styles.metaLine}>
              {metaParts.join(' · ')}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.actionsRow}>
          {onPressSearch ? (
            <ThemedIconButton
              accessibilityLabel={t('collectionUi.searchCollection')}
              variant="glass"
              size={36}
              onPress={onPressSearch}
              icon={(c) => <MaterialIcons name="search" size={18} color={c} />}
            />
          ) : null}
          {onPressShare ? (
            <ThemedIconButton
              accessibilityLabel={t('collectionUi.shareCollection')}
              variant="glass"
              size={36}
              onPress={onPressShare}
              icon={() => (
                <MaterialIcons name="cloud-upload" size={18} color={theme.accent} />
              )}
            />
          ) : null}
          {onAddFolder ? (
            <ThemedIconButton
              accessibilityLabel={t('collectionUi.addFolder')}
              variant="solid"
              size={36}
              accent={theme.accent}
              onPress={onAddFolder}
              icon={() => <MaterialIcons name="create-new-folder" size={18} color={onAccent} />}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...Typography.headlineLarge,
    letterSpacing: -0.5,
  },
  subtitle: {
    letterSpacing: 0.1,
  },
  metaLine: {
    marginTop: 2,
    letterSpacing: 0.1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});

export const CollectionHeader = memo(CollectionHeaderComponent);
