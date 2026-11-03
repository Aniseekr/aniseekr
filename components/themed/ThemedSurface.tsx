import { ReactNode, type Ref } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle, type ViewInstance } from 'react-native';
import { Ink, Radius, Spacing } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { withAlpha } from './contrast';

export type SurfaceVariant = 'card' | 'elevated' | 'outlined' | 'sheet';

export interface ThemedSurfaceProps {
  variant?: SurfaceVariant;
  radius?: number;
  padded?: boolean | number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  ref?: Ref<ViewInstance>;
}

export function ThemedSurface({
  variant = 'card',
  radius = Radius.card,
  padded,
  style,
  children,
  ref,
}: ThemedSurfaceProps) {
  const { theme } = useTheme();

  // v6 ink: cards carry a soft hairline frame; elevated panels and outlines
  // use the full ink colour at the same hairline weight.
  let backgroundColor = theme.background.secondary;
  let borderColor: string = withAlpha(theme.text.primary, 0.22);
  let borderWidth: number = Ink.hairline;

  if (variant === 'elevated') {
    backgroundColor = theme.background.tertiary;
    borderColor = theme.text.primary;
  } else if (variant === 'outlined') {
    backgroundColor = 'transparent';
    borderColor = theme.text.primary;
  } else if (variant === 'sheet') {
    backgroundColor = theme.background.primary;
  }

  const padding = padded === true ? Spacing.md : typeof padded === 'number' ? padded : 0;

  return (
    <View
      ref={ref}
      style={[
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderWidth,
          borderRadius: radius,
          padding,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
});
