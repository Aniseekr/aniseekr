// Journal root and folder detail share the capture data and navigation flow.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ON_DARK, ThemedButton, ThemedIconButton, ThemedText } from '../../../components/themed';
import { Radius, Spacing, Typography } from '../../../constants/DesignSystem';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { useT } from '../../../libs/i18n';
import { useExperienceMode } from '../../../hooks/useExperienceMode';
import {
  usePilgrimageJournalData,
  type JournalFolder,
} from '../../../hooks/usePilgrimageJournalData';
import { resolveExperienceTabTarget } from '../../../libs/navigation/experience-tabs';
import {
  FREE_FOLDER_ANIME_ID,
  type PilgrimageAlbumEntry,
} from '../../../libs/services/pilgrimage/album-captures';
import {
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { buildJournalPreviewParams } from '../../../libs/services/pilgrimage/preview-capture';
import { SpotImage } from '../../../components/pilgrimage/SpotImage';
import { StampBookSection } from '../../../components/pilgrimage/journal/StampBookSection';

type AlbumEntry = PilgrimageAlbumEntry;
type JournalSegment = 'photos' | 'stamps';

function folderTitle(folder: JournalFolder, t: ReturnType<typeof useT>): string {
  return folder.anime.id === FREE_FOLDER_ANIME_ID
    ? t('pilgrimage.album.freeCapturesFolder')
    : getPilgrimageAnimeTitles(folder.anime).primary;
}

export default function PilgrimageJournalScreen({ tabRoot = false }: { tabRoot?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { visibleTabs } = useExperienceMode();
  const cameraTarget = resolveExperienceTabTarget(
    tabRoot ? visibleTabs : [],
    'explorerCamera',
    '/pilgrimage/capture'
  );
  const { animeId: animeIdParam } = useLocalSearchParams<{ animeId?: string }>();
  const cameFromUrlRef = useRef(!!animeIdParam);
  const [selectedAnimeId, setSelectedAnimeId] = useState<string | null>(animeIdParam ?? null);
  const [segment, setSegment] = useState<JournalSegment>('photos');
  const { folders, stats, deleteEntry } = usePilgrimageJournalData();
  const selectedFolder = useMemo(
    () => folders.find((folder) => String(folder.anime.id) === selectedAnimeId) ?? null,
    [folders, selectedAnimeId]
  );
  useEffect(() => {
    if (selectedAnimeId && !cameFromUrlRef.current && !selectedFolder) setSelectedAnimeId(null);
  }, [selectedAnimeId, selectedFolder]);

  const openCamera = useCallback(() => {
    if (cameraTarget.isVisibleTab) router.navigate(cameraTarget.href);
    else router.push(cameraTarget.href);
  }, [cameraTarget.href, cameraTarget.isVisibleTab, router]);
  const handleBack = useCallback(() => {
    hapticsBridge.tap();
    if (selectedAnimeId && !cameFromUrlRef.current) setSelectedAnimeId(null);
    else router.back();
  }, [router, selectedAnimeId]);
  const openEntry = useCallback(
    (entry: AlbumEntry) => {
      hapticsBridge.selection();
      router.push({
        pathname: '/compare/preview',
        params: buildJournalPreviewParams(entry, {
          importedLabel: t('pilgrimageUi.referencePicker.importedLabel'),
          fallbackColor: theme.accent,
        }),
      });
    },
    [router, t, theme.accent]
  );
  const columns = useMemo(() => {
    const left: AlbumEntry[] = [];
    const right: AlbumEntry[] = [];
    (selectedFolder?.entries ?? []).forEach((entry, index) => {
      (index % 2 === 0 ? left : right).push(entry);
    });
    return { left, right };
  }, [selectedFolder]);
  const isDetail = selectedAnimeId !== null;

  return (
    <View style={styles.root}>
      {tabRoot ? null : <Stack.Screen options={{ headerShown: false }} />}
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          {!tabRoot || isDetail ? (
            <ThemedIconButton
              onPress={handleBack}
              accessibilityLabel={t('common.back')}
              haptic="none"
              icon={(color) => <Ionicons name="chevron-back" size={22} color={color} />}
            />
          ) : null}
          <ThemedText variant="headlineLarge" weight="700" numberOfLines={1} style={styles.title}>
            {selectedFolder ? folderTitle(selectedFolder, t) : t('tabs.explorerJournal')}
          </ThemedText>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 110 }]}
          showsVerticalScrollIndicator={false}>
          {isDetail ? (
            selectedFolder ? (
              <View style={styles.grid}>
                {([columns.left, columns.right] as const).map((column, columnIndex) => (
                  <View key={columnIndex} style={styles.col}>
                    {column.map((entry, index) => (
                      <CompareCard
                        key={`${entry.capture.spotId}:${entry.capture.capturedAt}:${entry.capture.uri}`}
                        entry={entry}
                        theme={theme}
                        heightVariant={(index + columnIndex) % 3}
                        onPress={() => openEntry(entry)}
                        onDelete={() => deleteEntry(entry)}
                      />
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText variant="bodyMedium" tone="secondary">
                {t('pilgrimage.album.loadingFolder')}
              </ThemedText>
            )
          ) : (
            <>
              <View style={styles.statsRow}>
                <Stat value={stats.visited} label={t('pilgrimage.album.statVisitedScenes')} />
                <Stat value={stats.photos} label={t('pilgrimage.album.statPhotoCount')} />
                <Stat value={stats.stamps} label={t('pilgrimage.album.statStamps')} />
              </View>
              <View
                style={[
                  styles.segments,
                  { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
                ]}>
                {(['photos', 'stamps'] as const).map((value) => (
                  <ThemedButton
                    key={value}
                    label={t(
                      value === 'photos'
                        ? 'pilgrimage.album.segmentPhotos'
                        : 'pilgrimage.album.segmentStamps'
                    )}
                    variant={segment === value ? 'primary' : 'ghost'}
                    size="md"
                    onPress={() => setSegment(value)}
                    style={styles.segmentButton}
                  />
                ))}
              </View>
              {segment === 'stamps' ? (
                <StampBookSection onBrowseRallies={() => router.push('/pilgrimage/news')} />
              ) : folders.length ? (
                <View style={styles.folderGrid}>
                  {folders.map((folder) => (
                    <FolderCard
                      key={folder.anime.id}
                      folder={folder}
                      theme={theme}
                      onPress={() => {
                        hapticsBridge.tap();
                        cameFromUrlRef.current = false;
                        setSelectedAnimeId(String(folder.anime.id));
                      }}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <ThemedText variant="bodyMedium" tone="secondary" align="center">
                    {t('pilgrimage.album.emptyJournal')}
                  </ThemedText>
                  <ThemedButton label={t('pilgrimage.album.startCapture')} onPress={openCamera} />
                </View>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={stylesStatic.stat}>
      <ThemedText style={Typography.displayMedium}>{value}</ThemedText>
      <ThemedText variant="captionSmall" tone="secondary" align="center">
        {label}
      </ThemedText>
    </View>
  );
}

function FolderCard({
  folder,
  theme,
  onPress,
}: {
  folder: JournalFolder;
  theme: ThemePalette;
  onPress: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const title = folderTitle(folder, t);
  const shots = folder.entries.slice(0, 4).map((entry) => entry.capture.uri);
  if (shots.length < 4 && folder.anime.cover) shots.push(folder.anime.cover);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.album.openFolderA11y', { title })}
      style={({ pressed }) => [
        styles.folderCard,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.9 : 1,
        },
      ]}>
      <View style={styles.collage}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[styles.collageTile, { backgroundColor: theme.background.tertiary }]}>
            {shots[index] ? (
              <SpotImage uri={shots[index]} style={styles.fill} contentFit="cover" />
            ) : null}
          </View>
        ))}
      </View>
      <View style={styles.folderBody}>
        <ThemedText variant="bodyMedium" weight="700" numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
          {folder.anime.id === FREE_FOLDER_ANIME_ID
            ? t('pilgrimage.album.folderPhotosCount', { count: folder.entries.length })
            : t('pilgrimage.album.folderSummary', {
                spots: folder.visitedSpots,
                photos: folder.entries.length,
              })}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function CompareCard({
  entry,
  theme,
  heightVariant,
  onPress,
  onDelete,
}: {
  entry: AlbumEntry;
  theme: ThemePalette;
  heightVariant: number;
  onPress?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Two-image stack with light masonry variation. Heights apply to both
  // panels so the divider sits at a predictable point.
  const animeH = [120, 138, 108][heightVariant] ?? 120;
  const realH = [120, 138, 108][heightVariant] ?? 120;
  const spotTitles = getPilgrimageSpotTitles(entry.spot);
  const animeTitles = getPilgrimageAnimeTitles(entry.anime);
  // Free captures have no reference spot/anime/episode — spotTitles/animeTitles
  // fall back to placeholder-looking strings ("EP 0", "Unknown Title") that
  // would misrepresent real data (Rule 8). Use the honest folder label instead.
  const cardTitle = entry.isFree ? t('pilgrimage.album.freeCapturesFolder') : spotTitles.primary;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={t('pilgrimage.album.compareA11y', { title: cardTitle })}
      accessibilityHint={onDelete ? t('pilgrimage.album.deleteHint') : undefined}
      style={({ pressed }) => [
        styles.compareCard,
        {
          backgroundColor: theme.background.secondary,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.92 : 1,
        },
      ]}>
      <View style={styles.compareImgsWrap}>
        {entry.spot.image ? (
          <>
            <View style={[styles.compareHalf, { height: animeH }]}>
              <SpotImage uri={entry.spot.image} style={styles.compareImgFill} contentFit="cover" />
              <View style={styles.cornerTag}>
                <ThemedText variant="badge" style={{ color: ON_DARK }}>
                  {entry.isFree
                    ? t('pilgrimageUi.referencePicker.tagReference')
                    : t('pilgrimage.album.tagScene')}
                </ThemedText>
              </View>
            </View>
            <View style={styles.divider} />
          </>
        ) : null}
        <View style={[styles.compareHalf, { height: realH }]}>
          <SpotImage uri={entry.capture.uri} style={styles.compareImgFill} contentFit="cover" />
          <View style={[styles.cornerTag, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
            <ThemedText variant="badge" style={{ color: ON_DARK }}>
              {entry.capture.source === 'library'
                ? t('pilgrimage.album.tagLibrary')
                : t('pilgrimage.album.tagYours')}
            </ThemedText>
          </View>
        </View>
        {entry.matchPercent !== null ? (
          <View style={styles.matchPill}>
            <Ionicons name="checkmark-circle" size={10} color={theme.status.success} />
            <ThemedText variant="badge" style={{ color: ON_DARK }}>
              {entry.matchPercent}%
            </ThemedText>
          </View>
        ) : null}
      </View>
      <View style={styles.compareFoot}>
        <ThemedText variant="caption" weight="700" numberOfLines={1}>
          {cardTitle}
        </ThemedText>
        {entry.capture.note ? (
          <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2}>
            {entry.capture.note}
          </ThemedText>
        ) : null}
        {entry.isFree ? null : (
          <View style={styles.compareMetaRow}>
            <ThemedText
              variant="captionSmall"
              tone="tertiary"
              numberOfLines={1}
              style={{ flex: 1 }}>
              {animeTitles.primary}
            </ThemedText>
            <ThemedText variant="captionSmall" weight="600" style={{ color: theme.accent }}>
              {t('pilgrimage.album.epLabel', { ep: entry.spot.ep })}
            </ThemedText>
          </View>
        )}
        {entry.capture.userLocation ? (
          <View style={styles.compareMetaRow}>
            <Ionicons name="location-outline" size={10} color={theme.text.tertiary} />
            <ThemedText
              variant="captionSmall"
              tone="tertiary"
              numberOfLines={1}
              style={{ flex: 1 }}>
              {entry.capture.userLocation.latitude.toFixed(4)},{' '}
              {entry.capture.userLocation.longitude.toFixed(4)}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const stylesStatic = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center', gap: Spacing.xxs },
});

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.background.primary },
    safeArea: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.md,
    },
    title: { flex: 1 },
    scrollView: { flex: 1 },
    scroll: { paddingHorizontal: Spacing.md, gap: Spacing.lg },
    statsRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
    segments: {
      flexDirection: 'row',
      borderWidth: 1,
      borderRadius: Radius.full,
      padding: Spacing.xxs,
    },
    segmentButton: { flex: 1 },
    folderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    folderCard: { width: '48%', borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
    collage: { aspectRatio: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    collageTile: { width: '49%', height: '49%', overflow: 'hidden' },
    fill: { width: '100%', height: '100%' },
    folderBody: { padding: Spacing.sm, gap: Spacing.xxs },
    emptyState: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xxl },
    grid: { flexDirection: 'row', gap: Spacing.sm },
    col: { flex: 1, gap: Spacing.sm },
    compareCard: { borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden' },
    compareImgsWrap: { position: 'relative' },
    compareHalf: {
      width: '100%',
      backgroundColor: theme.background.tertiary,
      position: 'relative',
    },
    compareImgFill: { width: '100%', height: '100%' },
    cornerTag: {
      position: 'absolute',
      top: 6,
      right: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    divider: { height: 3, backgroundColor: 'rgba(255,255,255,0.85)' },
    matchPill: {
      position: 'absolute',
      top: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: Radius.full,
      backgroundColor: 'rgba(0,0,0,0.7)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    compareFoot: { padding: Spacing.sm, gap: Spacing.xs },
    compareMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: Spacing.xs,
    },
  });
}
