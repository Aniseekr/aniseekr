// Discover rail of stamp rallies that are running or about to start. Owns its
// data (sync locality snapshot + sync stamp map) so the hub root gains no state.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Shadow, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { listItemEnter } from '@/libs/animations/presets';
import { useI18n, useT } from '@/libs/i18n';
import { hapticsBridge } from '@/modules/haptics/hapticsBridge';
import { resolveLocalIntelText } from '@/libs/services/pilgrimage/local-intel/local-intel-localization';
import type { LocalityEventListRow } from '@/libs/services/pilgrimage/locality/event-detail';
import {
  buildRallyRoute,
  selectDiscoverRallies,
} from '@/libs/services/pilgrimage/locality/stamp-rally';
import { buildPilgrimageEventDetailRoute } from '@/libs/services/pilgrimage/pilgrimage-navigation';

import { ThemedSurface, ThemedText } from '../themed';
import { localityEventAccent, LOCALITY_CARD_RADIUS } from './common/LocalityAesthetic';
import { EventStateChip } from './detail/IntelEventBanner';
import type { StampCollectedAtMap } from './rally/rally-format';
import { PerforatedDivider } from './rally/PerforatedDivider';
import { useStampRallyRows } from './rally/useStampRallyRows';

const CARD_WIDTH = 248;

export function StampRallyRail({ onSeeAll }: { onSeeAll: () => void }) {
  const t = useT();
  const { theme } = useTheme();
  const router = useRouter();
  const { rows, collectedAt } = useStampRallyRows();
  const rallies = useMemo(() => selectDiscoverRallies(rows), [rows]);

  const seeAll = useCallback(() => {
    hapticsBridge.selection();
    onSeeAll();
  }, [onSeeAll]);

  const openRally = useCallback(
    (row: LocalityEventListRow, name: string) => {
      hapticsBridge.tap();
      router.push(buildPilgrimageEventDetailRoute(row.event.id, { name }));
    },
    [router]
  );

  if (rallies.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ThemedText variant="titleMedium" weight="700">
            {t('explorer.rally.railTitle')}
          </ThemedText>
          <ThemedText variant="captionSmall" tone="tertiary">
            {t('explorer.rally.railSubtitle')}
          </ThemedText>
        </View>
        <Pressable
          onPress={seeAll}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('commonUi.seeAll')}
          style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}>
          <ThemedText variant="captionSmall" weight="500" tone="secondary">
            {t('commonUi.seeAll')}
          </ThemedText>
          <Ionicons name="chevron-forward" size={12} color={theme.text.tertiary} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + Spacing.sm}
        contentContainerStyle={styles.rail}>
        {rallies.map((row, index) => (
          <Animated.View key={row.event.id} entering={listItemEnter(index)}>
            <RallyTicketCard row={row} collectedAt={collectedAt} onOpen={openRally} />
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

function RallyTicketCard({
  row,
  collectedAt,
  onOpen,
}: {
  row: LocalityEventListRow;
  collectedAt: StampCollectedAtMap;
  onOpen: (row: LocalityEventListRow, name: string) => void;
}) {
  const t = useT();
  const { theme } = useTheme();
  const { language } = useI18n();
  const name = resolveLocalIntelText(row.event.name, language).value;
  const area = row.primaryLocation
    ? resolveLocalIntelText(row.primaryLocation, language).value
    : null;
  const accent = localityEventAccent(row.state, row.event.category, theme);
  const route = buildRallyRoute(row);
  const collected = route.filter((stop) => stop.id in collectedAt).length;
  const started = collected > 0;
  const a11yLabel = started
    ? t('explorer.rally.openWithProgressA11y', { name, collected, total: route.length })
    : t('explorer.rally.openA11y', { name });

  return (
    <Pressable
      onPress={() => onOpen(row, name)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => [styles.cardPress, pressed && styles.pressed]}>
      <ThemedSurface padded={0} radius={LOCALITY_CARD_RADIUS} style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTopRow}>
            <Ionicons name="ticket-outline" size={16} color={accent} />
            <EventStateChip
              state={row.state}
              theme={theme}
              ongoing={row.event.schedule.kind === 'ongoing'}
            />
          </View>
          <ThemedText variant="bodyMedium" weight="800" numberOfLines={2}>
            {name}
          </ThemedText>
        </View>
        <PerforatedDivider notch={Spacing.sm} />
        <View style={styles.cardBottom}>
          <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
            {t('news.events.stopCount', { count: route.length })}
            {area ? ` · ${area}` : ''}
          </ThemedText>
          {started ? (
            <View style={styles.progressRow}>
              <View style={[styles.track, { backgroundColor: theme.background.tertiary }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      backgroundColor: accent,
                      width: `${Math.round((collected / Math.max(1, route.length)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <ThemedText variant="captionSmall" weight="800" style={{ color: accent }}>
                {t('explorer.rally.progressBig', { collected, total: route.length })}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </ThemedSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headerCopy: { flex: 1, gap: Spacing.xxs },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xxs, minHeight: 44 },
  pressed: { opacity: 0.85 },
  rail: { gap: Spacing.sm, paddingRight: Spacing.md },
  cardPress: { width: CARD_WIDTH },
  card: { overflow: 'hidden', ...Shadow.subtle },
  cardTop: { padding: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.xs },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardBottom: { padding: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.xs },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  track: { flex: 1, height: Spacing.xxs, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
});
