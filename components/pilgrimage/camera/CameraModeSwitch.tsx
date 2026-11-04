import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useT } from '../../../libs/i18n';
import type { CameraMode } from '../../../libs/services/pilgrimage/camera-ui';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { readableTextOn, ThemedText } from '../../themed';
import { CameraChrome } from './cameraChrome';

const MODES: readonly CameraMode[] = ['record', 'anime'];
const SEGMENT_WIDTH = 76;
const INSET = 3;

interface CameraModeSwitchProps {
  mode: CameraMode;
  themeColor: string;
  onChange: (mode: CameraMode) => void;
}

/**
 * 紀錄｜動漫 above the shutter. Recording is the default way to use the camera;
 * 動漫 adds the scene reference and overlays without leaving the screen.
 * Floats over the live preview, so it uses the camera chrome, not theme surfaces.
 */
function CameraModeSwitchImpl({ mode, themeColor, onChange }: CameraModeSwitchProps) {
  const t = useT();
  const index = MODES.indexOf(mode);
  const knobX = useSharedValue(index * SEGMENT_WIDTH);
  // Starts at the right segment; later changes slide the knob across.
  useEffect(() => {
    knobX.value = withTiming(index * SEGMENT_WIDTH, { duration: 200 });
  }, [index, knobX]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knobX.value }] }));

  return (
    <View style={styles.track} accessibilityRole="tablist">
      <Animated.View style={[styles.knob, { backgroundColor: themeColor }, knobStyle]} />
      {MODES.map((value) => {
        const selected = value === mode;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={4}
            onPress={() => {
              if (selected) return;
              hapticsBridge.selection();
              onChange(value);
            }}
            style={styles.segment}>
            <ThemedText
              variant="captionSmall"
              weight="700"
              style={{ color: selected ? readableTextOn(themeColor) : CameraChrome.fgMuted }}>
              {t(`pilgrimageUi.camera.mode.${value}`)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export const CameraModeSwitch = memo(CameraModeSwitchImpl);

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    height: 40,
    padding: INSET,
    borderRadius: 8,
    backgroundColor: CameraChrome.groupFill,
    borderWidth: 1,
    borderColor: CameraChrome.border,
  },
  knob: {
    position: 'absolute',
    top: INSET,
    left: INSET,
    width: SEGMENT_WIDTH,
    bottom: INSET,
    borderRadius: 6,
  },
  segment: {
    width: SEGMENT_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
