import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';

import { Radius, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import type { PilgrimageWork, PilgrimageSpot } from '../../../libs/services/pilgrimage/types';
import type { PilgrimageDisplayTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { SpotIntentKind } from '../../../libs/services/pilgrimage/spot-intents';
import type { PilgrimageSpotFilter } from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';
import { ThemedBottomSheet, ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { IntelEventsList } from './IntelEventsList';
import { PilgrimageDetailControls } from './PilgrimageDetailControls';
import { SpotRow } from './SpotRow';
import { SelectedSpotCard } from './SelectedSpotCard';

export interface PilgrimageDetailSheetProps {
  anime: PilgrimageWork | null;
  animeTitles: PilgrimageDisplayTitles | null;
  fallbackTitle: string;
  browseLabel: string;
  posterUri: string;
  filteredGroupedSpots: readonly PilgrimageSpot[];
  viewMode: 'list' | 'map';
  themeColor: string;
  theme: ThemePalette;
  visited: VisitedMap;
  spotSearchQuery: string;
  searchOpen: boolean;
  groupedCounts: { all: number; unvisited: number; visited: number };
  spotFilter: PilgrimageSpotFilter;
  selectedSpotId: string | null;
  /** The spot picked on the map or in the list; pinned to the top of the sheet. */
  selectedSpot: PilgrimageSpot | null;
  menuSpotId: string | null;
  emptyMessage: string;
  animatedPosition?: SharedValue<number>;
  onOpenBrowse: () => void;
  onSearchOpen: () => void;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  onSpotFilterChange: (filter: 'all' | 'unvisited' | 'visited') => void;
  onSpotPress: (group: PilgrimageSpot) => void;
  onClearSelection: () => void;
  onToggleVisited: (group: PilgrimageSpot) => void;
  onOpenMaps: (spot: PilgrimageSpot) => void;
  onStartCamera: (spot: PilgrimageSpot) => void;
  onFrameShot: (spot: PilgrimageSpot) => void;
  onIdentifyScene: (spot: PilgrimageSpot) => void;
  onToggleSaved: (spot: PilgrimageSpot) => void;
  onOpenDetails: (spot: PilgrimageSpot) => void;
  onMenuOpen: (spotId: string) => void;
  onMenuClose: () => void;
  representativeForGroup: (group: PilgrimageSpot) => PilgrimageSpot;
  distanceForGroup: (group: PilgrimageSpot) => number | null;
  hasIntentForGroup: (group: PilgrimageSpot, intent: SpotIntentKind) => boolean;
  webUrl: string | null;
  onOpenWeb: () => void;
}

// The map is the primary surface: the sheet opens low (title, filters, first
// row) and the user pulls it up for the full list.
export const SHEET_SNAPS = ['34%', '62%', '92%'] as const;

function PilgrimageDetailSheetImpl({
  anime,
  animeTitles,
  fallbackTitle,
  browseLabel,
  posterUri,
  filteredGroupedSpots,
  viewMode,
  themeColor,
  theme,
  visited,
  spotSearchQuery,
  searchOpen,
  groupedCounts,
  spotFilter,
  selectedSpotId,
  selectedSpot,
  menuSpotId,
  emptyMessage,
  animatedPosition,
  onOpenBrowse,
  onSearchOpen,
  onSearchChange,
  onSearchClear,
  onSpotFilterChange,
  onSpotPress,
  onClearSelection,
  onToggleVisited,
  onOpenMaps,
  onStartCamera,
  onFrameShot,
  onIdentifyScene,
  onToggleSaved,
  onOpenDetails,
  onMenuOpen,
  onMenuClose,
  representativeForGroup,
  distanceForGroup,
  hasIntentForGroup,
  webUrl,
  onOpenWeb,
}: PilgrimageDetailSheetProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => [...SHEET_SNAPS], []);
  const progress =
    groupedCounts.all > 0 ? Math.min(1, groupedCounts.visited / groupedCounts.all) : 0;

  useEffect(() => {
    if (viewMode === 'map') sheetRef.current?.snapToIndex(0);
  }, [viewMode]);

  const menuGroup = menuSpotId
    ? (filteredGroupedSpots.find((spot) => spot.id === menuSpotId) ??
      (selectedSpot?.id === menuSpotId ? selectedSpot : null))
    : null;
  const menuSpot = menuGroup;
  const menuSaved = menuGroup ? hasIntentForGroup(menuGroup, 'saved') : false;

  const runMenuAction = (action: (spot: PilgrimageSpot) => void) => {
    if (!menuSpot) return;
    onMenuClose();
    action(menuSpot);
  };

  const renderRow = useCallback(
    ({ item, index }: { item: PilgrimageSpot; index: number }) => (
      <SpotRow
        group={item}
        spot={representativeForGroup(item)}
        index={index}
        selected={item.id === selectedSpotId}
        themeColor={themeColor}
        distanceKm={distanceForGroup(item)}
        visited={visited[item.id] === true}
        theme={theme}
        onPress={onSpotPress}
        onToggleVisited={onToggleVisited}
      />
    ),
    [
      distanceForGroup,
      onSpotPress,
      onToggleVisited,
      representativeForGroup,
      selectedSpotId,
      theme,
      themeColor,
      visited,
    ]
  );

  // Compact work header: the counts live on the filter segments, so the header
  // carries only the title, the progress bar and the source link.
  const headerNode = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.posterWrap}>
          {posterUri ? (
            <Image source={{ uri: posterUri }} style={styles.poster} contentFit="cover" />
          ) : null}
        </View>
        <View style={styles.titleColumn}>
          <ThemedText variant="titleMedium" weight="800" numberOfLines={1}>
            {animeTitles?.primary ?? fallbackTitle}
          </ThemedText>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: themeColor },
              ]}
            />
          </View>
          {anime ? (
            <Pressable
              onPress={onOpenBrowse}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel={browseLabel}>
              <ThemedText variant="captionSmall" weight="700" style={{ color: themeColor }}>
                {browseLabel}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
        <ThemedIconButton
          variant="ghost"
          icon={(color) => <Ionicons name="search" size={22} color={color} />}
          accessibilityLabel={t('pilgrimage.detail.searchA11y')}
          onPress={onSearchOpen}
        />
      </View>

      <PilgrimageDetailControls
        spotSearchQuery={spotSearchQuery}
        searchOpen={searchOpen}
        groupedCounts={groupedCounts}
        spotFilter={spotFilter}
        themeColor={themeColor}
        theme={theme}
        onSearchChange={onSearchChange}
        onSearchClear={onSearchClear}
        onSpotFilterChange={onSpotFilterChange}
      />
    </View>
  );

  const footerNode = (
    <View style={styles.footer}>
      {webUrl ? (
        <ThemedButton
          variant="secondary"
          label={t('pilgrimage.openMapTripPlannerOnWeb')}
          onPress={onOpenWeb}
          fullWidth
        />
      ) : null}
      <IntelEventsList
        bangumiId={anime?.bgm?.[0] ?? null}
        theme={theme}
        themeColor={themeColor}
        title={t('pilgrimageUi.intel.events')}
      />
    </View>
  );

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enableContentPanningGesture
        animatedPosition={animatedPosition}
        backgroundStyle={[styles.sheetBg, { backgroundColor: theme.background.primary }]}
        handleIndicatorStyle={[styles.sheetHandle, { backgroundColor: theme.glassBorder }]}>
        {selectedSpot ? (
          <SelectedSpotCard
            spot={representativeForGroup(selectedSpot)}
            distanceKm={distanceForGroup(selectedSpot)}
            themeColor={themeColor}
            theme={theme}
            onClose={onClearSelection}
            onOpenMaps={onOpenMaps}
            onStartCamera={onStartCamera}
            onMenuOpen={onMenuOpen}
          />
        ) : null}
        <BottomSheetFlatList
          data={filteredGroupedSpots as PilgrimageSpot[]}
          keyExtractor={(item: PilgrimageSpot) => item.id}
          renderItem={renderRow}
          ListHeaderComponent={headerNode}
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <MaterialIcons name="explore-off" size={30} color={theme.text.tertiary} />
              <ThemedText variant="bodyMedium" tone="secondary" align="center">
                {emptyMessage}
              </ThemedText>
            </View>
          }
          ListFooterComponent={footerNode}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
        />
      </BottomSheet>

      <ThemedBottomSheet visible={menuSpot !== null} onClose={onMenuClose} maxHeightPct={0.55}>
        <View style={styles.menuActions}>
          <ThemedText variant="titleMedium" weight="700">
            {t('pilgrimage.detail.moreSpotActions')}
          </ThemedText>
          <ThemedButton
            variant="secondary"
            fullWidth
            icon={
              <Ionicons
                name={menuSaved ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={theme.text.primary}
              />
            }
            label={t(menuSaved ? 'pilgrimage.detail.unsaveScene' : 'pilgrimage.detail.saveScene')}
            onPress={() => runMenuAction(onToggleSaved)}
          />
          <ThemedButton
            variant="secondary"
            fullWidth
            label={t('pilgrimage.detail.frameShot')}
            onPress={() => runMenuAction(onFrameShot)}
          />
          <ThemedButton
            variant="secondary"
            fullWidth
            label={t('pilgrimage.detail.identifyScene')}
            onPress={() => runMenuAction(onIdentifyScene)}
          />
          <ThemedButton
            variant="secondary"
            fullWidth
            label={t('pilgrimage.detail.sceneDetails')}
            onPress={() => runMenuAction(onOpenDetails)}
          />
        </View>
      </ThemedBottomSheet>
    </>
  );
}

export const PilgrimageDetailSheet = memo(PilgrimageDetailSheetImpl);

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    sheetBg: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl },
    sheetHandle: { width: 44, height: 4, borderRadius: 2 },
    sheetContent: { paddingHorizontal: Spacing.screenPadding, paddingBottom: Spacing.xxl },
    header: { gap: Spacing.sm, paddingBottom: Spacing.md },
    titleRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
    posterWrap: {
      width: 40,
      height: 56,
      overflow: 'hidden',
      borderRadius: Radius.md,
      backgroundColor: theme.background.tertiary,
    },
    poster: { width: '100%', height: '100%' },
    titleColumn: { flex: 1, minWidth: 0, gap: 4 },
    progressTrack: {
      height: 3,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      marginTop: 3,
    },
    progressFill: { height: '100%', borderRadius: Radius.sm },
    footer: { gap: Spacing.md, paddingTop: Spacing.lg },
    emptyCard: {
      marginTop: Spacing.lg,
      paddingVertical: Spacing.xl,
      paddingHorizontal: Spacing.lg,
      backgroundColor: theme.background.secondary,
      borderColor: theme.glassBorder,
      borderWidth: 1,
      borderRadius: Radius.cardLg,
      alignItems: 'center',
      gap: Spacing.xs,
    },
    menuActions: { gap: Spacing.sm },
  });
}
