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
import { Radius, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { readableTextOn } from './contrast';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonShape = 'pill' | 'rounded' | 'square';
export type ButtonHaptic = 'selection' | 'tap' | 'success' | 'warning' | 'none';

interface SizeSpec {
  minHeight: number;
  paddingH: number;
  gap: number;
  font: TextStyle;
}

const SIZE_STYLES: Record<ButtonSize, SizeSpec> = {
  sm: { minHeight: 36, paddingH: 14, gap: 6, font: Typography.titleSmall },
  md: { minHeight: 44, paddingH: 20, gap: 8, font: Typography.titleMedium },
  lg: { minHeight: 52, paddingH: 24, gap: 8, font: Typography.titleLarge },
};

const SHAPE_RADIUS: Record<ButtonShape, number> = {
  pill: Radius.full,
  rounded: Radius.card,
  square: Radius.sm,
};

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

function ThemedButtonComponent({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  shape = 'pill',
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
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isDisabled = disabled || loading;

  const handlePressIn = () => {
    if (isDisabled) return;
    scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
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

  const sz = SIZE_STYLES[size];
  const radius = SHAPE_RADIUS[shape];

  let backgroundColor: string = 'transparent';
  let borderColor: string = 'transparent';
  let borderWidth = 0;
  let textColor: string = theme.text.primary;
  let textWeight: TextStyle['fontWeight'] = '600';

  if (variant === 'primary') {
    backgroundColor = accent;
    textColor = readableTextOn(accent);
    textWeight = '700';
  } else if (variant === 'secondary') {
    backgroundColor = theme.background.tertiary;
    borderColor = theme.glassBorder;
    borderWidth = 1;
    textColor = theme.text.primary;
  } else if (variant === 'ghost') {
    backgroundColor = 'transparent';
    textColor = theme.text.secondary;
  } else if (variant === 'outline') {
    backgroundColor = 'transparent';
    borderColor = accent;
    borderWidth = 1.5;
    textColor = accent;
    textWeight = '700';
  } else if (variant === 'destructive') {
    const destructive = theme.status.error;
    backgroundColor = destructive;
    textColor = readableTextOn(destructive);
    textWeight = '700';
  }

  const containerWidthStyle = fullWidth ? styles.fullWidth : undefined;

  return (
    <Animated.View style={[animStyle, containerWidthStyle, style]}>
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
            borderRadius: radius,
            opacity: isDisabled ? 0.4 : pressed ? 0.88 : 1,
            alignSelf: fullWidth ? 'stretch' : 'auto',
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
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
