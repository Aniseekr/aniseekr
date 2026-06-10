// Bottom tool dock for the cutout editor: erase/restore segment, brush
// sliders, edge-tool chips (each tap = one undoable op), and view controls
// (backdrop cycle, mask overlay, reset, use-original).

import { Pressable, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedSurface, ThemedText, readableTextOn } from '../../themed';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import type { BrushTool, MaskFilterKind } from '../../../libs/services/companion/cutout-ops';

export interface EditorDockProps {
  tool: BrushTool;
  brushSize: number;
  brushHardness: number;
  maskOverlay: boolean;
  onToolChange: (tool: BrushTool) => void;
  onBrushSizeChange: (size: number) => void;
  onBrushHardnessChange: (hardness: number) => void;
  onEdgeTool: (filter: MaskFilterKind) => void;
  onBackgroundCycle: () => void;
  onMaskOverlayToggle: () => void;
  onReset: () => void;
  onUseOriginal: () => void;
}

const EDGE_TOOLS: { key: MaskFilterKind; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'feather', icon: 'rose-outline' },
  { key: 'smooth', icon: 'water-outline' },
  { key: 'shrink', icon: 'contract-outline' },
  { key: 'expand', icon: 'expand-outline' },
];

export function EditorDock(props: EditorDockProps) {
  const { theme } = useTheme();
  const t = useT();
  const accentFg = readableTextOn(theme.accent);

  const edgeLabels: Record<MaskFilterKind, string> = {
    feather: t('companion.cutout.feather'),
    smooth: t('companion.cutout.smooth'),
    shrink: t('companion.cutout.shrink'),
    expand: t('companion.cutout.expand'),
  };

  const segment = (value: BrushTool, label: string) => {
    const active = props.tool === value;
    return (
      <Pressable
        onPress={() => {
          hapticsBridge.selection();
          props.onToolChange(value);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[
          styles.segment,
          {
            backgroundColor: active ? theme.accent : 'transparent',
            borderColor: active ? theme.accent : theme.glassBorder,
          },
        ]}>
        <ThemedText
          variant="bodySmall"
          weight="700"
          style={{ color: active ? accentFg : theme.text.secondary }}>
          {label}
        </ThemedText>
      </Pressable>
    );
  };

  const chip = (
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    onPress: () => void,
    active = false
  ) => (
    <Pressable
      key={label}
      onPress={() => {
        hapticsBridge.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.accent : theme.background.secondary,
          borderColor: active ? theme.accent : theme.glassBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Ionicons name={icon} size={16} color={active ? accentFg : theme.text.primary} />
      <ThemedText
        variant="captionSmall"
        weight="600"
        style={{ color: active ? accentFg : theme.text.secondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <ThemedSurface variant="elevated" style={styles.dock}>
      <View style={styles.segmentRow}>
        {segment('erase', t('companion.cutout.erase'))}
        {segment('restore', t('companion.cutout.restore'))}
      </View>

      <View style={styles.sliderRow}>
        <ThemedText variant="captionSmall" tone="secondary" style={styles.sliderLabel}>
          {t('companion.cutout.brushSize')}
        </ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={8}
          maximumValue={160}
          value={props.brushSize}
          onValueChange={props.onBrushSizeChange}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.glassBorder}
          thumbTintColor={theme.accent}
        />
      </View>
      <View style={styles.sliderRow}>
        <ThemedText variant="captionSmall" tone="secondary" style={styles.sliderLabel}>
          {t('companion.cutout.hardness')}
        </ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={0.3}
          maximumValue={1}
          value={props.brushHardness}
          onValueChange={props.onBrushHardnessChange}
          minimumTrackTintColor={theme.accent}
          maximumTrackTintColor={theme.glassBorder}
          thumbTintColor={theme.accent}
        />
      </View>

      <View style={styles.chipRow}>
        {EDGE_TOOLS.map((tool) =>
          chip(edgeLabels[tool.key], tool.icon, () => props.onEdgeTool(tool.key))
        )}
      </View>

      <View style={styles.chipRow}>
        {chip(
          t('companion.cutout.maskView'),
          'contrast-outline',
          props.onMaskOverlayToggle,
          props.maskOverlay
        )}
        {chip(t('companion.cutout.background'), 'grid-outline', props.onBackgroundCycle)}
        {chip(t('companion.cutout.reset'), 'refresh-outline', props.onReset)}
        {chip(t('companion.cutout.useOriginal'), 'image-outline', props.onUseOriginal)}
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  dock: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sliderLabel: { width: 64 },
  slider: { flex: 1, height: 32 },
  chipRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
});
