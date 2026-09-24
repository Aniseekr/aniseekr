import { memo, ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { isCjkLabel } from '../../libs/i18n/script';
import { useUiLanguage } from '../../libs/i18n/ui-language';
import { resolveThemedTextStyles, type ThemedTextVariant } from './text-style';

export type { ThemedTextVariant } from './text-style';

export type ThemedTextTone =
  'primary' | 'secondary' | 'tertiary' | 'accent' | 'success' | 'warning' | 'error' | 'inverse';

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
  const cjk = isCjkLabel(children, useUiLanguage());

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
      color = theme.status.success;
      break;
    case 'warning':
      color = theme.status.warning;
      break;
    case 'error':
      color = theme.status.error;
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
    <Text {...rest} style={resolveThemedTextStyles({ variant, color, weight, align, cjk, style })}>
      {children}
    </Text>
  );
}

export const ThemedText = memo(ThemedTextComponent);
