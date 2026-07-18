// Per-anime collab event list (spec §13). Rendered inside the detail sheet
// header and the Plan screen. Self-contained: sync bundled reads + the
// notification facade's sync mirror, so parents stay memo-friendly.

import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import { useT } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import {
  pilgrimageEventNotificationService,
  useIsEventReminderScheduled,
} from '../../../modules/notifications/pilgrimageEventNotificationService';
import { resolveEventDateState } from '../../../libs/services/pilgrimage/local-intel/event-schedule';
import {
  getEventsForAnime,
  getLocalIntelVersion,
  subscribeLocalIntel,
  type HubRailEvent,
} from '../../../libs/services/pilgrimage/local-intel/local-intel-repository';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import { EventStateChip } from './IntelEventBanner';
import { LocalityAttributionFooter } from '../common/LocalityAttributionFooter';
import { localityRepository } from '../../../libs/services/pilgrimage/locality/locality-repository';
import type { EventId } from '../../../libs/services/pilgrimage/locality/types';
import { buildPilgrimageEventDetailRoute } from '../../../libs/services/pilgrimage/pilgrimage-navigation';

function EventRow({
  row,
  theme,
  themeColor,
}: {
  row: HubRailEvent;
  theme: ThemePalette;
  themeColor: string;
}) {
  const t = useT();
  const router = useRouter();
  const scheduled = useIsEventReminderScheduled(row.event.id);
  const canRemind = row.state.state === 'upcoming' || scheduled;
  const canonicalEvent = localityRepository.getEventById(row.event.id as EventId);

  const handleOpen = useCallback(() => {
    router.push(buildPilgrimageEventDetailRoute(row.event.id));
  }, [router, row.event.id]);

  const handleToggleReminder = useCallback(async () => {
    hapticsBridge.selection();
    const occurrence = row.state.state === 'upcoming' ? row.state.occurrence : null;
    const result = await pilgrimageEventNotificationService.toggleEventReminder(
      row.event,
      row.state,
      occurrence
        ? { body: t('pilgrimageUi.intel.reminderBody', { date: occurrence.startsAt }) }
        : undefined
    );
    if (result === 'scheduled') hapticsBridge.success();
    if (result === 'permission-denied') {
      Alert.alert(t('pilgrimageUi.intel.reminderPermissionDenied'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.notificationsScreen.openSystemSettings'),
          onPress: () => Linking.openSettings().catch(() => undefined),
        },
      ]);
    }
  }, [row.event, row.state, t]);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
      ]}>
      <Pressable
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={resolveLocalIntelText(row.event.name).value}
        style={({ pressed }) => [styles.rowBody, pressed && { opacity: 0.82 }]}>
        <View style={styles.chipRow}>
          <EventStateChip
            state={row.state}
            theme={theme}
            ongoing={row.event.schedule.kind === 'ongoing'}
          />
          {row.state.state === 'upcoming' ? (
            <ThemedText variant="captionSmall" tone="secondary">
              {row.state.occurrence.startsAt}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
          {resolveLocalIntelText(row.event.name).value}
        </ThemedText>
        <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2}>
          {resolveLocalIntelText(row.event.description).value}
        </ThemedText>
        {canonicalEvent ? (
          <LocalityAttributionFooter provenance={canonicalEvent.provenance} variant="compact" />
        ) : null}
      </Pressable>
      {canRemind ? (
        <Pressable
          onPress={handleToggleReminder}
          accessibilityRole="button"
          accessibilityState={{ selected: scheduled }}
          accessibilityLabel={
            scheduled ? t('pilgrimageUi.intel.reminderOn') : t('pilgrimageUi.intel.reminderOff')
          }
          hitSlop={8}
          style={({ pressed }) => [styles.bell, pressed && { opacity: 0.7 }]}>
          <Ionicons
            name={scheduled ? 'notifications' : 'notifications-outline'}
            size={18}
            color={scheduled ? themeColor : theme.text.tertiary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

export function IntelEventsList({
  bangumiId,
  theme,
  themeColor,
  title,
}: {
  bangumiId: number | null;
  theme: ThemePalette;
  themeColor: string;
  /** Section header; omit to render the rows bare (Plan screen embeds them). */
  title?: string;
}) {
  const version = useSyncExternalStore(
    subscribeLocalIntel,
    getLocalIntelVersion,
    getLocalIntelVersion
  );
  const [now] = useState(() => new Date());

  const rows = useMemo<HubRailEvent[]>(() => {
    if (bangumiId === null) return [];
    return getEventsForAnime(bangumiId)
      .map((event) => ({ event, state: resolveEventDateState(event, now) }))
      .filter((row) => row.state.state !== 'ended');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version invalidates repository reads
  }, [bangumiId, now, version]);

  if (rows.length === 0) return null;

  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText variant="bodySmall" weight="800" tone="secondary">
          {title}
        </ThemedText>
      ) : null}
      {rows.map((row) => (
        <EventRow key={row.event.id} row={row} theme={theme} themeColor={themeColor} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  rowBody: {
    flex: 1,
    padding: Spacing.sm,
    gap: 3,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bell: {
    width: Size.minTouchTarget,
    height: Size.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
