import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useT } from '../../../libs/i18n';
import type { CameraMode } from '../../../libs/services/pilgrimage/camera-ui';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { ThemedText } from '../../themed';
import { CameraChrome } from './cameraChrome';

const MODES: readonly CameraMode[] = ['record', 'anime'];

interface CameraModeSwitchProps {
  mode: CameraMode;
  themeColor: string;
  onChange: (mode: CameraMode) => void;
}

/**
 * 紀錄　動漫 as plain words right above the shutter, like a camera's mode
 * labels — light enough that the bottom of the screen stays calm. The active
 * mode is the accent colour with a dot under it.
 */
function CameraModeSwitchImpl({ mode, themeColor, onChange }: CameraModeSwitchProps) {
  const t = useT();
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {MODES.map((value) => {
        const selected = value === mode;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
            onPress={() => {
              if (selected) return;
              hapticsBridge.selection();
              onChange(value);
            }}
            style={styles.tab}>
            <ThemedText
              variant="bodySmall"
              weight="700"
              style={{ color: selected ? themeColor : CameraChrome.fgMuted }}>
              {t(`pilgrimageUi.camera.mode.${value}`)}
            </ThemedText>
            {selected ? (
              <Animated.View
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(100)}
                style={[styles.dot, { backgroundColor: themeColor }]}
              />
            ) : (
              <View style={styles.dotSpace} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export const CameraModeSwitch = memo(CameraModeSwitchImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  tab: { alignItems: 'center', gap: 3, minWidth: 44 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  dotSpace: { width: 4, height: 4 },
});
