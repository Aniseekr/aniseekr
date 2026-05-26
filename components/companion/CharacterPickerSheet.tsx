// Companion composer (Track D Phase 1) — pick / import / delete characters.
//
// Modal sheet that lists the MMKV-backed library and offers a single
// "Import…" action that runs ImagePicker → subjectLifter → store.upsert.
// Subscribes to the store via `subscribeCharacters` so other surfaces (the
// future compare integration) stay in sync.

import { useCallback, useEffect, useState } from 'react';
import {
  Image as RNImage,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import { Radius, Spacing } from '../../constants/DesignSystem';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useTheme } from '../../context/ThemeContext';
import {
  deleteCharacter,
  getCharacterLimit,
  getCharacters,
  subscribeCharacters,
  upsertCharacter,
} from '../../libs/services/companion/character-library-store';
import type { CharacterEntry } from '../../libs/services/companion/character-library';
import { subjectLifter } from '../../libs/services/companion/subject-lifter';

export type CharacterPickerSheetProps = {
  visible: boolean;
  selectedId: string | null;
  onSelect: (entry: CharacterEntry) => void;
  onClose: () => void;
};

export function CharacterPickerSheet({
  visible,
  selectedId,
  onSelect,
  onClose,
}: CharacterPickerSheetProps) {
  const { theme } = useTheme();
  const accent = theme.accent;
  const accentFg = readableTextOn(accent);
  const [list, setList] = useState<CharacterEntry[]>(() => getCharacters());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = getCharacterLimit();

  useEffect(() => subscribeCharacters(setList), []);

  const handleImport = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError('Photo library access denied');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const asset = picked.assets[0];
      const lifted = await subjectLifter.lift(asset.uri);
      // Lifter returns 0/0 dims in the JS fallback; measure here so the layer
      // knows the aspect ratio before paint.
      const { width, height } = await measure(lifted.uri, asset);
      const entry: CharacterEntry = {
        id: `char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        displayName: asset.fileName?.replace(/\.[^.]+$/, '') ?? 'Character',
        sourceUri: asset.uri,
        cutoutUri: lifted.uri,
        thumbUri: lifted.uri,
        intrinsicW: width,
        intrinsicH: height,
        createdAt: Date.now(),
      };
      const ok = upsertCharacter(entry);
      if (!ok) {
        setError(`Library full (${limit} max). Remove one first.`);
        return;
      }
      hapticsBridge.success();
      onSelect(entry);
    } catch (err) {
      setError((err as Error).message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  }, [importing, limit, onSelect]);

  const handleDelete = useCallback((id: string) => {
    hapticsBridge.warning();
    deleteCharacter(id);
  }, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent>
      <SafeAreaView
        edges={['top', 'bottom']}
        style={[styles.root, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Close character picker"
            style={({ pressed }) => [
              styles.headerBtn,
              {
                backgroundColor: theme.background.secondary,
                borderColor: theme.glassBorder,
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <Ionicons name="close" size={20} color={theme.text.primary} />
          </Pressable>
          <ThemedText variant="titleLarge" weight="700">
            Characters
          </ThemedText>
          <ThemedText variant="captionSmall" tone="secondary">
            {`${list.length}/${limit}`}
          </ThemedText>
        </View>

        <ScrollView
          contentContainerStyle={styles.gridWrap}
          showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={handleImport}
            disabled={importing}
            accessibilityRole="button"
            accessibilityLabel="Import character"
            style={({ pressed }) => [
              styles.importTile,
              {
                backgroundColor: accent,
                borderColor: accent,
                opacity: importing ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}>
            <Ionicons name="add" size={24} color={accentFg} />
            <ThemedText variant="bodySmall" weight="700" style={{ color: accentFg }}>
              {importing ? 'Importing…' : 'Import'}
            </ThemedText>
          </Pressable>

          {list.map((entry) => {
            const active = entry.id === selectedId;
            return (
              <View key={entry.id} style={styles.tileWrap}>
                <Pressable
                  onPress={() => {
                    hapticsBridge.selection();
                    onSelect(entry);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${entry.displayName}`}
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.tile,
                    {
                      borderColor: active ? accent : theme.glassBorder,
                      borderWidth: active ? 2 : 1,
                      backgroundColor: theme.background.secondary,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}>
                  <ExpoImage
                    source={{ uri: entry.thumbUri }}
                    style={StyleSheet.absoluteFillObject}
                    contentFit="contain"
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(entry.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.displayName}`}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    {
                      backgroundColor: theme.background.tertiary,
                      borderColor: theme.glassBorder,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}>
                  <Ionicons name="trash-outline" size={12} color={theme.text.secondary} />
                </Pressable>
                <ThemedText
                  variant="captionSmall"
                  weight="600"
                  numberOfLines={1}
                  style={styles.tileLabel}>
                  {entry.displayName}
                </ThemedText>
              </View>
            );
          })}
        </ScrollView>

        {error ? (
          <View
            style={[
              styles.errorBar,
              { backgroundColor: theme.status.error, borderColor: theme.status.error },
            ]}>
            <ThemedText variant="captionSmall" weight="700" style={{ color: '#fff' }}>
              {error}
            </ThemedText>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

async function measure(
  uri: string,
  asset: ImagePicker.ImagePickerAsset
): Promise<{ width: number; height: number }> {
  if (asset.width && asset.height) return { width: asset.width, height: asset.height };
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (w, h) => resolve({ width: w, height: h }),
      () => resolve({ width: 512, height: 768 })
    );
  });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  importTile: {
    width: '30%',
    aspectRatio: 0.75,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileWrap: {
    width: '30%',
    gap: 4,
  },
  tile: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  tileLabel: {
    textAlign: 'center',
  },
  errorBar: {
    margin: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
});
