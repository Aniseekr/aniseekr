// Companion live-preview overlay (Track D Phase 1B).
//
// Mounts a floating "Character" chip above the camera HUD and renders the
// selected character as a positioning guide on top of the live preview.
//
// What it does today:
//   - Chip → CharacterPickerSheet (import / pick / delete from MMKV library)
//   - When a character is set, `<CharacterLayer/>` renders absolutely over
//     the parent, draggable / pinchable / rotatable / double-tap to flip.
//
// What it does NOT do yet:
//   - Bake the character into the captured frame. The CameraStage capture
//     path takes a native photo without the overlay; downstream
//     preview/share will paint the character on top via a separate
//     compositor (Phase 1C — see plan §3.3).

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedText, readableTextOn } from '../themed';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { CharacterLayer } from './CharacterLayer';
import { CharacterPickerSheet } from './CharacterPickerSheet';
import type { CharacterEntry } from '../../libs/services/companion/character-library';

export type CompanionOverlayProps = {
  parentSize: { width: number; height: number };
  themeColor: string;
  editMode?: boolean;
  /** Optional bottom inset so the chip clears the camera dial / capture button. */
  chipBottomOffset?: number;
};

export function CompanionOverlay({
  parentSize,
  themeColor,
  editMode = true,
  chipBottomOffset = 200,
}: CompanionOverlayProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [character, setCharacter] = useState<CharacterEntry | null>(null);
  const ink = readableTextOn(themeColor);

  return (
    <>
      {character ? (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <CharacterLayer
            cutoutUri={character.cutoutUri}
            intrinsicW={character.intrinsicW}
            intrinsicH={character.intrinsicH}
            parentSize={parentSize}
            editMode={editMode}
            onLongPress={() => setPickerOpen(true)}
          />
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[styles.chipWrap, { bottom: chipBottomOffset }]}>
        <Pressable
          onPress={() => {
            hapticsBridge.tap();
            setPickerOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={character ? 'Swap character' : 'Pick character'}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: themeColor,
              opacity: pressed ? 0.85 : 1,
            },
          ]}>
          <Ionicons
            name={character ? 'person' : 'person-add-outline'}
            size={16}
            color={ink}
          />
          <ThemedText variant="captionSmall" weight="700" style={{ color: ink, letterSpacing: 0.5 }}>
            {character ? 'CHARACTER' : 'ADD CHARACTER'}
          </ThemedText>
        </Pressable>
      </View>

      <CharacterPickerSheet
        visible={pickerOpen}
        selectedId={character?.id ?? null}
        onSelect={(entry) => {
          setCharacter(entry);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
