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

import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import { useTheme } from '../../../context/ThemeContext';
import { useI18n, useT } from '../../../libs/i18n';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type {
  EntityProvenance,
  IntelProvenance,
} from '../../../libs/services/pilgrimage/locality/types';
import { ThemedText } from '../../themed';
import { LOCALITY_INNER_RADIUS, LocalityMiniStamp } from './LocalityAesthetic';

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
        {
          backgroundColor: theme.background.tertiary,
          borderColor: theme.glassBorder,
        },
        variant === 'footer' && styles.footer,
        style,
      ]}>
      {provenance.map((credit, index) => {
        const sourceName = resolveLocalIntelText(credit.sourceName, language).value;
        const copyright = credit.copyrightNotice
          ? resolveLocalIntelText(credit.copyrightNotice, language).value
          : null;
        return (
          <AttributionCredit
            key={`${credit.sourceUrl}:${credit.verifiedAt}:${index}`}
            credit={credit}
            sourceName={sourceName}
            copyright={copyright}
            compact={variant === 'compact'}
            openLabel={t('pilgrimageUi.attribution.openSourceA11y', { source: sourceName })}
          />
        );
      })}
    </View>
  );
}

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

  return (
    <View style={styles.credit}>
      <View style={styles.sourceRow}>
        <LocalityMiniStamp accent={theme.accent} icon="shield-checkmark-outline" size="sm" />
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={openLabel}
          hitSlop={6}
          onPress={openSource}
          style={({ pressed }) => [
            styles.sourceLink,
            {
              backgroundColor: theme.background.secondary,
              borderColor: theme.glassBorder,
            },
            pressed && styles.pressed,
          ]}>
          <ThemedText variant="captionSmall" weight="700" tone="accent" numberOfLines={1}>
            {sourceName}
          </ThemedText>
          <Ionicons name="open-outline" size={11} color={theme.accent} />
        </Pressable>
        <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
          {t('pilgrimageUi.attribution.verifiedAt', { date: credit.verifiedAt })}
        </ThemedText>
      </View>
      {credit.license || copyright ? (
        <ThemedText
          variant="captionSmall"
          tone="tertiary"
          numberOfLines={compact ? 1 : 2}
          style={styles.rights}>
          {[
            credit.license
              ? t('pilgrimageUi.attribution.license', { license: credit.license })
              : null,
            copyright,
          ]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
    borderWidth: 1,
    borderRadius: LOCALITY_INNER_RADIUS,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  footer: {
    paddingVertical: Spacing.sm,
  },
  credit: {
    gap: Spacing.xxs,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xxs,
    minHeight: Size.minTouchTarget,
  },
  sourceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    maxWidth: '70%',
    minHeight: Size.minTouchTarget,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
  },
  rights: {
    paddingLeft: Spacing.xxl,
  },
  pressed: {
    opacity: 0.64,
  },
});
