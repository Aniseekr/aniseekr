import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  readableTextOn,
  ThemedButton,
  ThemedIconButton,
  ThemedText,
  TranslatedText,
} from '@/components/themed';
import { Radius, Size, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { listItemEnter } from '@/libs/animations/presets';
import { useI18n, useT } from '@/libs/i18n';
import { resolveLocalIntelText } from '@/libs/services/pilgrimage/local-intel/local-intel-localization';
import type { RallyRouteStop } from '@/libs/services/pilgrimage/locality/stamp-rally';

import { LocalityAttributionFooter } from '../common/LocalityAttributionFooter';
import { LocalityMiniStamp } from '../common/LocalityAesthetic';
import { formatStampDate, formatStraightLineDistance } from './rally-format';

const NODE = 28;
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
        <View
          accessible
          accessibilityLabel={nodeLabel}
          style={[
            styles.node,
            collected
              ? { backgroundColor: accent, borderColor: accent }
              : { backgroundColor: theme.background.primary, borderColor: theme.glassBorder },
          ]}>
          {collected ? (
            <Ionicons name="checkmark" size={16} color={readableTextOn(accent)} />
          ) : (
            <ThemedText variant="captionSmall" weight="800" tone="tertiary">
              {index + 1}
            </ThemedText>
          )}
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
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={14} color={theme.text.tertiary} />
              <ThemedText variant="bodySmall" tone="secondary" style={styles.flex}>
                {address}
              </ThemedText>
            </View>
          </View>
          {collected ? (
            <View style={styles.stampMark}>
              <LocalityMiniStamp accent={accent} icon="ticket-outline" size="sm" />
              {date ? (
                <ThemedText variant="captionSmall" weight="700" style={{ color: accent }}>
                  {date}
                </ThemedText>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <View style={styles.flex}>
            <ThemedButton
              label={
                collected
                  ? t('pilgrimageUi.eventDetail.uncollect')
                  : t('pilgrimageUi.eventDetail.collect')
              }
              variant={collected ? 'ghost' : 'primary'}
              size="sm"
              fullWidth
              accent={accent}
              icon={
                collected ? undefined : (
                  <Ionicons name="ticket-outline" size={16} color={readableTextOn(accent)} />
                )
              }
              haptic={collected ? 'selection' : 'success'}
              onPress={() => onToggleCollected(stop)}
            />
          </View>
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
            <Ionicons name="swap-vertical-outline" size={12} color={theme.text.tertiary} />
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
  node: {
    width: NODE,
    height: NODE,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  titleCopy: { flex: 1, minWidth: 0, gap: Spacing.xxs },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.xxs },
  flex: { flex: 1 },
  stampMark: { alignItems: 'center', gap: Spacing.xxs, transform: [{ rotate: '-6deg' }] },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  leg: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xxs },
});
