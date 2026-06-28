import { Ionicons } from '@expo/vector-icons';
import { memo, useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { CameraChrome } from './cameraChrome';

interface OverlayOpacityPillProps {
  opacity: number;
  themeColor: string;
  onChange: (next: number) => void;
}

/**
 * The `◐` overlay-opacity control that lives in the zoom band. Tapping the compact pill
 * expands the same fine-grained 0..1 slider the old dock used, so no control is lost.
 */
function OverlayOpacityPillComponent({ opacity, themeColor, onChange }: OverlayOpacityPillProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const panelProgress = useSharedValue(0);

  useEffect(() => {
    panelProgress.value = withTiming(open ? 1 : 0, { duration: 180 });
  }, [open, panelProgress]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: panelProgress.value,
    transform: [{ translateY: (1 - panelProgress.value) * 4 }],
  }));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View
        style={[styles.sliderPanel, panelStyle]}
        pointerEvents={open ? 'auto' : 'none'}>
        <Slider
          style={styles.slider}
          minimumValue={0}
          maximumValue={1}
          value={opacity}
          minimumTrackTintColor={themeColor}
          maximumTrackTintColor={CameraChrome.trackInactive}
          onValueChange={onChange}
          accessibilityLabel={t('pilgrimageUi.overlayOpacity')}
        />
      </Animated.View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimageUi.overlayOpacity')}
        onPress={() => {
          hapticsBridge.selection();
          setOpen((v) => !v);
        }}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}>
        <Ionicons name="contrast-outline" size={16} color={CameraChrome.fg} />
        <Text style={styles.value}>{Math.round(opacity * 100)}%</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: CameraChrome.controlHeight,
    paddingHorizontal: 12,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CameraChrome.border,
  },
  value: { color: CameraChrome.fg, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sliderPanel: {
    position: 'absolute',
    bottom: CameraChrome.controlHeight + 8,
    width: 200,
    backgroundColor: CameraChrome.groupFill,
    borderRadius: CameraChrome.groupRadius,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  slider: { width: 184, height: 36 },
});

export default memo(OverlayOpacityPillComponent);
