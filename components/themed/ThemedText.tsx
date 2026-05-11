import { memo, ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';

export type ThemedTextVariant =
  | 'displayLarge'
  | 'displayMedium'
  | 'headlineLarge'
  | 'headlineMedium'
  | 'headlineSmall'
  | 'titleLarge'
  | 'titleMedium'
  | 'titleSmall'
  | 'bodyLarge'
  | 'bodyMedium'
  | 'bodySmall'
  | 'caption'
  | 'captionSmall'
  | 'monospace';

export type ThemedTextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'inverse';

export interface ThemedTextProps extends Omit<TextProps, 'style'> {
  variant?: ThemedTextVariant;
  tone?: ThemedTextTone;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}

function ThemedTextComponent({
  variant = 'bodyMedium',
  tone = 'primary',
  weight,
  align,
  style,
  children,
  ...rest
}: ThemedTextProps) {
  const { theme } = useTheme();

  let color: string;
  switch (tone) {
    case 'secondary':
      color = theme.text.secondary;
      break;
    case 'tertiary':
      color = theme.text.tertiary;
      break;
    case 'accent':
      color = theme.accent;
      break;
    case 'success':
      color = '#30D158';
      break;
    case 'warning':
      color = '#FF9F0A';
      break;
    case 'error':
      color = '#FF453A';
      break;
    case 'inverse':
      color = theme.background.primary;
      break;
    case 'primary':
    default:
      color = theme.text.primary;
      break;
  }

  return (
    <Text
      {...rest}
      style={[Typography[variant], { color, textAlign: align, fontWeight: weight }, style]}>
      {children}
    </Text>
  );
}

export const ThemedText = memo(ThemedTextComponent);
