import { Text, type TextProps } from 'react-native';
import { isCjkLabel } from '../../libs/i18n/script';
import { useUiLanguage } from '../../libs/i18n/ui-language';
import { capsTextStyle } from './text-style';

/**
 * Drop-in `<Text>` for uppercase caption labels (section titles, tab label,
 * badges). Latin keeps the style's caps tracking; CJK text has no case, so the
 * tracking is reset instead of spacing ideographs apart ("應 用 語 言").
 */
export function CapsText({ style, ...rest }: TextProps) {
  const cjk = isCjkLabel(rest.children, useUiLanguage());
  return <Text {...rest} style={capsTextStyle(style, cjk)} />;
}
