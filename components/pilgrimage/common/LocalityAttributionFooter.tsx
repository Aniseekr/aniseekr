import { useCallback } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useI18n, useT, type LanguageId } from '../../../libs/i18n';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type {
  EntityProvenance,
  IntelProvenance,
} from '../../../libs/services/pilgrimage/locality/types';
import { ThemedText } from '../../themed';

export interface LocalityAttributionFooterProps {
  provenance: EntityProvenance | readonly IntelProvenance[];
  variant?: 'compact' | 'footer';
  style?: StyleProp<ViewStyle>;
}

export function LocalityAttributionFooter({
  provenance,
  variant = 'footer',
  style,
}: LocalityAttributionFooterProps) {
  const { theme } = useTheme();
  const { language } = useI18n();
  const t = useT();

  return (
    <View
      style={[
        styles.container,
        variant === 'footer' && [styles.footer, { borderTopColor: theme.glassBorder }],
        style,
      ]}>
      {dedupeDisplayedCredits(provenance, language).map(
        ({ key, credit, sourceName, copyright }) => (
          <AttributionCredit
            key={key}
            credit={credit}
            sourceName={sourceName}
            copyright={copyright}
            compact={variant === 'compact'}
            openLabel={t('pilgrimageUi.attribution.openSourceA11y', { source: sourceName })}
          />
        )
      )}
    </View>
  );
}

export interface DisplayedCredit {
  /** Every displayed field joined — unique within one footer. */
  key: string;
  credit: IntelProvenance;
  sourceName: string;
  copyright: string | null;
}

/**
 * Credits that would render identically (same source, date, licence and notice
 * — e.g. two pages of the same site) collapse into one line; the first URL is
 * kept as the link. A notice that only repeats the source name is dropped.
 */
export function dedupeDisplayedCredits(
  provenance: readonly IntelProvenance[],
  language: LanguageId
): DisplayedCredit[] {
  const seen = new Set<string>();
  const out: DisplayedCredit[] = [];
  for (const credit of provenance) {
    const sourceName = resolveLocalIntelText(credit.sourceName, language).value;
    const notice = credit.copyrightNotice
      ? resolveLocalIntelText(credit.copyrightNotice, language).value
      : null;
    const copyright = notice === sourceName ? null : notice;
    const key = [sourceName, credit.verifiedAt, credit.license ?? '', copyright ?? ''].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, credit, sourceName, copyright });
  }
  return out;
}

/**
 * One source credit as plain text: the linked source name, then when it was
 * verified and any licence / rights notice on the same muted line.
 */
function AttributionCredit({
  credit,
  sourceName,
  copyright,
  compact,
  openLabel,
}: {
  credit: IntelProvenance;
  sourceName: string;
  copyright: string | null;
  compact: boolean;
  openLabel: string;
}) {
  const { theme } = useTheme();
  const t = useT();
  const url = credit.officialUrl ?? credit.sourceUrl;
  const openSource = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      Linking.openURL(url).catch(() => undefined);
    },
    [url]
  );
  const details = [
    t('pilgrimageUi.attribution.verifiedAt', { date: credit.verifiedAt }),
    credit.license ? t('pilgrimageUi.attribution.license', { license: credit.license }) : null,
    copyright,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.credit}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={openLabel}
        hitSlop={LINK_HIT_SLOP}
        onPress={openSource}
        style={({ pressed }) => [styles.sourceLink, pressed && styles.pressed]}>
        <ThemedText variant="captionSmall" weight="700" tone="accent" numberOfLines={1}>
          {sourceName}
        </ThemedText>
        <Ionicons name="open-outline" size={11} color={theme.accent} />
      </Pressable>
      <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={compact ? 1 : 2}>
        {details}
      </ThemedText>
    </View>
  );
}

// Text links stay visually light; the slop lifts the tap area to 44pt.
const LINK_HIT_SLOP = { top: 16, bottom: 16, left: 8, right: 8 };

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
  },
  credit: {
    gap: 2,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xxs,
    maxWidth: '100%',
  },
  pressed: {
    opacity: 0.64,
  },
});
