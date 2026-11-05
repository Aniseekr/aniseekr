import { memo, ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { SkinFont } from '../../constants/DesignSystem';
import { useTheme, type SkinFontId } from '../../context/ThemeContext';
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

  const skinFont = !cjk ? skinDisplayFace(theme.skin?.displayFont, variant) : null;

  return (
    <Text
      {...rest}
      style={[resolveThemedTextStyles({ variant, color, weight, align, cjk, style }), skinFont]}>
      {children}
    </Text>
  );
}

const SKIN_FACE_VARIANTS = new Set<ThemedTextVariant>([
  'displayLarge',
  'displayMedium',
  'headlineLarge',
  'headlineMedium',
  'headlineSmall',
]);

// Skin faces ship one static weight that is already a display weight, so the
// variant's 600–800 is reset to 'normal' rather than asking the OS to fake bold.
const skinFaceStyles = new Map<SkinFontId, TextStyle>();
function skinDisplayFace(
  font: SkinFontId | undefined,
  variant: ThemedTextVariant
): TextStyle | null {
  if (!font || !SKIN_FACE_VARIANTS.has(variant)) return null;
  let face = skinFaceStyles.get(font);
  if (!face) {
    face = { fontFamily: SkinFont[font], fontWeight: 'normal' };
    skinFaceStyles.set(font, face);
  }
  return face;
}

export const ThemedText = memo(ThemedTextComponent);
