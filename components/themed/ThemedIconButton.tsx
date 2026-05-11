import { memo, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { readableTextOn } from './contrast';

export type IconButtonVariant = 'glass' | 'solid' | 'ghost';
export type IconButtonHaptic = 'selection' | 'tap' | 'none';

export interface ThemedIconButtonProps {
  /**
   * Icon element. Either a static node, or a render callback that receives
   * the resolved icon color so the icon stays readable for the variant.
   */
  icon: ReactNode | ((iconColor: string) => ReactNode);
  accessibilityLabel: string;
  onPress?: () => void;
  size?: number;
  variant?: IconButtonVariant;
  accent?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  haptic?: IconButtonHaptic;
  testID?: string;
}

function ThemedIconButtonComponent({
  icon,
  accessibilityLabel,
  onPress,
  size = 44,
  variant = 'glass',
  accent,
  disabled = false,
  style,
  haptic = 'tap',
  testID,
}: ThemedIconButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  let backgroundColor: string = 'transparent';
  let borderColor: string = 'transparent';
  let borderWidth = 0;
  let iconColor: string = theme.text.primary;

  if (variant === 'glass') {
    backgroundColor = theme.background.secondary;
    borderColor = theme.glassBorder;
    borderWidth = 1;
    iconColor = theme.text.primary;
  } else if (variant === 'solid') {
    const a = accent ?? theme.accent;
    backgroundColor = a;
    iconColor = readableTextOn(a);
  } else {
    iconColor = theme.text.secondary;
  }

  const handlePress = () => {
    if (disabled) return;
    if (haptic === 'selection') hapticsBridge.selection();
    else if (haptic === 'tap') hapticsBridge.tap();
    onPress?.();
  };

  const renderIcon = typeof icon === 'function' ? icon(iconColor) : icon;

  return (
    <Animated.View style={[animStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => {
          if (!disabled) scale.value = withSpring(0.92, { damping: 12, stiffness: 350 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 350 });
        }}
        onPress={handlePress}
        testID={testID}
        style={({ pressed }) => [
          styles.base,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor,
            borderColor,
            borderWidth,
            opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          },
        ]}>
        <View style={styles.content}>{renderIcon}</View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ThemedIconButton = memo(ThemedIconButtonComponent);
