import { StyleSheet, View } from 'react-native';

import { ThemedSurface, ThemedText } from '@/components/themed';
import { Radius, Shadow, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { useT } from '@/libs/i18n';

import { LOCALITY_CARD_RADIUS } from '../common/LocalityAesthetic';
import { PerforatedDivider } from './PerforatedDivider';

/**
 * Tear-off stub under the rally hero: a perforated edge, then the big progress
 * count. The notches are painted in the page background so they read as cut-outs.
 */
export function RallyTicketStub({
  collected,
  total,
  accent,
}: {
  collected: number;
  total: number;
  accent: string;
}) {
  const { theme } = useTheme();
  const t = useT();
  const ratio = total > 0 ? collected / total : 0;
  return (
    <ThemedSurface padded={0} radius={LOCALITY_CARD_RADIUS} style={styles.card}>
      <PerforatedDivider />
      <View
        style={styles.body}
        accessible
        accessibilityLabel={t('pilgrimageUi.eventDetail.progressValue', { collected, total })}>
        <View style={styles.countRow}>
          <ThemedText variant="captionSmall" weight="800" tone="tertiary">
            {t('explorer.rally.ticketCaption')}
          </ThemedText>
          <View style={styles.count}>
            <ThemedText variant="headlineMedium" weight="800" style={{ color: accent }}>
              {t('explorer.rally.progressBig', { collected, total })}
            </ThemedText>
            <ThemedText variant="bodySmall" tone="secondary">
              {t('explorer.rally.progressLabel')}
            </ThemedText>
          </View>
        </View>
        <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
          <View
            style={[styles.fill, { backgroundColor: accent, width: `${Math.round(ratio * 100)}%` }]}
          />
        </View>
      </View>
    </ThemedSurface>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', paddingTop: Spacing.sm, ...Shadow.subtle },
  body: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: Spacing.sm },
  countRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  count: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.xs },
  track: { height: Spacing.xs, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
});
