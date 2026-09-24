import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedButton, ThemedIconButton, ThemedText, TranslatedText } from '@/components/themed';
import { Size, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { listItemEnter } from '@/libs/animations/presets';
import { useI18n, useT } from '@/libs/i18n';
import { resolveLocalIntelText } from '@/libs/services/pilgrimage/local-intel/local-intel-localization';
import type { RallyRouteStop } from '@/libs/services/pilgrimage/locality/stamp-rally';

import { LocalityAttributionFooter } from '../common/LocalityAttributionFooter';
import { formatStampDate, formatStraightLineDistance } from './rally-format';
import { StampMark } from './StampMark';

const NODE = 32;
const LINE = 2;

/**
 * One station on the rally route: a rail on the left (line in, node, line out)
 * and the stop on the right. Segments between two stamped stops take the accent.
 * The leg caption is a straight-line distance only — we have no routing data.
 */
export function RallyRouteStopRow({
  stop,
  index,
  isLast,
  collectedAt,
  previousCollected,
  nextCollected,
  address,
  accent,
  showProvenance,
  onToggleCollected,
  onOpenMaps,
}: {
  stop: RallyRouteStop;
  index: number;
  isLast: boolean;
  /** undefined = not stamped; null = stamped but the record has no time. */
  collectedAt: number | null | undefined;
  previousCollected: boolean;
  nextCollected: boolean;
  address: string;
  accent: string;
  /** False when the stop cites the same source as the rally hero (avoid 9× the same credit). */
  showProvenance: boolean;
  onToggleCollected: (stop: RallyRouteStop) => void;
  onOpenMaps: (stop: RallyRouteStop) => void;
}) {
  const { theme } = useTheme();
  const { language } = useI18n();
  const t = useT();
  const collected = collectedAt !== undefined;
  const stopName = resolveLocalIntelText(stop.name, language);
  const date = typeof collectedAt === 'number' ? formatStampDate(collectedAt) : null;
  const lineIn = index > 0 && previousCollected && collected ? accent : theme.glassBorder;
  const lineOut = !isLast && collected && nextCollected ? accent : theme.glassBorder;
  const nodeLabel = collected
    ? date
      ? t('explorer.rally.nodeCollectedA11y', { stop: stopName.value, date })
      : t('explorer.rally.nodeCollectedNoDateA11y', { stop: stopName.value })
    : t('explorer.rally.nodePendingA11y', { stop: stopName.value });

  return (
    <Animated.View entering={index < 8 ? listItemEnter(index, 16) : undefined} style={styles.row}>
      <View style={styles.rail}>
        <View
          style={[
            styles.line,
            styles.lineIn,
            { backgroundColor: index > 0 ? lineIn : 'transparent' },
          ]}
        />
        <View accessible accessibilityLabel={nodeLabel}>
          <StampMark
            number={index + 1}
            collected={collected}
            accent={accent}
            size={NODE}
            tilt={((index % 3) - 1) * 6}
          />
        </View>
        <View
          style={[
            styles.line,
            styles.lineOut,
            { backgroundColor: isLast ? 'transparent' : lineOut },
          ]}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            <TranslatedText
              original={stop.name.ja}
              translated={stopName.value}
              source={stopName.source}
              variant="bodyMedium"
              weight="800"
            />
            <ThemedText variant="bodySmall" tone="secondary">
              {address}
            </ThemedText>
            {collected ? (
              <ThemedText variant="caption" weight="700" style={{ color: accent }}>
                {date ? t('explorer.rally.stampedOn', { date }) : t('explorer.rally.stamped')}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          <ThemedButton
            label={
              collected
                ? t('pilgrimageUi.eventDetail.uncollect')
                : t('pilgrimageUi.eventDetail.collect')
            }
            variant={collected ? 'ghost' : 'secondary'}
            accent={accent}
            haptic={collected ? 'selection' : 'success'}
            onPress={() => onToggleCollected(stop)}
          />
          <ThemedIconButton
            accessibilityLabel={t('pilgrimageUi.eventDetail.openGoogleMapsA11y', {
              stop: stopName.value,
            })}
            accent={accent}
            disabled={!stop.mapsUrl}
            icon={(color) => <Ionicons name="navigate-outline" size={18} color={color} />}
            onPress={() => onOpenMaps(stop)}
          />
        </View>

        {showProvenance ? (
          <LocalityAttributionFooter provenance={stop.provenance} variant="compact" />
        ) : null}

        {stop.legToNext ? (
          <View style={styles.leg}>
            <ThemedText variant="captionSmall" tone="tertiary">
              {t('explorer.rally.legStraightLine', {
                distance: formatStraightLineDistance(stop.legToNext.straightLineKm),
              })}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  rail: { width: Size.minTouchTarget, alignItems: 'center' },
  line: { width: LINE },
  lineIn: { height: Spacing.md },
  lineOut: { flex: 1 },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  titleCopy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  leg: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xxs },
});
