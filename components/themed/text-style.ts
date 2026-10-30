import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Typography } from '../../constants/DesignSystem';

export type ThemedTextVariant = keyof typeof Typography;

export interface ThemedTextStyleInput {
  variant: ThemedTextVariant;
  color: string;
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  /** The label is CJK text (see `isCjkLabel`): caps tracking is dropped. */
  cjk: boolean;
}

/**
 * Resolve the base style for `<ThemedText>`. Optional overrides are added only
 * when set: an explicit `fontWeight: undefined` would win over the variant's
 * weight when React Native flattens the style array, rendering every headline
 * without a `weight` prop at Regular.
 */
export function composeThemedTextStyle({
  variant,
  color,
  weight,
  align,
  cjk,
}: ThemedTextStyleInput): TextStyle {
  const token: TextStyle = Typography[variant];
  return {
    ...token,
    color,
    ...(weight != null && { fontWeight: weight }),
    ...(align != null && { textAlign: align }),
    ...(token.letterSpacing != null && { letterSpacing: cjk ? 0 : token.letterSpacing }),
  };
}

const CJK_TRACKING_RESET: TextStyle = { letterSpacing: 0 };

/**
 * Full style array for `<ThemedText>`: base token, caller style, then a tracking
 * reset when a caller caps label (textTransform: 'uppercase') carries CJK text —
 * Latin keeps its caps tracking, ideographs must not be spaced apart. The caller
 * style is only flattened for CJK labels.
 */
export function resolveThemedTextStyles(
  input: ThemedTextStyleInput & { style?: StyleProp<TextStyle> }
): StyleProp<TextStyle> {
  const { style, ...base } = input;
  const reset =
    base.cjk && style && StyleSheet.flatten(style)?.textTransform === 'uppercase'
      ? CJK_TRACKING_RESET
      : null;
  return [composeThemedTextStyle(base), style, reset];
}

/** Style for `<CapsText>`: the caller's caps style, tracking reset for CJK text. */
export function capsTextStyle(style: StyleProp<TextStyle>, cjk: boolean): StyleProp<TextStyle> {
  return cjk ? [style, CJK_TRACKING_RESET] : style;
}
