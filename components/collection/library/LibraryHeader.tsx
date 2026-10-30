import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import type { CollectionFolder } from '../../../types';
import { LIBRARY_STATUSES, type LibrarySelection } from './useLibrary';

export function LibraryHeader({
  folders,
  selected,
  onSelect,
  onSearch,
  onMenu,
}: {
  folders: CollectionFolder[] | null;
  selected: LibrarySelection;
  onSelect: (selection: LibrarySelection) => void;
  onSearch: () => void;
  onMenu: () => void;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const total = folders?.find((folder) => folder.id === 'system_all')?.animeCount;
  const counts = Object.fromEntries(
    folders
      ?.filter((folder) => folder.isSystemFolder)
      .map((folder) => [folder.folderType, folder.animeCount]) ?? []
  );
  const statuses = [
    ...LIBRARY_STATUSES.filter((status) => status !== 'dropped' || counts.dropped > 0),
    'custom',
  ] as LibrarySelection[];
  return (
    <View style={styles.header}>
      <View style={styles.row}>
        <View style={styles.title}>
          <ThemedText variant="headlineLarge" weight="700">
            {t('tabs.collection')}
          </ThemedText>
          {total !== undefined ? (
            <ThemedText variant="caption" tone="secondary">
              {t('tabs.collectionScreen.titleCount', { count: total })}
            </ThemedText>
          ) : null}
        </View>
        <ThemedIconButton
          accessibilityLabel={t('collectionUi.searchCollection')}
          onPress={onSearch}
          icon={(color) => <Ionicons name="search" size={20} color={color} />}
        />
        <ThemedIconButton
          accessibilityLabel={t('tabs.collectionScreen.menu')}
          onPress={onMenu}
          icon={(color) => <Ionicons name="ellipsis-horizontal" size={20} color={color} />}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.chipViewport, { width }]}
        contentContainerStyle={styles.chips}>
        {statuses.map((status) => {
          const count =
            status === 'custom'
              ? folders?.filter((folder) => !folder.isSystemFolder).length
              : counts[status];
          const label = t(`tabs.collectionScreen.status.${status}`);
          return (
            <ThemedButton
              key={status}
              size="md"
              variant={selected === status ? 'primary' : 'secondary'}
              label={count === undefined ? label : `${label} ${count}`}
              haptic="selection"
              onPress={() => onSelect(status)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  header: { paddingTop: Spacing.sm, paddingBottom: Spacing.lg, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, gap: Spacing.xxs },
  chipViewport: { flexGrow: 0, marginHorizontal: -Spacing.lg },
  chips: { gap: Spacing.xs, paddingVertical: Spacing.xxs, paddingHorizontal: Spacing.lg },
});
