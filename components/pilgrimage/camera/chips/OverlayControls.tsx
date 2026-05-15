import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import type { OverlayMode } from '../types';

interface OverlayControlsProps {
  mode: OverlayMode;
  opacity: number;
  flipped: boolean;
  themeColor: string;
  onSelectMode: (mode: OverlayMode) => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleFlip: () => void;
}

interface ModeMeta {
  id: OverlayMode;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

const MODES: ModeMeta[] = [
  { id: 'anime', icon: 'image-outline', label: 'Anime' },
  { id: 'sketch', icon: 'pencil-outline', label: 'Sketch' },
  { id: 'edge', icon: 'analytics-outline', label: 'Edge' },
];

/**
 * Overlay tool controls — mode pills, opacity slider, flip toggle. Renders as
 * a flat block in normal flow (no chip, no absolute pop-out); it is mounted by
 * CameraToolMenu's drill-in sub-view, so it just needs to fill the panel width.
 */
export default function OverlayControls({
  mode,
  opacity,
  flipped,
  themeColor,
  onSelectMode,
  onChangeOpacity,
  onToggleFlip,
}: OverlayControlsProps) {
  const handleSelectMode = (next: OverlayMode) => {
    if (next === mode) return;
    hapticsBridge.selection();
    onSelectMode(next);
  };

  const handleFlip = () => {
    hapticsBridge.tap();
    onToggleFlip();
  };

  return (
    <View style={styles.root}>
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const active = m.id === mode;
          const fg = active ? readableTextOn(themeColor) : '#fff';
          return (
            <Pressable
              key={m.id}
              onPress={() => handleSelectMode(m.id)}
              accessibilityRole="button"
              accessibilityLabel={`Overlay mode ${m.label}`}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.modePill,
                active && { backgroundColor: themeColor, borderColor: themeColor },
                pressed && { opacity: 0.75 },
              ]}>
              <Ionicons name={m.icon} size={14} color={fg} />
              <ThemedText variant="captionSmall" weight="600" style={{ color: fg }}>
                {m.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sliderRow}>
        <ThemedText variant="captionSmall" weight="600" style={styles.sliderLabel}>
          {Math.round(opacity * 100)}%
        </ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={opacity}
          onValueChange={onChangeOpacity}
          minimumTrackTintColor={themeColor}
          maximumTrackTintColor="rgba(255,255,255,0.25)"
          thumbTintColor="#fff"
          accessibilityLabel="Overlay opacity"
        />
      </View>

      <Pressable
        onPress={handleFlip}
        accessibilityRole="button"
        accessibilityLabel="Flip overlay horizontally"
        accessibilityState={{ selected: flipped }}
        style={({ pressed }) => [
          styles.flipBtn,
          flipped && { backgroundColor: themeColor, borderColor: themeColor },
          pressed && { opacity: 0.75 },
        ]}>
        <Ionicons
          name="swap-horizontal"
          size={14}
          color={flipped ? readableTextOn(themeColor) : '#fff'}
        />
        <ThemedText
          variant="captionSmall"
          weight="600"
          style={{ color: flipped ? readableTextOn(themeColor) : '#fff' }}>
          Flip
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modePill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  sliderLabel: { color: '#fff', width: 40 },
  slider: { flex: 1, height: 36 },
  flipBtn: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
});
