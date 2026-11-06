import { memo, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ink, Radius, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { readableTextOn, withAlpha } from './contrast';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';
/** Kept for call-site compatibility: every shape now draws the one v6 corner. */
export type ButtonShape = 'pill' | 'rounded' | 'square';
export type ButtonHaptic = 'selection' | 'tap' | 'success' | 'warning' | 'none';

interface SizeSpec {
  minHeight: number;
  paddingH: number;
  gap: number;
  font: TextStyle;
  /** Hard drop-shadow offset (the web's `box-shadow: 3px 3px 0`). */
  lift: number;
}

const SIZE_STYLES: Record<ButtonSize, SizeSpec> = {
  // Chips, segments and regular actions stay flat; only the lg hero CTA
  // carries the web's hard shadow, so a screen has at most one loud element.
  sm: { minHeight: 36, paddingH: 14, gap: 6, font: Typography.titleSmall, lift: 0 },
  md: { minHeight: 44, paddingH: 20, gap: 8, font: Typography.titleMedium, lift: 0 },
  lg: { minHeight: 52, paddingH: 24, gap: 8, font: Typography.titleLarge, lift: Ink.lift },
};

const PRESS_SPRING = { damping: 20, stiffness: 520 };

export interface ThemedButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  haptic?: ButtonHaptic;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** Override the accent used as the primary background. Defaults to theme.accent. */
  accent?: string;
  testID?: string;
}

/**
 * v6 button (matches aniseekr.moe): one small corner for every variant. Only
 * the lg primary hero CTA is loud — accent fill on a hard ink shadow the face
 * sinks into on press; everything else stays flat or a quiet hairline frame.
 * Colours stay theme-driven.
 */
function ThemedButtonComponent({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconRight,
  haptic,
  accessibilityLabel,
  style,
  textStyle,
  accent: accentOverride,
  testID,
}: ThemedButtonProps) {
  const { theme } = useTheme();
  const accent = accentOverride ?? theme.accent;
  const ink = theme.text.primary;
  const sz = SIZE_STYLES[size];
  const isDisabled = disabled || loading;

  let backgroundColor: string = 'transparent';
  let borderColor: string = 'transparent';
  let borderWidth = 0;
  let plateColor: string | null = null;
  let textColor: string = theme.text.primary;
  let textWeight: TextStyle['fontWeight'] = '700';

  if (variant === 'primary') {
    backgroundColor = accent;
    plateColor = ink;
    textColor = readableTextOn(accent);
    textWeight = '800';
  } else if (variant === 'secondary') {
    backgroundColor = theme.background.secondary;
    borderColor = withAlpha(ink, 0.22);
    borderWidth = Ink.hairline;
  } else if (variant === 'outline') {
    borderColor = accent;
    borderWidth = Ink.hairline;
    textColor = accent;
  } else if (variant === 'destructive') {
    const destructive = theme.status.error;
    backgroundColor = destructive;
    textColor = readableTextOn(destructive);
    textWeight = '800';
  } else {
    textColor = theme.text.secondary;
    textWeight = '600';
  }

  const lift = plateColor && !isDisabled ? sz.lift : 0;
  // 0 → 1 while pressed: a lifted CTA sinks into its shadow, a flat button
  // gets the house press-scale.
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: press.value * lift },
      { translateY: press.value * lift },
      { scale: lift > 0 ? 1 : 1 - press.value * 0.04 },
    ],
  }));

  const handlePressIn = () => {
    if (isDisabled) return;
    press.value = withSpring(1, PRESS_SPRING);
  };
  const handlePressOut = () => {
    press.value = withSpring(0, PRESS_SPRING);
  };
  const handlePress = () => {
    if (isDisabled) return;
    const effective: ButtonHaptic = haptic ?? (variant === 'primary' ? 'selection' : 'tap');
    if (effective === 'selection') hapticsBridge.selection();
    else if (effective === 'tap') hapticsBridge.tap();
    else if (effective === 'success') hapticsBridge.success();
    else if (effective === 'warning') hapticsBridge.warning();
    onPress?.();
  };

  return (
    <View
      style={[
        { paddingRight: lift, paddingBottom: lift },
        fullWidth ? styles.fullWidth : undefined,
        style,
      ]}>
      {lift > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.plate,
            { top: lift, left: lift, backgroundColor: plateColor ?? undefined },
          ]}
        />
      ) : null}
      <Animated.View style={faceStyle}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled: isDisabled, busy: loading }}
          testID={testID}
          style={({ pressed }) => [
            styles.base,
            {
              minHeight: sz.minHeight,
              paddingHorizontal: sz.paddingH,
              gap: sz.gap,
              backgroundColor,
              borderColor,
              borderWidth,
              opacity: isDisabled ? 0.4 : pressed && lift === 0 ? 0.88 : 1,
            },
          ]}>
          {loading ? (
            <ActivityIndicator size="small" color={textColor} />
          ) : icon ? (
            <View style={styles.iconSlot}>{icon}</View>
          ) : null}
          <Text
            numberOfLines={1}
            style={[sz.font, { color: textColor, fontWeight: textWeight }, textStyle]}>
            {label}
          </Text>
          {!loading && iconRight ? <View style={styles.iconSlot}>{iconRight}</View> : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  plate: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderRadius: Radius.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ThemedButton = memo(ThemedButtonComponent);
