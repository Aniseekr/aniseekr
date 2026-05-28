// Render a translated value with optional original underneath.
//
// Two behaviors driven by user preference + gesture:
//   - Settings → Always show original = ON   → original always rendered below.
//   - Settings → Always show original = OFF  → only translation shown.
//   - Long-press anywhere → toggles the visibility of the original for *this*
//     instance, regardless of the setting. Releases on next render of the
//     same component (transient toggle, not persisted).
//
// MT outputs (`source === 'mt'`) always render a small italic badge so the
// user can tell human/curated translations apart from machine ones. The badge
// uses the `translation.machineBadge` catalog string so it localizes too.

import { memo, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Spacing, Typography } from '../../constants/DesignSystem';
import { useTheme } from '../../context/ThemeContext';
import { hapticsBridge } from '../../modules/haptics/hapticsBridge';
import { useT } from '../../libs/i18n';
import { getShowOriginalSync } from '../../libs/i18n/data-language-prefs';
import type { TranslationSource } from '../../libs/i18n/data-translator';
import { ThemedText, type ThemedTextProps } from './ThemedText';

export interface TranslatedTextProps {
  /** The original (untranslated) text. Always available; used as fallback and as the "show original" line. */
  original: string;
  /** The translated value to render as the primary line. If the same as `original`, no original line is shown regardless of toggle. */
  translated: string;
  /** Where the translation came from. Drives the MT badge. */
  source?: TranslationSource;
  /** Style passthrough for the primary line — uses ThemedText. */
  variant?: ThemedTextProps['variant'];
  tone?: ThemedTextProps['tone'];
  weight?: TextStyle['fontWeight'];
  align?: TextStyle['textAlign'];
  numberOfLines?: number;
  /** Container style (wraps translation + optional original line). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Override the global "always show original" setting for this instance. */
  alwaysShowOriginal?: boolean;
  /** Disable the long-press toggle (e.g. when nested inside another pressable). */
  disableLongPress?: boolean;
}

/**
 * `useState(getShowOriginalSync)` per instance is intentional: the pref
 * rarely changes during a screen's lifetime, and we want each component to
 * snapshot the current setting so a mid-session toggle of one chip doesn't
 * affect siblings. The Language screen mutation re-mounts via navigation
 * back, so screens re-read on next open — good enough for P1.
 */
function TranslatedTextImpl({
  original,
  translated,
  source = 'original',
  variant = 'bodyMedium',
  tone = 'primary',
  weight,
  align,
  numberOfLines,
  containerStyle,
  alwaysShowOriginal,
  disableLongPress,
}: TranslatedTextProps) {
  const { theme } = useTheme();
  const t = useT();
  const storedShowOriginal = alwaysShowOriginal ?? getShowOriginalSync();
  const [transientOverride, setTransientOverride] = useState<boolean | null>(null);

  const sameAsOriginal = translated === original;
  const showOriginal =
    !sameAsOriginal && (transientOverride ?? storedShowOriginal);

  const onLongPress = () => {
    if (disableLongPress || sameAsOriginal) return;
    hapticsBridge.selection();
    setTransientOverride((prev) => !(prev ?? storedShowOriginal));
  };

  const a11yLabel = showOriginal
    ? t('translation.hideOriginalA11y')
    : t('translation.showOriginalA11y');

  const isMT = source === 'mt';

  const PrimaryLine = (
    <ThemedText
      variant={variant}
      tone={tone}
      weight={weight}
      align={align}
      numberOfLines={numberOfLines}
      style={isMT ? styles.italic : undefined}>
      {translated}
      {isMT ? (
        <ThemedText variant="captionSmall" tone="tertiary" style={styles.badge}>
          {`  · ${t('translation.machineBadge')}`}
        </ThemedText>
      ) : null}
    </ThemedText>
  );

  const OriginalLine = showOriginal ? (
    <ThemedText
      variant="captionSmall"
      tone="tertiary"
      numberOfLines={numberOfLines}
      align={align}
      style={[styles.originalLine, { borderLeftColor: theme.glassBorder }]}>
      {original}
    </ThemedText>
  ) : null;

  if (disableLongPress) {
    return (
      <View style={containerStyle}>
        {PrimaryLine}
        {OriginalLine}
      </View>
    );
  }

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityLabel={a11yLabel}
      accessibilityRole="text"
      style={containerStyle}>
      {PrimaryLine}
      {OriginalLine}
    </Pressable>
  );
}

export const TranslatedText = memo(TranslatedTextImpl);

const styles = StyleSheet.create({
  italic: {
    fontStyle: 'italic',
  },
  badge: {
    ...Typography.captionSmall,
    fontStyle: 'italic',
  },
  originalLine: {
    marginTop: Spacing.xs,
    paddingLeft: Spacing.sm,
    borderLeftWidth: 2,
    fontStyle: 'italic',
  },
});
