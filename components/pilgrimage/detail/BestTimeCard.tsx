// Best-time-to-visit card (spec §13). The time range is REAL solar math for
// the spot's coordinates (never the image-derived guess from scene analysis).
// Without a curated hint it renders as a compact single line; with one it
// upgrades to the full card with the sourced note and best-months chips.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText, TranslatedText } from '../../themed';
import { useI18n, useT } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { ComputedBestTime } from '../../../libs/services/pilgrimage/local-intel/best-time';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type { LocalIntelViewingHint } from '../../../libs/services/pilgrimage/local-intel/types';
import { formatMonthLabel, pickBestTimeLabel } from './intel-format';
import { IntelProvenanceLine } from './IntelProvenanceLine';

const HINT_ICON: Record<LocalIntelViewingHint['hint'], keyof typeof Ionicons.glyphMap> = {
  sunset: 'partly-sunny-outline',
  sunrise: 'sunny-outline',
  golden_hour: 'sunny-outline',
  blue_hour: 'moon-outline',
  night: 'moon-outline',
  seasonal: 'leaf-outline',
};

export function BestTimeCard({
  bestTime,
  hint,
  themeColor,
  theme,
}: {
  bestTime: ComputedBestTime | null;
  hint: LocalIntelViewingHint | null;
  themeColor: string;
  theme: ThemePalette;
}) {
  const t = useT();
  const { language } = useI18n();
  if (!bestTime && !hint) return null;

  const icon = hint ? HINT_ICON[hint.hint] : 'sunny-outline';
  const note = hint ? resolveLocalIntelText(hint.note) : null;

  // Compact line: real golden hour, no curated hint for this spot.
  if (!hint) {
    return (
      <View style={styles.compactRow}>
        <Ionicons name={icon} size={15} color={themeColor} />
        <ThemedText variant="bodySmall" tone="secondary">
          {bestTime ? pickBestTimeLabel(bestTime, language) : ''}
        </ThemedText>
        <ThemedText variant="bodySmall" weight="700">
          {bestTime?.range ?? ''}
        </ThemedText>
        {bestTime?.dayOffset === 1 ? (
          <ThemedText variant="captionSmall" tone="tertiary">
            {t('pilgrimageUi.intel.tomorrow')}
          </ThemedText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.background.tertiary }]}>
      <View style={styles.headerRow}>
        <Ionicons name={icon} size={16} color={themeColor} />
        <ThemedText variant="bodySmall" weight="800">
          {t('pilgrimageUi.intel.bestTime')}
        </ThemedText>
        {bestTime ? (
          <View style={styles.rangeCluster}>
            <ThemedText variant="bodySmall" weight="700" style={{ color: themeColor }}>
              {`${pickBestTimeLabel(bestTime, language)} ${bestTime.range}`}
            </ThemedText>
            {bestTime.dayOffset === 1 ? (
              <ThemedText variant="captionSmall" tone="tertiary">
                {t('pilgrimageUi.intel.tomorrow')}
              </ThemedText>
            ) : null}
          </View>
        ) : null}
      </View>

      {note ? (
        <TranslatedText
          original={hint.note.ja}
          translated={note.value}
          source={note.source}
          variant="bodySmall"
          tone="secondary"
        />
      ) : null}

      {hint.bestMonths && hint.bestMonths.length > 0 ? (
        <View style={styles.monthRow}>
          <ThemedText variant="captionSmall" tone="tertiary">
            {t('pilgrimageUi.intel.bestMonths')}
          </ThemedText>
          {hint.bestMonths.map((month) => (
            <View
              key={month}
              style={[styles.monthChip, { backgroundColor: theme.background.secondary }]}>
              <ThemedText variant="captionSmall" weight="700" tone="secondary">
                {formatMonthLabel(month, language)}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footerRow}>
        {bestTime ? (
          <ThemedText variant="captionSmall" tone="tertiary" numberOfLines={1}>
            {t('pilgrimageUi.intel.computedBadge')}
          </ThemedText>
        ) : null}
        <IntelProvenanceLine verifiedAt={hint.verifiedAt} theme={theme} showLinkHint={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    marginBottom: 4,
  },
  card: {
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    gap: 8,
    marginBottom: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rangeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 'auto',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  monthChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});
