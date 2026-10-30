import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LibraryHeader } from '../../../components/collection/library/LibraryHeader';
import { LibraryAnimeCard } from '../../../components/collection/library/LibraryAnimeCard';
import { LibraryShareMode } from '../../../components/collection/library/LibraryShareMode';
import { useLibrary } from '../../../components/collection/library/useLibrary';
import { FolderGridItem } from '../../../components/collection/FolderGrid';
import { CollectionSearchModal } from '../../../components/collection/CollectionSearchModal';
import { CreateFolderModal } from '../../../components/collection/CreateFolderModal';
import { QuickActionSheet } from '../../../components/settings/QuickActionSheet';
import { ErrorStateView } from '../../../components/common/ErrorStateView';
import { Skeleton, ThemedBottomSheet, ThemedButton, ThemedText } from '../../../components/themed';
import { useTheme } from '../../../context/ThemeContext';
import { Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import {
  collectionService,
  type FolderAnimeWithProgress,
} from '../../../libs/services/collection/collection-service';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { CollectionFolder } from '../../../types';

type Overlay =
  | { kind: 'menu' | 'search' | 'create' }
  | { kind: 'edit' | 'manage'; folder: CollectionFolder }
  | null;
type LibraryItem =
  { kind: 'anime'; item: FolderAnimeWithProgress } | { kind: 'folder'; item: CollectionFolder };

export default function CollectionScreen() {
  const { theme } = useTheme();
  const t = useT();
  const router = useRouter();
  const { visibleTabs } = useExperienceMode();
  const library = useLibrary();
  const { reload } = library;
  const { width } = useWindowDimensions();
  const cardWidth = (width - Spacing.lg * 2 - Spacing.sm * 2) / 3;
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [screenMode, setScreenMode] = useState<'collect' | 'share'>('collect');
  const customFolders = library.folders?.filter((folder) => !folder.isSystemFolder) ?? [];
  const custom = library.selected === 'custom';
  const data: LibraryItem[] = custom
    ? customFolders.map((item) => ({ kind: 'folder', item }))
    : (library.items ?? []).map((item) => ({ kind: 'anime', item }));
  const managedFolder = overlay?.kind === 'manage' ? overlay.folder : null;
  const editingFolder = overlay?.kind === 'edit' ? overlay.folder : null;
  const afterDismiss = (action: () => void) => {
    setOverlay(null);
    // iOS only presents one Modal: allow the sheet to dismiss first.
    setTimeout(action, 280);
  };
  const handleEditFolder = useCallback((folder: CollectionFolder) => {
    setOverlay({ kind: 'edit', folder });
  }, []);
  const handleSearch = useCallback(() => setOverlay({ kind: 'search' }), []);
  const handleMenu = useCallback(() => setOverlay({ kind: 'menu' }), []);
  const header = useMemo(
    () => (
      <LibraryHeader
        folders={library.folders}
        selected={library.selected}
        onSelect={library.select}
        onSearch={handleSearch}
        onMenu={handleMenu}
      />
    ),
    [library.folders, library.selected, library.select, handleSearch, handleMenu]
  );
  const handleDeleteFolder = useCallback(
    (folder: CollectionFolder) => {
      hapticsBridge.warning();
      Alert.alert(
        t('collectionUi.deleteFolderTitle'),
        t('collectionUi.deleteFolderBody', { name: folder.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await collectionService.deleteFolder(folder.id);
                  setOverlay(null);
                  await reload();
                  hapticsBridge.success();
                } catch (error) {
                  console.error('Failed to delete folder:', error);
                  Alert.alert(t('collectionUi.deleteFolderFailed'));
                }
              })();
            },
          },
        ]
      );
    },
    [reload, t]
  );
  const empty = library.error ? (
    <ErrorStateView onRetry={library.reload} />
  ) : !library.ready ? (
    <Skeleton.PosterGrid count={9} columns={3} aspectRatio={2 / 2.8} gap={Spacing.sm} />
  ) : (
    <View style={styles.empty}>
      <ThemedText variant="bodyMedium" tone="secondary" align="center">
        {t(`tabs.collectionScreen.emptyStatus.${library.selected}`)}
      </ThemedText>
      <ThemedButton
        label={custom ? t('tabs.collectionScreen.newFolder') : t('tabs.collectionScreen.explore')}
        onPress={() =>
          custom
            ? setOverlay({ kind: 'create' })
            : router.push(visibleTabs.includes('discover') ? '/(rate)' : '/search')
        }
      />
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background.primary }]}
      edges={['top']}>
      {/* Keep the horizontal rail outside the grid's vertical scroll responder. */}
      <View style={styles.header}>{header}</View>
      <FlatList<LibraryItem>
        data={library.ready ? data : []}
        numColumns={3}
        keyExtractor={(entry) => `${entry.kind}:${entry.item.id}`}
        contentContainerStyle={styles.content}
        columnWrapperStyle={styles.row}
        refreshControl={
          <RefreshControl
            refreshing={library.refreshing}
            onRefresh={library.refresh}
            tintColor={theme.accent}
          />
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          data.length > 0 && library.error ? <ErrorStateView onRetry={library.reload} /> : undefined
        }
        renderItem={({ item: entry }) => (
          <View style={{ width: cardWidth }}>
            {entry.kind === 'anime' ? (
              <LibraryAnimeCard item={entry.item} />
            ) : (
              <FolderGridItem
                folder={entry.item}
                cover={entry.item.coverUrl}
                onPress={() =>
                  router.push({
                    pathname: '/collection/[id]',
                    params: { id: entry.item.id, name: entry.item.name },
                  })
                }
                onLongPress={() => handleEditFolder(entry.item)}
                onManage={() => setOverlay({ kind: 'manage', folder: entry.item })}
              />
            )}
          </View>
        )}
      />
      <ThemedBottomSheet visible={overlay?.kind === 'menu'} onClose={() => setOverlay(null)}>
        <View style={styles.menu}>
          <ThemedButton
            variant="secondary"
            label={t('tabs.collectionScreen.newFolder')}
            onPress={() => afterDismiss(() => setOverlay({ kind: 'create' }))}
          />
          <ThemedButton
            variant="secondary"
            label={t('collectionUi.shareCollection')}
            onPress={() => afterDismiss(() => setScreenMode('share'))}
          />
        </View>
      </ThemedBottomSheet>
      <CreateFolderModal
        visible={overlay?.kind === 'create' || overlay?.kind === 'edit'}
        onClose={() => setOverlay(null)}
        onCreated={() => {
          void library.reload();
        }}
        onUpdate={(id, updates) => collectionService.updateFolder(id, updates)}
        editing={
          editingFolder
            ? {
                id: editingFolder.id,
                name: editingFolder.name,
                icon: editingFolder.icon,
                isR18: editingFolder.isR18,
              }
            : undefined
        }
      />
      <QuickActionSheet
        visible={managedFolder !== null}
        onClose={() => setOverlay(null)}
        title={managedFolder?.name ?? t('collectionUi.manageFolder')}
        actions={
          managedFolder
            ? [
                {
                  key: 'rename',
                  label: t('collectionUi.renameFolder'),
                  icon: 'pencil-outline',
                  onPress: () => afterDismiss(() => handleEditFolder(managedFolder)),
                },
                {
                  key: 'delete',
                  label: t('collectionUi.deleteFolder'),
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => afterDismiss(() => handleDeleteFolder(managedFolder)),
                },
              ]
            : []
        }
      />
      <CollectionSearchModal
        visible={overlay?.kind === 'search'}
        onClose={() => setOverlay(null)}
        folders={library.folders ?? []}
      />
      <LibraryShareMode active={screenMode === 'share'} onClose={() => setScreenMode('collect')} />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: 160 },
  row: { gap: Spacing.sm, marginBottom: Spacing.md },
  empty: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  menu: { gap: Spacing.sm },
});
