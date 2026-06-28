import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useT } from '../../../libs/i18n';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  OVERLAY_CAROUSEL_ITEMS,
  clampOverlayIndex,
  nextOverlayIndex,
  prevOverlayIndex,
} from '../../../libs/services/pilgrimage/overlay-carousel';
import type { CameraOrientationMode } from '../../../libs/services/pilgrimage/camera-ui';
import { readableTextOn } from '../../themed';
import { CameraChrome, cameraControlShadow } from './cameraChrome';

interface OverlayModeCarouselProps {
  /** Current carousel slot (0=Off … 4=Subject), from overlayCarouselIndex(hud). */
  index: number;
  /** Reports the new slot index; the screen maps it to a HUD patch via overlaySelectionForIndex. */
  onChangeIndex: (index: number) => void;
  themeColor: string;
  isLandscape: boolean;
  orientationMode: CameraOrientationMode;
}

interface CarouselItemProps {
  item: (typeof OVERLAY_CAROUSEL_ITEMS)[number];
  itemIndex: number;
  active: number;
  themeColor: string;
  rotate: string;
  onPress: () => void;
  label: string;
}

/**
 * One carousel slot. Hook-free: the active slot's label pops in / fades out via
 * Reanimated layout animations (`entering`/`exiting`) instead of React state, so
 * the mount/unmount choreography stays off the render path (Rule 9) and the slot
 * remains renderable by the synthetic unit-test renderer.
 */
function CarouselItem({ item, itemIndex, active, themeColor, rotate, onPress, label }: CarouselItemProps) {
  const selected = itemIndex === active;
  const fg = selected ? readableTextOn(themeColor) : CameraChrome.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.item,
        selected && { backgroundColor: themeColor },
        cameraControlShadow,
        pressed && { opacity: 0.85 },
      ]}>
      <Ionicons
        name={item.icon as keyof typeof Ionicons.glyphMap}
        size={16}
        color={fg}
        style={{ transform: [{ rotate }] }}
      />
      {selected ? (
        <Animated.Text
          entering={ZoomIn.springify().damping(20).stiffness(300)}
          exiting={ZoomOut.duration(120)}
          style={[styles.label, { color: fg, transform: [{ rotate }] }]}
          numberOfLines={1}>
          {label}
        </Animated.Text>
      ) : null}
    </Pressable>
  );
}

/**
 * The primary "align-with-scene" control: a left/right swipe + tap carousel of overlay modes
 * (Off · Anime · Edge · Sketch · Subject), sitting just above the shutter. Hook-free and fully
 * prop-driven so it stays unit-testable; the index math lives in overlay-carousel.ts.
 */
function OverlayModeCarouselComponent({
  index,
  onChangeIndex,
  themeColor,
  isLandscape,
  orientationMode,
}: OverlayModeCarouselProps) {
  const t = useT();
  const active = clampOverlayIndex(index);
  // Glyphs rotate in place only when the interface is landscape-locked (LAND); AUTO keeps UI upright.
  const rotate = isLandscape && orientationMode === 'landscape' ? '90deg' : '0deg';

  const step = (target: number) => {
    const next = clampOverlayIndex(target);
    if (next === active) return;
    hapticsBridge.selection();
    onChangeIndex(next);
  };

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX <= -24) step(nextOverlayIndex(active));
      else if (e.translationX >= 24) step(prevOverlayIndex(active));
    });

  return (
    <GestureDetector gesture={swipeGesture}>
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimageUi.previousOverlayMode')}
          onPress={() => step(prevOverlayIndex(active))}
          hitSlop={8}
          style={({ pressed }) => [styles.chevron, pressed && { opacity: 0.85 }]}>
          <Ionicons name="chevron-back" size={18} color={CameraChrome.fg} />
        </Pressable>
        <View style={styles.items} pointerEvents="box-none">
          {OVERLAY_CAROUSEL_ITEMS.map((item, i) => (
            <CarouselItem
              key={item.id}
              item={item}
              itemIndex={i}
              active={active}
              themeColor={themeColor}
              rotate={rotate}
              onPress={() => step(i)}
              label={t(item.labelKey)}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('pilgrimageUi.nextOverlayMode')}
          onPress={() => step(nextOverlayIndex(active))}
          hitSlop={8}
          style={({ pressed }) => [styles.chevron, pressed && { opacity: 0.85 }]}>
          <Ionicons name="chevron-forward" size={18} color={CameraChrome.fg} />
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chevron: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  items: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  item: {
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
  label: { fontSize: 13, fontWeight: '600' },
});

export default memo(OverlayModeCarouselComponent);
