// Collab event banner (spec §13). The date-state chip comes from the pure
// state machine — an ended event can never render as active here, and an
// unannounced annual renders the TBA line, never an invented date.

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Radius, Spacing } from '../../../constants/DesignSystem';
import { ThemedText } from '../../themed';
import { useI18n, useT } from '../../../libs/i18n';
import type { ThemePalette } from '../../../context/ThemeContext';
import type { EventDateState } from '../../../libs/services/pilgrimage/local-intel/event-schedule';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type { LocalIntelEvent } from '../../../libs/services/pilgrimage/local-intel/types';
import { formatMonthLabel } from './intel-format';
import { IntelProvenanceLine } from './IntelProvenanceLine';
import { localityRepository } from '../../../libs/services/pilgrimage/locality/locality-repository';
import type { EventId } from '../../../libs/services/pilgrimage/locality/types';

/** Date-state chip. Reused by the SpotSheet banner, detail sheet, and Plan rows. */
export function EventStateChip({
  state,
  theme,
  ongoing = false,
}: {
  state: EventDateState;
  theme: ThemePalette;
  ongoing?: boolean;
}) {
  const t = useT();
  const { language } = useI18n();

  let label: string;
  let color: string;
  switch (state.state) {
    case 'active':
      label = ongoing ? t('pilgrimageUi.intel.eventOngoing') : t('pilgrimageUi.intel.eventActive');
      color = theme.status.success;
      break;
    case 'upcoming':
      label = t('pilgrimageUi.intel.eventUpcoming', { days: state.startsInDays });
      color = theme.status.warning;
      break;
    case 'unannounced':
      label = t('pilgrimageUi.intel.tbaAnnual', {
        month: formatMonthLabel(state.typicalMonth, language),
      });
      color = theme.status.info;
      break;
    case 'ended':
      label = t('pilgrimageUi.intel.eventEnded');
      color = theme.text.tertiary;
      break;
  }

  return (
    <View style={[styles.chip, { backgroundColor: `${color}22` }]}>
      <ThemedText variant="captionSmall" weight="800" numberOfLines={1} style={{ color }}>
        {label}
      </ThemedText>
    </View>
  );
}

function occurrenceLabel(state: EventDateState): string | null {
  const occurrence =
    state.state === 'upcoming' || state.state === 'active' ? state.occurrence : null;
  if (!occurrence) return null;
  return occurrence.startsAt === occurrence.endsAt
    ? occurrence.startsAt
    : `${occurrence.startsAt} – ${occurrence.endsAt}`;
}

export function IntelEventBanner({
  event,
  state,
  theme,
  onOpenEvent,
}: {
  event: LocalIntelEvent;
  state: EventDateState;
  theme: ThemePalette;
  onOpenEvent: (event: LocalIntelEvent) => void;
}) {
  const dates = occurrenceLabel(state);
  const canonicalEvent = localityRepository.getEventById(event.id as EventId);

  return (
    <Pressable
      onPress={() => onOpenEvent(event)}
      accessibilityRole="button"
      accessibilityLabel={resolveLocalIntelText(event.name).value}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
        pressed && { opacity: 0.82 },
      ]}>
      <View style={styles.topRow}>
        <EventStateChip state={state} theme={theme} ongoing={event.schedule.kind === 'ongoing'} />
        {dates ? (
          <ThemedText variant="captionSmall" tone="secondary">
            {dates}
          </ThemedText>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={13}
          color={theme.text.tertiary}
          style={styles.openIcon}
        />
      </View>
      <ThemedText variant="bodySmall" weight="700" numberOfLines={1}>
        {resolveLocalIntelText(event.name).value}
      </ThemedText>
      <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2}>
        {resolveLocalIntelText(event.description).value}
      </ThemedText>
      <IntelProvenanceLine
        verifiedAt={event.verifiedAt}
        theme={theme}
        showLinkHint={false}
        provenance={canonicalEvent?.provenance}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm + 2,
    gap: 5,
    marginBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    maxWidth: 200,
  },
  openIcon: {
    marginLeft: 'auto',
  },
});
