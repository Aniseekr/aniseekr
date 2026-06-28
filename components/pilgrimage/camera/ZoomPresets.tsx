import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { formatFocalStopLabel, isFocalStopActive } from '../../../libs/services/pilgrimage/zoom-presets';
import { readableTextOn } from '../../themed';
import { CameraChrome } from './cameraChrome';
import type { FocalStop } from './types';

interface ZoomPresetsProps {
  /** Device-derived focal stops (e.g. [0.5, 1, 2, 3]); rendered one pill each. */
  stops: FocalStop[];
  activeStop: FocalStop | null;
  themeColor: string;
  /** Sets the digital zoom for the tapped stop (wired to useCameraZoom.setStop). */
  onPick: (stop: FocalStop) => void;
  /**
   * When present, tapping the 0.5× pill on a standalone-ultra-wide device also swaps the
   * physical lens (folds in the old ZoomDial island so one-tap ultra-wide is not a regression).
   */
  onPickUltraWide?: () => void;
  /** Rotate labels 90° in landscape-locked mode. */
  rotateLabels?: boolean;
}

/**
 * Samsung-style zoom preset pills. Replaces the continuous ZoomDial; pinch-to-zoom and
 * pinch-driven lens swaps stay in useCameraZoom.pinchGesture (unchanged, on CameraStage).
 */
function ZoomPresetsComponent({ stops, activeStop, themeColor, onPick, onPickUltraWide, rotateLabels }: ZoomPresetsProps) {
  if (!stops.length) return null;
  const rotate = rotateLabels ? '90deg' : '0deg';
  return (
    <View style={styles.row} pointerEvents="box-none">
      {stops.map((stop) => {
        const active = isFocalStopActive(stop, activeStop);
        const fg = active ? readableTextOn(themeColor) : CameraChrome.fg;
        return (
          <Pressable
            key={stop}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={formatFocalStopLabel(stop)}
            onPress={() => {
              hapticsBridge.selection();
              if (stop === 0.5 && onPickUltraWide) onPickUltraWide();
              onPick(stop);
            }}
            style={({ pressed }) => [styles.pill, active && { backgroundColor: themeColor }, pressed && { transform: [{ scale: 0.96 }] }]}
          >
            <Text style={[styles.label, { color: fg, transform: [{ rotate }] }]}>{formatFocalStopLabel(stop)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: {
    minWidth: 40,
    height: CameraChrome.controlHeight,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CameraChrome.border,
  },
  label: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

export default memo(ZoomPresetsComponent);
