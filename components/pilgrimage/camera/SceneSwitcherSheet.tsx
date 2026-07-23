// Quick-switch sheet shown when the user taps the reference thumbnail in the
// camera. Lists every pilgrimage spot for the current anime; tapping one
// navigates directly to that spot's camera screen (no tips/intro stop-over).
//
// Rule 8: this component is a pure renderer. The parent owns the spot list
// and either passes the real points (after they've been fetched from
// pilgrimageRepository) or `null` / an empty array. We render a clear
// "Loading…" or "Unavailable" state instead of fake data.

import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ON_DARK, ThemedBottomSheet, ThemedText, readableTextOn } from '../../themed';
import { useT } from '../../../libs/i18n';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import {
  anitabiImageSource,
  toFullResImageUrl,
} from '../../../libs/services/pilgrimage/anitabi-image';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { AnitabiOriginCredit } from '../common/AnitabiOriginCredit';

interface SceneSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Real spots for the current anime. `null` ⇒ still loading. */
  spots: readonly AnitabiPoint[] | null;
  currentSpotId: string;
  themeColor: string;
  onPickSpot: (spot: AnitabiPoint) => void;
  loading?: boolean;
}

const TILE_WIDTH = 132;
const TILE_HEIGHT = 96;

export default function SceneSwitcherSheet({
  visible,
  onClose,
  spots,
  currentSpotId,
  themeColor,
  onPickSpot,
  loading = false,
}: SceneSwitcherSheetProps) {
  const { theme } = useTheme();
  const t = useT();
  const [query, setQuery] = useState('');

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  // Surface the currently-selected spot first so the user can find their
  // place in long lists, then everything else in source order.
  const orderedSpots = useMemo(() => {
    if (!spots) return null;
    const current = spots.find((s) => s.id === currentSpotId);
    const rest = spots.filter((s) => s.id !== currentSpotId);
    return current ? [current, ...rest] : rest;
  }, [spots, currentSpotId]);

  // Keyboard filter over scene title / raw name / episode (US-13). Empty query
  // shows everything; `orderedSpots == null` (still loading) stays null.
  const filteredSpots = useMemo(() => {
    if (!orderedSpots) return null;
    const q = query.trim().toLowerCase();
    if (!q) return orderedSpots;
    return orderedSpots.filter((s) => {
      const title = getPilgrimageSpotTitles(s).primary.toLowerCase();
      const name = (s.name ?? '').toLowerCase();
      return title.includes(q) || name.includes(q) || `ep ${s.ep}`.includes(q) || `${s.ep}` === q;
    });
  }, [orderedSpots, query]);

  const handlePick = (spot: AnitabiPoint) => {
    if (spot.id === currentSpotId) {
      // Tapping the active scene just closes the sheet — no point reloading
      // the same camera screen.
      hapticsBridge.tap();
      handleClose();
      return;
    }
    hapticsBridge.success();
    onPickSpot(spot);
  };

  return (
    <ThemedBottomSheet visible={visible} onClose={handleClose}>
      <SafeAreaView edges={['bottom']}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="titleSmall" weight="700">
                {t('pilgrimageUi.switchScene')}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary">
                {orderedSpots == null
                  ? 'Loading scenes…'
                  : `${orderedSpots.length} scene${orderedSpots.length === 1 ? '' : 's'} in this anime`}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => {
                hapticsBridge.tap();
                handleClose();
              }}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={t('pilgrimageUi.closeSceneSwitcher')}
              style={({ pressed }) => [
                styles.closeBtn,
                {
                  backgroundColor: theme.background.tertiary,
                  borderColor: theme.glassBorder,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Ionicons name="close" size={18} color={theme.text.primary} />
            </Pressable>
          </View>
          {orderedSpots && orderedSpots.length > 4 ? (
            <View
              style={[
                styles.searchRow,
                { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
              ]}>
              <Ionicons name="search" size={15} color={theme.text.tertiary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('pilgrimage.sceneSwitcher.searchPlaceholder')}
                placeholderTextColor={theme.text.tertiary}
                returnKeyType="search"
                autoCorrect={false}
                style={[styles.searchInput, { color: theme.text.primary }]}
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery('')}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('pilgrimage.sceneSwitcher.clearSearchA11y')}>
                  <Ionicons name="close-circle" size={16} color={theme.text.tertiary} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {loading || filteredSpots == null ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={themeColor} />
          </View>
        ) : filteredSpots.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ThemedText variant="bodySmall" tone="secondary" align="center">
              {query.trim().length > 0
                ? t('pilgrimage.sceneSwitcher.noMatch')
                : 'No other scenes available for this anime.'}
            </ThemedText>
          </View>
        ) : (
          <FlatList
            horizontal
            data={filteredSpots}
            keyExtractor={(s) => s.id}
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <SceneTile
                spot={item}
                isActive={item.id === currentSpotId}
                themeColor={themeColor}
                onPress={() => handlePick(item)}
              />
            )}
          />
        )}
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

interface SceneTileProps {
  spot: AnitabiPoint;
  isActive: boolean;
  themeColor: string;
  onPress: () => void;
}

function SceneTile({ spot, isActive, themeColor, onPress }: SceneTileProps) {
  const { theme } = useTheme();
  const titles = getPilgrimageSpotTitles(spot);
  const fullResImage = toFullResImageUrl(spot.image);
  const activeFg = readableTextOn(themeColor);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${titles.primary}`}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: isActive ? themeColor : theme.glassBorder,
          borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Image
        source={anitabiImageSource(fullResImage || spot.image)}
        style={styles.tileImage}
        contentFit="cover"
        transition={120}
      />
      {isActive ? (
        <View style={[styles.activeBadge, { backgroundColor: themeColor }]}>
          <Ionicons name="checkmark" size={11} color={activeFg} />
          <ThemedText
            variant="captionSmall"
            weight="700"
            style={{ color: activeFg, letterSpacing: 0.5 }}>
            NOW
          </ThemedText>
        </View>
      ) : null}
      <View style={styles.tileCaption}>
        <ThemedText
          variant="captionSmall"
          weight="700"
          numberOfLines={1}
          style={{ color: ON_DARK }}>
          {titles.primary}
        </ThemedText>
        <ThemedText
          variant="captionSmall"
          numberOfLines={1}
          style={{ color: 'rgba(255,255,255,0.78)' }}>
          {`EP ${spot.ep}`}
        </ThemedText>
        <AnitabiOriginCredit
          source={spot}
          variant="inline"
          textVariant="captionSmall"
          color={ON_DARK}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    padding: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  loadingWrap: {
    height: TILE_HEIGHT + 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 10,
  },
  tile: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  activeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tileCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
