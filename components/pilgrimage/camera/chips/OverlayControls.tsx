import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { readableTextOn, ThemedText } from '../../../themed';
import { hapticsBridge } from '../../../../modules/haptics/hapticsBridge';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  type EdgeIntensity,
} from '../../../../libs/services/pilgrimage/edge-overlay';
import type { OverlayMode } from '../types';

interface OverlayControlsProps {
  mode: OverlayMode;
  edgeIntensity: EdgeIntensity;
  opacity: number;
  flipped: boolean;
  /** Whether the overlay is in free-drag reposition mode. */
  editMode: boolean;
  themeColor: string;
  onSelectMode: (mode: OverlayMode) => void;
  onSelectEdgeIntensity: (intensity: EdgeIntensity) => void;
  onChangeOpacity: (opacity: number) => void;
  onToggleFlip: () => void;
  /** Toggles reposition mode. The parent closes this popover so the drag surface is clear. */
  onToggleEdit: () => void;
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
  edgeIntensity,
  opacity,
  flipped,
  editMode,
  themeColor,
  onSelectMode,
  onSelectEdgeIntensity,
  onChangeOpacity,
  onToggleFlip,
  onToggleEdit,
}: OverlayControlsProps) {
  const handleSelectMode = (next: OverlayMode) => {
    if (next === mode) return;
    hapticsBridge.selection();
    onSelectMode(next);
  };

  const handleSelectEdgeIntensity = (next: EdgeIntensity) => {
    if (next === edgeIntensity) return;
    hapticsBridge.selection();
    onSelectEdgeIntensity(next);
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

      {mode === 'edge' ? (
        <View style={styles.edgeIntensityRow}>
          {EDGE_INTENSITIES.map((intensity) => {
            const active = intensity === edgeIntensity;
            const fg = active ? readableTextOn(themeColor) : '#fff';
            return (
              <Pressable
                key={intensity}
                onPress={() => handleSelectEdgeIntensity(intensity)}
                accessibilityRole="button"
                accessibilityLabel={`Edge intensity ${edgeIntensityLabel(intensity)}`}
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.edgeIntensityBtn,
                  active && { backgroundColor: themeColor, borderColor: themeColor },
                  pressed && { opacity: 0.75 },
                ]}>
                <ThemedText
                  variant="captionSmall"
                  weight="700"
                  numberOfLines={1}
                  style={{ color: fg }}>
                  {edgeIntensityLabel(intensity)}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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

      <View style={styles.actionRow}>
        <Pressable
          onPress={onToggleEdit}
          accessibilityRole="button"
          accessibilityLabel={editMode ? 'Lock overlay position' : 'Reposition overlay'}
          accessibilityState={{ selected: editMode }}
          style={({ pressed }) => [
            styles.actionBtn,
            editMode && { backgroundColor: themeColor, borderColor: themeColor },
            pressed && { opacity: 0.75 },
          ]}>
          <Ionicons
            name={editMode ? 'lock-open' : 'move'}
            size={14}
            color={editMode ? readableTextOn(themeColor) : '#fff'}
          />
          <ThemedText
            variant="captionSmall"
            weight="600"
            style={{ color: editMode ? readableTextOn(themeColor) : '#fff' }}>
            {editMode ? 'Repositioning' : 'Reposition'}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={handleFlip}
          accessibilityRole="button"
          accessibilityLabel="Flip overlay horizontally"
          accessibilityState={{ selected: flipped }}
          style={({ pressed }) => [
            styles.actionBtn,
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
  edgeIntensityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  edgeIntensityBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
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
