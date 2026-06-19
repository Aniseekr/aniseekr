import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open ? (
        <View style={styles.sliderPanel}>
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
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('pilgrimageUi.overlayOpacity')}
        onPress={() => {
          hapticsBridge.selection();
          setOpen((v) => !v);
        }}
        style={styles.pill}
      >
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
  value: { color: CameraChrome.fg, fontSize: 12, fontWeight: '600' },
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
