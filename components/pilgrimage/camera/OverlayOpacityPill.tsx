import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useT } from '../../../libs/i18n';
import { CameraChrome } from './cameraChrome';

interface OverlayOpacityPillProps {
  opacity: number;
  themeColor: string;
  /** Live alpha during the drag — drives the overlay render (HUD). */
  onChange: (next: number) => void;
  /** Final alpha on release — persisted per overlay mode. */
  onComplete?: (next: number) => void;
}

/**
 * Overlay-opacity slider that lives inline in the zoom band, ALWAYS visible (no
 * tap-to-open popover). The slider is a `flex: 1` child of a fixed-width pill so
 * its full track stays inside the parent's hit-test bounds — the previous
 * popover sized the panel (200px) wider than its `wrap` parent (~60px), so the
 * overhang was un-touchable (iOS `hitTest` returns nil outside bounds, Android
 * clips) and the slider "couldn't be dragged". Bounding the slider fixes that.
 */
function OverlayOpacityPillComponent({
  opacity,
  themeColor,
  onChange,
  onComplete,
}: OverlayOpacityPillProps) {
  const t = useT();
  return (
    <View style={styles.wrap}>
      <Ionicons name="contrast-outline" size={16} color={CameraChrome.fg} />
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={1}
        value={opacity}
        minimumTrackTintColor={themeColor}
        maximumTrackTintColor={CameraChrome.trackInactive}
        thumbTintColor={CameraChrome.fg}
        onValueChange={onChange}
        onSlidingComplete={onComplete}
        accessibilityLabel={t('pilgrimageUi.overlayOpacity')}
      />
      <Text style={styles.value}>{Math.round(opacity * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Fixed basis with flexShrink so the slider's track stays inside the
    // parent's bounds (touchable end-to-end) while still yielding space to the
    // zoom presets on narrow portrait screens.
    width: 196,
    flexShrink: 1,
    height: CameraChrome.controlHeight,
    paddingLeft: 12,
    paddingRight: 10,
    borderRadius: CameraChrome.pillRadius,
    backgroundColor: CameraChrome.controlFill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CameraChrome.border,
  },
  slider: { flex: 1, height: 36 },
  value: {
    color: CameraChrome.fg,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 34,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});

export default memo(OverlayOpacityPillComponent);
