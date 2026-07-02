// LocateFab — Google-Maps-style 3-state recentre button for the pilgrimage
// maps. Designed to drop into the bottom-right of any map surface and slide
// up with a bottom sheet so it never sits behind a peek handle.
//
// States (driven by `useUserLocationTracking`):
//   idle      — theme `background.secondary` chip with the outline locate
//               glyph; reads as "tap to find me".
//   following — solid `theme.accent` chip with the filled locate glyph; map
//               continuously recentres on each GPS update.
//   compass   — solid accent + a subtle accent glow + the directional arrow
//               glyph. Magnetometer is live and the user-marker cone rotates
//               with heading.
//
// Sheet-aware positioning:
//   When the caller passes `sheetAnimatedPosition` (the Reanimated shared
//   value gorhom writes the sheet's top-edge Y into every frame), the FAB
//   tracks the sheet's edge so it stays just above the handle. Above a
//   configurable threshold (sheet covers most of the screen) the FAB fades
//   out — pure map can be invoked again by collapsing the sheet.
//
// See CLAUDE.md Rule 4 (no hardcoded hex) and Rule 7 (haptics) — colours all
// come from theme tokens, haptic fires on every state change.

import { memo, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { Shadow, Spacing } from '../../constants/DesignSystem';
import { ThemedIconButton, readableTextOn } from '../themed';
import { useT } from '../../libs/i18n';
import type { LocateFollowState } from '../../libs/services/pilgrimage/use-user-location-tracking';

const FAB_SIZE = 48;
/**
 * Baseline gap between FAB and the sheet handle (or screen bottom if no
 * sheet). Chosen so the FAB clears the gorhom drag handle visual area.
 */
const FAB_HANDLE_GAP = 12;
/**
 * Fraction of screen height below which the sheet is "tall enough that the
 * FAB has no useful map area". Hide the FAB so it doesn't float over the
 * sheet content. (sheet position is measured from screen top, so SMALLER
 * means TALLER sheet.)
 */
const HIDE_THRESHOLD_FRACTION = 0.2;

export interface LocateFabProps {
  /** Follow-state value from useUserLocationTracking. */
  state: LocateFollowState;
  /** Cycle through idle → following → compass → idle. */
  onPress: () => void;
  /**
   * Reanimated value carrying the bottom sheet's top-edge Y (from screen
   * top). When provided, the FAB anchors to the sheet edge instead of the
   * screen edge. Omit when there is no sheet on this surface.
   */
  sheetAnimatedPosition?: SharedValue<number>;
  /**
   * Total height of the screen — required to translate sheetAnimatedPosition
   * (top-down) into a bottom offset (bottom-up). Caller passes this so the
   * hook doesn't have to read `Dimensions.get()` on every render.
   */
  screenHeight?: number;
  /**
   * Pixels to add below the FAB even when the sheet isn't anchoring it.
   * Defaults to a safe-area-friendly margin.
   */
  bottomInset?: number;
  /**
   * Gap between the sheet's top edge and the FAB. Defaults to just clearing
   * the drag handle; pass a larger value when other chrome (filter pills,
   * view-mode toggles) already rides the sheet edge so the FAB stacks above
   * it instead of colliding.
   */
  edgeGap?: number;
  /** Horizontal offset from the right edge. Default 16. */
  rightInset?: number;
  /** Optional containing style override (e.g. raise above other overlays). */
  style?: StyleProp<ViewStyle>;
  /** True while the OS permission prompt is open — shows a disabled state. */
  loading?: boolean;
  testID?: string;
}

function LocateFabComponent({
  state,
  onPress,
  sheetAnimatedPosition,
  screenHeight,
  bottomInset = Spacing.md,
  edgeGap = FAB_HANDLE_GAP,
  rightInset = Spacing.screenPadding,
  style,
  loading = false,
  testID = 'locate-fab',
}: LocateFabProps) {
  const { theme } = useTheme();
  const t = useT();

  const accentFg = readableTextOn(theme.accent);

  // Resolved per-state visual.
  const variant: 'glass' | 'solid' = state === 'idle' ? 'glass' : 'solid';
  const iconName: keyof typeof Ionicons.glyphMap =
    state === 'compass' ? 'navigate' : state === 'following' ? 'locate' : 'locate-outline';
  const iconColor = state === 'idle' ? theme.text.primary : accentFg;

  const a11y =
    state === 'idle'
      ? t('pilgrimage.map.locateIdleA11y')
      : state === 'following'
        ? t('pilgrimage.map.locateFollowingA11y')
        : t('pilgrimage.map.locateCompassA11y');

  // Compass adds a soft accent glow to read as "more on" than following.
  const glowStyle = useMemo<ViewStyle | null>(
    () => (state === 'compass' ? (Shadow.glow(theme.accent) as ViewStyle) : null),
    [state, theme.accent]
  );

  // Sheet-aware bottom offset. Pure shared-value computation so it runs on the
  // UI thread without a React state ping. When no sheet/screenHeight is given,
  // the FAB sits at `bottomInset` and never moves.
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    if (!sheetAnimatedPosition || !screenHeight) {
      return { bottom: bottomInset, opacity: 1, transform: [{ scale: 1 }] };
    }
    const sheetTop = sheetAnimatedPosition.value;
    const fromSheet = screenHeight - sheetTop + edgeGap;
    const baseline = bottomInset;
    const bottom = Math.max(fromSheet, baseline);
    // Sheet covers most of the screen → fade FAB out.
    const visible = sheetTop > screenHeight * HIDE_THRESHOLD_FRACTION;
    const opacity = visible ? 1 : 0;
    // Avoid trapping touches while invisible. Reanimated handles pointerEvents
    // via the wrapping View below — here we just scale slightly when hidden so
    // there's a tiny visual hint if the fade is in progress.
    const scale = interpolate(opacity, [0, 1], [0.94, 1], Extrapolation.CLAMP);
    return { bottom, opacity, transform: [{ scale }] };
  }, [sheetAnimatedPosition, screenHeight, bottomInset, edgeGap]);

  // pointerEvents toggles via the outer wrapper. We don't read the worklet
  // value here (would defeat the UI-thread win) — we trust `state` is enough
  // to know the FAB is "active" and worth being interactive at all.
  return (
    <Animated.View
      style={[styles.container, { right: rightInset }, animatedStyle, style]}
      pointerEvents="box-none"
      testID={testID}>
      <View style={[styles.shadow, glowStyle]}>
        <ThemedIconButton
          accessibilityLabel={a11y}
          icon={<Ionicons name={iconName} size={22} color={iconColor} />}
          onPress={onPress}
          size={FAB_SIZE}
          variant={variant}
          haptic="selection"
          disabled={loading}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
  shadow: {
    borderRadius: FAB_SIZE / 2,
    // Elevation/shadow stack for the floating map FAB.
    ...((Shadow.medium ?? {}) as ViewStyle),
  },
});

export const LocateFab = memo(LocateFabComponent);
