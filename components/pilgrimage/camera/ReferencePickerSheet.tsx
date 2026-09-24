// Pick what to compare a shot against: an anime scene from the offline
// pilgrimage index, or an image imported from the photo library.
//
// Two steps in one sheet — anime list (search + import) → that anime's scenes.
// Opened from a spot camera it starts on the current anime's scenes. Rule 8:
// every tile is a real Anitabi point or the user's own image; loading and empty
// states say so instead of showing placeholders.

import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, Size, Spacing, Typography } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useSceneSwitcherSpots } from '../../../hooks/useSceneSwitcherSpots';
import { useT } from '../../../libs/i18n';
import {
  getAllIndexed,
  getIndexedById,
  type AnitabiIndexEntry,
} from '../../../libs/services/pilgrimage/anitabi-index';
import {
  getPilgrimageAnimeTitles,
  getPilgrimageSpotTitles,
} from '../../../libs/services/pilgrimage/pilgrimage-localization';
import { importReferenceImage } from '../../../libs/services/pilgrimage/reference-image';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedBottomSheet, ThemedButton, ThemedIconButton, ThemedText } from '../../themed';
import { RallyPoster } from '../rally/RallyPoster';
import { SpotImage } from '../SpotImage';

export type PickedReference =
  | { kind: 'scene'; spot: AnitabiPoint; animeId: number; animeTitle: string }
  | { kind: 'imported'; uri: string };

interface ReferencePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (reference: PickedReference) => void;
  /** Start on this anime's scenes (the spot camera's current anime). */
  initialAnimeId?: number | null;
  currentSpotId?: string;
}

const ANIME_LIST_LIMIT = 40;
const SCENE_COLUMNS = 2;

function animeLabel(entry: AnitabiIndexEntry): string {
  return getPilgrimageAnimeTitles(entry).primary;
}

export function ReferencePickerSheet({
  visible,
  onClose,
  onPick,
  initialAnimeId = null,
  currentSpotId,
}: ReferencePickerSheetProps) {
  const t = useT();
  const [animeId, setAnimeId] = useState<number | null>(initialAnimeId);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);

  const close = () => {
    setQuery('');
    setAnimeId(initialAnimeId);
    onClose();
  };

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await importReferenceImage();
      if (result.status === 'ok') {
        hapticsBridge.success();
        onPick({ kind: 'imported', uri: result.uri });
        close();
      } else if (result.status === 'denied') {
        Alert.alert(t('pilgrimageUi.referencePicker.importDenied'));
      }
    } catch (error) {
      console.warn('[reference] import failed', error);
      hapticsBridge.error();
      Alert.alert(t('pilgrimageUi.referencePicker.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  const anime = animeId !== null ? getIndexedById(animeId) : null;

  return (
    <ThemedBottomSheet visible={visible} onClose={close} maxHeightPct={0.85}>
      <SafeAreaView edges={['bottom']} style={styles.body}>
        <View style={styles.header}>
          {anime ? (
            <ThemedIconButton
              accessibilityLabel={t('pilgrimageUi.referencePicker.allAnime')}
              variant="ghost"
              icon={(color) => <Ionicons name="chevron-back" size={20} color={color} />}
              onPress={() => {
                hapticsBridge.tap();
                setAnimeId(null);
              }}
            />
          ) : null}
          <ThemedText variant="titleMedium" weight="700" numberOfLines={1} style={styles.title}>
            {anime ? animeLabel(anime) : t('pilgrimageUi.referencePicker.title')}
          </ThemedText>
          <ThemedIconButton
            accessibilityLabel={t('common.close')}
            variant="ghost"
            icon={(color) => <Ionicons name="close" size={20} color={color} />}
            onPress={close}
          />
        </View>

        {anime ? (
          <SceneGrid
            animeId={anime.id}
            animeTitle={animeLabel(anime)}
            visible={visible}
            currentSpotId={currentSpotId}
            onPick={(reference) => {
              onPick(reference);
              close();
            }}
          />
        ) : (
          <AnimeList
            query={query}
            onQueryChange={setQuery}
            importing={importing}
            onImport={() => void handleImport()}
            onPickAnime={(id) => {
              hapticsBridge.selection();
              setAnimeId(id);
            }}
          />
        )}
      </SafeAreaView>
    </ThemedBottomSheet>
  );
}

function AnimeList({
  query,
  onQueryChange,
  importing,
  onImport,
  onPickAnime,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  importing: boolean;
  onImport: () => void;
  onPickAnime: (id: number) => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const results = useMemo(() => {
    const all = getAllIndexed();
    const q = query.trim().toLowerCase();
    const matched = q
      ? all.filter(
          (entry) =>
            entry.title.toLowerCase().includes(q) ||
            entry.cn.toLowerCase().includes(q) ||
            (entry.titleEnglish ?? '').toLowerCase().includes(q)
        )
      : [...all].sort((a, b) => b.pointsLength - a.pointsLength);
    return matched.slice(0, ANIME_LIST_LIMIT);
  }, [query]);

  return (
    <View style={styles.flex}>
      <View style={styles.importRow}>
        <ThemedButton
          label={t('pilgrimageUi.referencePicker.importFromLibrary')}
          variant="secondary"
          fullWidth
          loading={importing}
          icon={<Ionicons name="images-outline" size={18} color={theme.text.primary} />}
          onPress={onImport}
        />
      </View>
      <View
        style={[
          styles.search,
          { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
        ]}>
        <Ionicons name="search" size={16} color={theme.text.tertiary} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder={t('pilgrimageUi.referencePicker.searchPlaceholder')}
          placeholderTextColor={theme.text.tertiary}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text.primary }]}
        />
      </View>
      <ThemedText variant="caption" tone="tertiary" style={styles.sectionLabel}>
        {t('pilgrimageUi.referencePicker.animeSection')}
      </ThemedText>
      <FlatList
        data={results}
        keyExtractor={(entry) => String(entry.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <ThemedText variant="bodySmall" tone="secondary" align="center" style={styles.empty}>
            {t('pilgrimageUi.referencePicker.noAnimeMatch')}
          </ThemedText>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onPickAnime(item.id)}
            accessibilityRole="button"
            accessibilityLabel={animeLabel(item)}
            style={({ pressed }) => [styles.animeRow, pressed && styles.pressed]}>
            <RallyPoster bangumiId={item.id} style={styles.animePoster} />
            <View style={styles.animeCopy}>
              <ThemedText variant="bodyMedium" weight="600" numberOfLines={1}>
                {animeLabel(item)}
              </ThemedText>
              <ThemedText variant="caption" tone="secondary" numberOfLines={1}>
                {t('pilgrimageUi.referencePicker.spotCount', { count: item.pointsLength })}
                {item.city ? ` · ${item.city}` : ''}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

function SceneGrid({
  animeId,
  animeTitle,
  visible,
  currentSpotId,
  onPick,
}: {
  animeId: number;
  animeTitle: string;
  visible: boolean;
  currentSpotId?: string;
  onPick: (reference: PickedReference) => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const { spots, loading } = useSceneSwitcherSpots(String(animeId), visible);
  const withImages = useMemo(() => (spots ?? []).filter((spot) => spot.image), [spots]);

  if (loading || spots == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }
  if (withImages.length === 0) {
    return (
      <View style={styles.center}>
        <ThemedText variant="bodySmall" tone="secondary" align="center">
          {t('pilgrimageUi.referencePicker.noScenes')}
        </ThemedText>
      </View>
    );
  }
  return (
    <FlatList
      data={withImages}
      numColumns={SCENE_COLUMNS}
      keyExtractor={(spot) => spot.id}
      columnWrapperStyle={styles.sceneRow}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => {
        const active = item.id === currentSpotId;
        const title = getPilgrimageSpotTitles(item).primary;
        return (
          <Pressable
            onPress={() => {
              hapticsBridge.success();
              onPick({ kind: 'scene', spot: item, animeId, animeTitle });
            }}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.sceneTile, pressed && styles.pressed]}>
            {/* Thumbnail on the tile; the camera loads the full-res frame. */}
            <SpotImage
              uri={item.image}
              recyclingKey={item.id}
              style={[
                styles.sceneImage,
                { backgroundColor: theme.background.tertiary },
                active && { borderColor: theme.accent, borderWidth: 2 },
              ]}
            />
            <ThemedText variant="caption" weight="600" numberOfLines={1}>
              {title}
            </ThemedText>
            {item.ep ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('pilgrimage.album.epLabel', { ep: item.ep })}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  body: { flexShrink: 1, minHeight: 360 },
  flex: { flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { flex: 1 },
  importRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.sm,
    minHeight: Size.minTouchTarget,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, ...Typography.bodyMedium },
  sectionLabel: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  listContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.xs },
  empty: { paddingVertical: Spacing.xl },
  animeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: Size.minTouchTarget,
    paddingVertical: Spacing.xxs,
  },
  animePoster: { width: 40, height: 60, borderRadius: Radius.sm },
  animeCopy: { flex: 1, minWidth: 0, gap: 2 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxl },
  sceneRow: { gap: Spacing.sm },
  sceneTile: { flex: 1, gap: Spacing.xxs, paddingBottom: Spacing.xs },
  sceneImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.md },
  pressed: { opacity: 0.8 },
});
