/* eslint-disable react-hooks/set-state-in-effect -- Existing collection loaders populate local state on mount/focus; Phase 3 keeps data flow unchanged. */
import {
  Alert,
  View,
  ScrollView,
  RefreshControl,
  Pressable,
  Share,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { trackingService } from '../../../libs/services/tracking/tracking-service';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { captureRef } from 'react-native-view-shot';
import { CollectionHeader } from '../../../components/collection/CollectionHeader';
import { FolderGrid } from '../../../components/collection/FolderGrid';
import {
  CollectionAnimeGrid,
  type CollectionAnimeCardItem,
} from '../../../components/collection/CollectionAnimeGrid';
import { CollectionSearchModal } from '../../../components/collection/CollectionSearchModal';
import { CollectionFloatingActionBar } from '../../../components/collection/CollectionFloatingActionBar';
import { ShareImageRenderer } from '../../../components/collection/ShareImageRenderer';
import { ShareListEditor } from '../../../components/collection/ShareListEditor';
import { CollectionFolder } from '../../../types';
import { collectionService } from '../../../libs/services/collection/collection-service';
import { pushAnimeDetail } from '../../../libs/utils/navigate-to-anime';
import { CreateFolderModal } from '../../../components/collection/CreateFolderModal';
import { QuickActionSheet, type QuickAction } from '../../../components/settings/QuickActionSheet';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  loadCollectionSortModeSync,
  saveCollectionSortMode,
  type CollectionSortMode,
} from '../../../libs/services/collection-prefs';
import { Colors, Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { LocalDB } from '../../../libs/db';
import { Skeleton, ThemedButton, ThemedText, readableTextOn } from '../../../components/themed';
import { ErrorStateView } from '../../../components/common/ErrorStateView';
import { loadUserPrefsSync, subscribeUserPrefs } from '../../../libs/services/user-prefs';
import { useTheme } from '../../../context/ThemeContext';
import {
  buildShareTemplate,
  type ShareEntry,
  type ShareSourceItem,
  type ShareTemplate,
  type ShareTemplateBuild,
} from '../../../libs/services/collection/share-templates';
import { UserRepository } from '../../../libs/repositories/user-repository';
import { sameArrayBy } from '../../../libs/utils/state-array';
import { useT } from '../../../libs/i18n';

type SortMode = CollectionSortMode;
type ScreenMode = 'collect' | 'share';

const ANIME_PREVIEW_LIMIT = 6;

// Rule 10: warm re-entries render real folders/anime on frame 1 by seeding
// state from the last loaded values; the skeleton is cold-launch-only. Module
// scope survives tab unmount/remount (same pattern as [id].tsx's
// folderSnapshotCache). Without this, every open flashed "No folders yet" +
// a wrong "create your first folder" CTA until SQLite resolved.
let collectionIndexSnapshot: {
  collections: CollectionFolder[];
  animeCards: CollectionAnimeCardItem[];
} | null = null;

type AnimeCardRow = {
  anime_id: string;
  title: string | null;
  image_url: string | null;
  progress: number | null;
  total_episodes: number | null;
  status: string;
};

async function fetchAnimeCards(): Promise<CollectionAnimeCardItem[]> {
  const db = await LocalDB.getDatabase();
  const rows = await db.getAllAsync<AnimeCardRow>(
    `SELECT anime_id, title, image_url, progress, total_episodes, status
       FROM user_anime
      WHERE title IS NOT NULL
      ORDER BY COALESCE(updated_at, 0) DESC`
  );

  return rows.map((r) => ({
    id: r.anime_id,
    title: r.title || 'Untitled',
    imageUrl: r.image_url,
    progress: r.progress ?? 0,
    totalEpisodes: r.total_episodes ?? null,
    status: r.status,
  }));
}

function sameCollections(current: CollectionFolder[], next: CollectionFolder[]): boolean {
  return sameArrayBy(current, next, (folder) => [
    folder.id,
    folder.name,
    folder.icon,
    folder.animeCount,
    folder.coverUrl,
    folder.folderType,
    folder.isSystemFolder,
    folder.isR18,
    folder.isShared,
    folder.sharedBy,
    folder.sortOrder,
    folder.createdAt.getTime(),
  ]);
}

function sameAnimeCards(
  current: CollectionAnimeCardItem[],
  next: CollectionAnimeCardItem[]
): boolean {
  return sameArrayBy(current, next, (item) => [
    item.id,
    item.title,
    item.imageUrl,
    item.progress,
    item.totalEpisodes,
    item.status,
  ]);
}

export default function CollectionScreen() {
  const { top } = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  // Seed from MMKV so the collection grid renders in the user's chosen sort
  // mode on frame 1 instead of flashing through `newest` first.
  const [sortMode, setSortMode] = useState<SortMode>(loadCollectionSortModeSync);
  const [collections, setCollections] = useState<CollectionFolder[]>(
    () => collectionIndexSnapshot?.collections ?? []
  );
  const [foldersError, setFoldersError] = useState(false);
  const [cardsError, setCardsError] = useState(false);
  // False only on a true cold launch — gates the empty states so they can
  // never render before the first load completes (rule 8: an unloaded
  // library must not claim to be empty).
  const [loaded, setLoaded] = useState(() => collectionIndexSnapshot !== null);
  // Seeded sync (frame 1 correct) and kept live via the prefs subscription so
  // toggling Settings → 顯示空的系統資料夾 applies without a tab reload.
  const [showEmptySystemFolders, setShowEmptySystemFolders] = useState(
    () => loadUserPrefsSync().showEmptySystemFolders
  );

  useEffect(() => {
    return subscribeUserPrefs((prefs) => {
      setShowEmptySystemFolders((prev) =>
        prev === prefs.showEmptySystemFolders ? prev : prefs.showEmptySystemFolders
      );
    });
  }, []);
  const [animeCards, setAnimeCards] = useState<CollectionAnimeCardItem[]>(
    () => collectionIndexSnapshot?.animeCards ?? []
  );
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<CollectionFolder | null>(null);
  const [managedFolder, setManagedFolder] = useState<CollectionFolder | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>('collect');
  const [shareSource, setShareSource] = useState<ShareSourceItem[]>([]);
  const [shareBuild, setShareBuild] = useState<ShareTemplateBuild | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const rendererRef = useRef<View>(null);
  const collectionLoadRef = useRef(0);
  const animeCardsLoadRef = useRef(0);
  const router = useRouter();

  const loadCollectionData = useCallback(async () => {
    const collectionRequestId = ++collectionLoadRef.current;
    const animeCardsRequestId = ++animeCardsLoadRef.current;
    const [foldersResult, cardsResult] = await Promise.allSettled([
      collectionService.getFolders(),
      fetchAnimeCards(),
    ]);

    if (collectionRequestId === collectionLoadRef.current) {
      if (foldersResult.status === 'fulfilled') {
        setCollections((prev) =>
          sameCollections(prev, foldersResult.value) ? prev : foldersResult.value
        );
        setFoldersError(false);
      } else {
        console.error('Failed to load collection:', foldersResult.reason);
        setFoldersError(true);
      }
    }

    if (animeCardsRequestId === animeCardsLoadRef.current) {
      if (cardsResult.status === 'fulfilled') {
        setAnimeCards((prev) =>
          sameAnimeCards(prev, cardsResult.value) ? prev : cardsResult.value
        );
        setCardsError(false);
      } else {
        console.error('Failed to load anime cards:', cardsResult.reason);
        setAnimeCards((prev) => (prev.length === 0 ? prev : []));
        setCardsError(true);
      }
    }

    if (collectionRequestId === collectionLoadRef.current) {
      // Snapshot only fully-loaded data — a failed half must not be replayed
      // as truth on the next mount.
      if (foldersResult.status === 'fulfilled' && cardsResult.status === 'fulfilled') {
        collectionIndexSnapshot = {
          collections: foldersResult.value,
          animeCards: cardsResult.value,
        };
      }
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadCollectionData();
  }, [loadCollectionData]);

  // Refresh counts + cards whenever the tab regains focus, so adds
  // from other tabs (e.g. Bangumi wishlist) propagate without a manual pull.
  // The skipFirst ref avoids double-loading on initial mount (the effect
  // above already kicked off the first load).
  const focusInitRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!focusInitRef.current) {
        focusInitRef.current = true;
        return;
      }
      loadCollectionData();
    }, [loadCollectionData])
  );

  // Subscribe to tracking-set changes — adds/removes that happen from any
  // screen invalidate the cache and fire here, so counts update in real time
  // (no need to switch tabs or pull-to-refresh).
  useEffect(() => {
    return trackingService.onTrackedIdsChange(() => {
      loadCollectionData();
    });
  }, [loadCollectionData]);

  // Skip the very first write — `sortMode` was just seeded from MMKV, so
  // there's nothing to persist. Every subsequent change is a user action.
  const sortModeFirstRunRef = useRef(true);
  useEffect(() => {
    if (sortModeFirstRunRef.current) {
      sortModeFirstRunRef.current = false;
      return;
    }
    saveCollectionSortMode(sortMode);
  }, [sortMode]);

  useEffect(() => {
    let cancelled = false;
    UserRepository.getProfile()
      .then((profile) => {
        if (!cancelled && profile?.username) {
          setUsername(profile.username);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadShareSource = useCallback(async () => {
    try {
      const db = await LocalDB.getDatabase();
      const rows = await db.getAllAsync<{
        anime_id: string;
        title: string | null;
        image_url: string | null;
        score: number | null;
        started_at: number | null;
        completed_at: number | null;
        status: string | null;
      }>(
        'SELECT anime_id, title, image_url, score, started_at, completed_at, status FROM user_anime'
      );
      const items: ShareSourceItem[] = rows.flatMap((r) => {
        if (!r.title) return [];
        const ts = r.completed_at ?? r.started_at ?? null;
        return [
          {
            id: r.anime_id,
            title: r.title || 'Untitled',
            coverUrl: r.image_url || undefined,
            score: typeof r.score === 'number' ? r.score : undefined,
            year: ts ? new Date(ts).getFullYear() : undefined,
            status: r.status ?? undefined,
          },
        ];
      });
      setShareSource(items);
    } catch (error) {
      console.error('Failed to load share source:', error);
      setShareSource([]);
    }
  }, []);

  useEffect(() => {
    if (screenMode === 'share') {
      loadShareSource();
    }
  }, [screenMode, loadShareSource]);

  const handleSelectTemplate = useCallback(
    (template: ShareTemplate) => {
      const build = buildShareTemplate(template.id, shareSource, { username });
      setShareBuild(build);
      setShareError(null);
      if (template.needsManualPick) {
        setEditorOpen(true);
      }
    },
    [shareSource, username]
  );

  const handleSaveEntries = useCallback(
    (entries: ShareEntry[]) => {
      if (!shareBuild) return;
      setShareBuild({ ...shareBuild, entries });
      setEditorOpen(false);
    },
    [shareBuild]
  );

  const handleCancelShare = useCallback(() => {
    setScreenMode('collect');
    setShareBuild(null);
    setEditorOpen(false);
    setShareError(null);
  }, []);

  const handleConfirmShare = useCallback(async () => {
    if (!shareBuild) {
      setShareError(t('tabs.collectionScreen.share.pickTemplate'));
      return;
    }
    if (shareBuild.entries.length === 0) {
      setShareError(t('tabs.collectionScreen.share.addAtLeastOne'));
      return;
    }
    if (!rendererRef.current) {
      setShareError(t('tabs.collectionScreen.share.rendererNotReady'));
      return;
    }
    setCapturing(true);
    setShareError(null);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const uri = await captureRef(rendererRef, {
        format: 'png',
        quality: 0.95,
        result: 'tmpfile',
      });
      hapticsBridge.success();
      await Share.share(
        {
          url: uri,
          message: t('tabs.collectionScreen.share.myTemplateOnAniseekr', {
            template: shareBuild.template.title,
          }),
          title: `Aniseekr · ${shareBuild.template.title}`,
        },
        {
          dialogTitle: t('tabs.collectionScreen.share.dialogTitle', {
            template: shareBuild.template.title,
          }),
        }
      );
    } catch (error) {
      console.error('Share capture failed:', error);
      setShareError(t('tabs.collectionScreen.share.couldNotRender'));
    } finally {
      setCapturing(false);
    }
  }, [shareBuild, t]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    collections.forEach((folder) => {
      if (folder.id === 'system_all') counts['All'] = folder.animeCount;
      if (folder.folderType === 'favorites') counts['Favorites'] = folder.animeCount;
      if (folder.folderType === 'watching') counts['Watching'] = folder.animeCount;
      if (folder.folderType === 'completed') counts['Done'] = folder.animeCount;
      if (folder.folderType === 'dropped') counts['Dropped'] = folder.animeCount;
      if (folder.folderType === 'wishlist') counts['Planned'] = folder.animeCount;
    });
    return counts;
  }, [collections]);

  const totalCount = categoryCounts.All ?? 0;

  const userFolderCount = useMemo(
    () => collections.filter((f) => !f.isSystemFolder || f.folderType === 'favorites').length,
    [collections]
  );

  const handleEditFolder = useCallback((folder: CollectionFolder) => {
    setEditingFolder(folder);
    setCreateModalVisible(true);
  }, []);

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
                  collectionIndexSnapshot = null;
                  setManagedFolder(null);
                  await loadCollectionData();
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
    [loadCollectionData, t]
  );

  const folderManagementActions = useMemo<QuickAction[]>(() => {
    if (!managedFolder) return [];
    return [
      {
        key: 'rename',
        label: t('collectionUi.renameFolder'),
        icon: 'pencil-outline',
        onPress: () => {
          // Wait for the action sheet Modal to fully dismiss before presenting
          // the edit modal — iOS only allows one Modal on-screen at a time
          // (same workaround as settings.tsx → notification manager).
          const folder = managedFolder;
          setTimeout(() => handleEditFolder(folder), 280);
        },
      },
      {
        key: 'delete',
        label: t('collectionUi.deleteFolder'),
        icon: 'trash-outline',
        destructive: true,
        onPress: () => handleDeleteFolder(managedFolder),
      },
    ];
  }, [handleDeleteFolder, handleEditFolder, managedFolder, t]);

  const handleSort = useCallback((mode: SortMode) => {
    setSortMode(mode);
  }, []);

  const visibleFolders = useMemo(() => {
    // Hide the synthetic 'system_all' folder — its count duplicates the
    // overview card, so showing it as a tile is just noise. Empty SYSTEM
    // folders are hidden too (they unbalance the grid; they reappear the
    // moment they gain content). Custom folders always show — a just-created
    // folder must not vanish.
    const baseFolders = collections.filter((f) => {
      if (f.id === 'system_all') return false;
      if (!showEmptySystemFolders && f.isSystemFolder && f.animeCount === 0) return false;
      return true;
    });
    return [...baseFolders].sort((a, b) => {
      if (sortMode === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (sortMode === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (sortMode === 'count') return b.animeCount - a.animeCount;
      return 0;
    });
  }, [collections, sortMode, showEmptySystemFolders]);

  const folderCovers = useMemo(() => {
    const map: { [id: string]: string | undefined } = {};
    visibleFolders.forEach((f) => {
      map[f.id] = f.coverUrl;
    });
    return map;
  }, [visibleFolders]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCollectionData().finally(() => {
      setRefreshing(false);
    });
  }, [loadCollectionData]);

  const refreshCollectionData = useCallback(() => {
    void loadCollectionData();
  }, [loadCollectionData]);

  const enterShareMode = useCallback(() => {
    hapticsBridge.tap();
    setScreenMode('share');
  }, []);

  const sortOptions: { label: string; value: SortMode }[] = useMemo(
    () => [
      { label: t('tabs.collectionScreen.sort.newest'), value: 'newest' },
      { label: t('tabs.collectionScreen.sort.oldest'), value: 'oldest' },
      { label: t('tabs.collectionScreen.sort.count'), value: 'count' },
    ],
    [t]
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background.primary, paddingTop: top }]}>
      <LinearGradient
        colors={[theme.background.primary, theme.background.secondary, theme.background.primary]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[styles.glowAccent, { backgroundColor: `${theme.accent}26` }]}
        pointerEvents="none"
      />
      <View style={styles.container}>
        {screenMode === 'collect' ? (
          <CollectionHeader
            totalAnime={totalCount}
            folderCount={userFolderCount}
            onAddFolder={() => setCreateModalVisible(true)}
            onPressShare={enterShareMode}
            onPressSearch={() => setSearchOpen(true)}
          />
        ) : null}

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              tintColor={theme.accent}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }>
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="titleMedium" weight="700">
                {t('tabs.collectionScreen.myFolders')}
              </ThemedText>
              <Pressable
                onPress={() => {
                  hapticsBridge.tap();
                  setCreateModalVisible(true);
                }}
                hitSlop={8}
                style={styles.sectionHeaderRight}>
                <ThemedText variant="captionSmall" tone="secondary">
                  {visibleFolders.length === 1
                    ? t('tabs.collectionScreen.folderCount.one', {
                        count: String(visibleFolders.length),
                      })
                    : t('tabs.collectionScreen.folderCount.other', {
                        count: String(visibleFolders.length),
                      })}
                </ThemedText>
                <MaterialIcons name="chevron-right" size={14} color={theme.text.tertiary} />
              </Pressable>
            </View>

            <View style={styles.sortRow}>
              {sortOptions.map((option) => {
                const isActive = sortMode === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => handleSort(option.value)}
                    style={[
                      styles.sortChip,
                      {
                        backgroundColor: isActive ? theme.accent : theme.background.tertiary,
                        borderColor: isActive ? theme.accent : theme.glassBorder,
                      },
                    ]}>
                    <ThemedText
                      variant="captionSmall"
                      weight={isActive ? '700' : '600'}
                      style={{
                        color: isActive ? theme.background.primary : theme.text.secondary,
                      }}>
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {!loaded ? (
              <Skeleton.PosterGrid count={4} columns={2} aspectRatio={0.85} gap={12} />
            ) : visibleFolders.length > 0 ? (
              <FolderGrid
                folders={visibleFolders}
                covers={folderCovers}
                onPressFolder={(folder) =>
                  router.push(`/collection/${folder.id}?name=${folder.name}`)
                }
                onLongPressFolder={(folder) => {
                  if (!folder.isSystemFolder) handleEditFolder(folder);
                }}
                onManageFolder={setManagedFolder}
              />
            ) : foldersError ? (
              // Rule 8: a failed folder load must not masquerade as "no folders yet".
              <ErrorStateView onRetry={loadCollectionData} style={styles.emptyState} />
            ) : (
              <View style={styles.emptyState}>
                <ThemedText variant="titleMedium" weight="700" align="center">
                  {t('tabs.collectionScreen.emptyFolderTitle.all')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {t('tabs.collectionScreen.emptyFolderBody.all')}
                </ThemedText>
                <ThemedButton
                  label={t('tabs.collectionScreen.newFolder')}
                  icon={
                    <MaterialIcons
                      name="create-new-folder"
                      size={16}
                      color={readableTextOn(theme.accent)}
                    />
                  }
                  onPress={() => setCreateModalVisible(true)}
                  size="sm"
                  style={styles.emptyAction}
                />
              </View>
            )}
          </View>

          {/* One compact line replaces the old overview card + stats button +
              tips block — folders and anime stay above the fold. */}
          <View style={styles.statsButtonRow}>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                router.push('/collection/stats');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('tabs.collectionScreen.libraryStats')}
              style={({ pressed }) => [
                styles.statsButton,
                {
                  backgroundColor: theme.background.secondary,
                  borderColor: theme.glassBorder,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}>
              <MaterialIcons name="bar-chart" size={16} color={theme.accent} />
              <ThemedText variant="titleSmall" weight="600" style={styles.statsButtonLabel}>
                {t('tabs.collectionScreen.statsLine', {
                  total: String(totalCount),
                  watching: String(categoryCounts.Watching ?? 0),
                })}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary" weight="600">
                {t('tabs.collectionScreen.libraryStats')}
              </ThemedText>
              <MaterialIcons name="chevron-right" size={18} color={theme.text.tertiary} />
            </Pressable>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="titleMedium" weight="700">
                {t('tabs.collectionScreen.recentAnime')}
              </ThemedText>
              {animeCards.length > ANIME_PREVIEW_LIMIT ? (
                <Pressable
                  onPress={() => {
                    hapticsBridge.tap();
                    router.push(
                      `/collection/system_all?name=${encodeURIComponent(
                        t('tabs.collectionScreen.categoryAll')
                      )}`
                    );
                  }}
                  hitSlop={8}
                  style={styles.sectionHeaderRight}>
                  <ThemedText variant="captionSmall" tone="secondary" weight="600">
                    {t('tabs.collectionScreen.seeAllCount', { count: String(animeCards.length) })}
                  </ThemedText>
                  <MaterialIcons name="chevron-right" size={14} color={theme.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
            {!loaded ? (
              <Skeleton.PosterGrid count={2} columns={2} aspectRatio={1.4} gap={12} />
            ) : animeCards.length > 0 ? (
              <CollectionAnimeGrid
                items={animeCards.slice(0, ANIME_PREVIEW_LIMIT)}
                onPressItem={(item) =>
                  pushAnimeDetail(router, {
                    id: item.id,
                    title: item.title,
                    image: item.imageUrl ?? undefined,
                  })
                }
              />
            ) : cardsError ? (
              // Rule 8: a failed load must not masquerade as "no anime yet".
              <ErrorStateView onRetry={loadCollectionData} style={styles.emptyAnimeState} />
            ) : (
              <View style={styles.emptyAnimeState}>
                <ThemedText variant="titleMedium" weight="700" align="center">
                  {t('tabs.collectionScreen.emptyAnimeTitle')}
                </ThemedText>
                <ThemedText variant="bodySmall" tone="secondary" align="center">
                  {t('tabs.collectionScreen.emptyAnimeBody.all')}
                </ThemedText>
              </View>
            )}
          </View>
        </ScrollView>

        <CreateFolderModal
          visible={isCreateModalVisible}
          onClose={() => {
            setCreateModalVisible(false);
            setEditingFolder(null);
          }}
          onCreated={refreshCollectionData}
          onUpdate={async (id, data) => {
            await collectionService.updateFolder(id, data);
          }}
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
          onClose={() => setManagedFolder(null)}
          title={managedFolder?.name ?? t('collectionUi.manageFolder')}
          actions={folderManagementActions}
        />

        <CollectionSearchModal
          visible={searchOpen}
          onClose={() => setSearchOpen(false)}
          folders={collections}
        />

        {screenMode === 'share' ? (
          <>
            <CollectionFloatingActionBar
              mode="share"
              selectedCount={shareBuild?.entries.length ?? 0}
              selectedTemplateId={shareBuild?.template.id ?? null}
              capturing={capturing}
              onSelectTemplate={handleSelectTemplate}
              onConfirmShare={handleConfirmShare}
              onCancelShare={handleCancelShare}
            />
            {shareError ? (
              <View pointerEvents="none" style={styles.errorBanner}>
                <ThemedText variant="bodySmall" weight="600" style={styles.errorBannerText}>
                  {shareError}
                </ThemedText>
              </View>
            ) : null}
            <ShareListEditor
              visible={editorOpen}
              build={shareBuild}
              source={shareSource}
              onClose={() => setEditorOpen(false)}
              onSave={handleSaveEntries}
            />
            {shareBuild ? (
              <View pointerEvents="none" style={styles.offscreenRenderer}>
                <ShareImageRenderer ref={rendererRef} build={shareBuild} />
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  glowAccent: {
    position: 'absolute',
    top: -100,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.5,
  },
  scrollContent: {
    paddingBottom: 140,
    gap: 14,
  },
  statsButtonRow: {
    paddingHorizontal: Spacing.lg,
  },
  statsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.chipLg,
    borderWidth: 1,
  },
  statsButtonLabel: {
    flex: 1,
    ...Typography.titleSmall,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  sortChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    // Compact: empty sections state a fact and offer the next action — they
    // shouldn't dominate the scroll (were paddingVertical 40/32).
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyAnimeState: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  emptyAction: {
    marginTop: Spacing.sm,
  },
  offscreenRenderer: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    width: 1080,
    height: 1920,
  },
  errorBanner: {
    position: 'absolute',
    bottom: 200,
    left: Spacing.md,
    right: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: 'rgba(255,69,58,0.95)',
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  errorBannerText: {
    color: Colors.text.primary,
  },
});
