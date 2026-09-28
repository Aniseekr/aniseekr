import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import BottomSheet, {
  BottomSheetFlatList,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';

import { Radius, Spacing } from '../../../constants/DesignSystem';
import type { ThemePalette } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';
import type {
  AnitabiBangumi,
  AnitabiPoint,
  AnitabiSpot,
} from '../../../libs/services/pilgrimage/types';
import type { PilgrimageDisplayTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { VisitedMap } from '../../../libs/services/pilgrimage/visited-prefs';
import type { SpotIntentKind } from '../../../libs/services/pilgrimage/spot-intents';
import type { PilgrimageSpotFilter } from '../../../libs/services/pilgrimage/pilgrimage-detail-filter';
import { ThemedBottomSheet, ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { AnitabiAttributionFooter } from '../common/AnitabiAttributionFooter';
import { IntelEventsList } from './IntelEventsList';
import { PilgrimageDetailControls } from './PilgrimageDetailControls';
import { SpotRow } from './SpotRow';

export interface PilgrimageDetailSheetProps {
  anime: AnitabiBangumi | null;
  animeTitles: PilgrimageDisplayTitles | null;
  browseLabel: string;
  posterUri: string;
  filteredGroupedSpots: readonly AnitabiSpot[];
  viewMode: 'list' | 'map';
  themeColor: string;
  theme: ThemePalette;
  visited: VisitedMap;
  spotSearchQuery: string;
  searchOpen: boolean;
  groupedCounts: { all: number; unvisited: number; visited: number };
  spotFilter: PilgrimageSpotFilter;
  selectedSpotId: string | null;
  focusRequest: number;
  menuSpotId: string | null;
  emptyMessage: string;
  animatedPosition?: SharedValue<number>;
  onOpenBrowse: () => void;
  onSearchOpen: () => void;
  onSearchChange: (text: string) => void;
  onSearchClear: () => void;
  onSpotFilterChange: (filter: 'all' | 'unvisited' | 'visited') => void;
  onSpotPress: (group: AnitabiSpot) => void;
  onToggleVisited: (group: AnitabiSpot) => void;
  onOpenMaps: (spot: AnitabiPoint) => void;
  onStartCamera: (spot: AnitabiPoint) => void;
  onFrameShot: (spot: AnitabiPoint) => void;
  onIdentifyScene: (spot: AnitabiPoint) => void;
  onToggleSaved: (spot: AnitabiPoint) => void;
  onOpenDetails: (spot: AnitabiPoint) => void;
  onMenuOpen: (spotId: string) => void;
  onMenuClose: () => void;
  representativeForGroup: (group: AnitabiSpot) => AnitabiPoint;
  distanceForGroup: (group: AnitabiSpot) => number | null;
  hasIntentForGroup: (group: AnitabiSpot, intent: SpotIntentKind) => boolean;
}

const SHEET_SNAPS = ['16%', '58%', '92%'] as const;

function PilgrimageDetailSheetImpl({
  anime,
  animeTitles,
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
  focusRequest,
  menuSpotId,
  emptyMessage,
  animatedPosition,
  onOpenBrowse,
  onSearchOpen,
  onSearchChange,
  onSearchClear,
  onSpotFilterChange,
  onSpotPress,
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
}: PilgrimageDetailSheetProps) {
  const t = useT();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<BottomSheetFlatListMethods>(null);
  const snapPoints = useMemo(() => [...SHEET_SNAPS], []);
  const progress =
    groupedCounts.all > 0 ? Math.min(1, groupedCounts.visited / groupedCounts.all) : 0;

  useEffect(() => {
    if (viewMode === 'map') sheetRef.current?.snapToIndex(0);
  }, [viewMode]);

  useEffect(() => {
    if (!selectedSpotId) return;
    const index = filteredGroupedSpots.findIndex((group) =>
      group.scenes.some((scene) => scene.id === selectedSpotId)
    );
    if (index < 0) return;
    sheetRef.current?.snapToIndex(1);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.25 });
    });
  }, [filteredGroupedSpots, focusRequest, selectedSpotId]);

  const menuGroup = menuSpotId
    ? filteredGroupedSpots.find((group) => group.scenes.some((scene) => scene.id === menuSpotId))
    : null;
  const menuSpot = menuGroup
    ? (menuGroup.scenes.find((scene) => scene.id === menuSpotId) ??
      representativeForGroup(menuGroup))
    : null;
  const menuSaved = menuGroup ? hasIntentForGroup(menuGroup, 'saved') : false;

  const runMenuAction = (action: (spot: AnitabiPoint) => void) => {
    if (!menuSpot) return;
    onMenuClose();
    action(menuSpot);
  };

  const renderRow = useCallback(
    ({ item, index }: { item: AnitabiSpot; index: number }) => (
      <SpotRow
        group={item}
        spot={representativeForGroup(item)}
        index={index}
        selected={item.scenes.some((scene) => scene.id === selectedSpotId)}
        themeColor={themeColor}
        distanceKm={distanceForGroup(item)}
        visited={item.scenes.some((scene) => visited[scene.id] === true)}
        theme={theme}
        onPress={onSpotPress}
        onToggleVisited={onToggleVisited}
        onOpenMaps={onOpenMaps}
        onStartCamera={onStartCamera}
        onMenuOpen={onMenuOpen}
      />
    ),
    [
      distanceForGroup,
      onMenuOpen,
      onOpenMaps,
      onSpotPress,
      onStartCamera,
      onToggleVisited,
      representativeForGroup,
      selectedSpotId,
      theme,
      themeColor,
      visited,
    ]
  );

  const headerNode = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <View style={styles.posterWrap}>
          {posterUri ? (
            <Image
              source={anitabiImageSource(posterUri)}
              style={styles.poster}
              contentFit="cover"
            />
          ) : null}
        </View>
        <View style={styles.titleColumn}>
          <ThemedText variant="titleLarge" weight="800" numberOfLines={2}>
            {animeTitles?.primary ?? '—'}
          </ThemedText>
          <View style={styles.subtitleRow}>
            <ThemedText variant="captionSmall" tone="secondary">
              {t('pilgrimage.detail.progressSummary', {
                count: groupedCounts.all,
                visited: groupedCounts.visited,
              })}
            </ThemedText>
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
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progress * 100}%`, backgroundColor: themeColor },
              ]}
            />
          </View>
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
      <IntelEventsList
        bangumiId={anime?.id ?? null}
        theme={theme}
        themeColor={themeColor}
        title={t('pilgrimageUi.intel.events')}
      />
      <AnitabiAttributionFooter bangumiId={anime?.id ?? null} variant="footer" />
    </View>
  );

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={viewMode === 'map' ? 0 : 1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enableContentPanningGesture
        animatedPosition={animatedPosition}
        backgroundStyle={[styles.sheetBg, { backgroundColor: theme.background.primary }]}
        handleIndicatorStyle={[styles.sheetHandle, { backgroundColor: theme.glassBorder }]}>
        <BottomSheetFlatList
          ref={listRef}
          data={filteredGroupedSpots as AnitabiSpot[]}
          keyExtractor={(item: AnitabiSpot) => item.id}
          renderItem={renderRow}
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: true });
          }}
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
      width: 72,
      height: 96,
      overflow: 'hidden',
      borderRadius: Radius.md,
      backgroundColor: theme.background.tertiary,
    },
    poster: { width: '100%', height: '100%' },
    titleColumn: { flex: 1, gap: 3 },
    progressTrack: {
      height: 3,
      borderRadius: Radius.full,
      overflow: 'hidden',
      backgroundColor: theme.background.tertiary,
      marginTop: 3,
    },
    progressFill: { height: '100%', borderRadius: Radius.full },
    subtitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
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
