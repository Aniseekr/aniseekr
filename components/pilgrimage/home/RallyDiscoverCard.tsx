import { useState } from 'react';
import { StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ThemedSurface, ThemedText } from '../../themed';
import { useTheme } from '../../../context/ThemeContext';
import { useI18n, useT } from '../../../libs/i18n';
import { bangumiSubjectImageUrl } from '../../../libs/clients/bangumi-client';
import { resolveLocalIntelText } from '../../../libs/services/pilgrimage/local-intel/local-intel-localization';
import type { LocalityEventListRow } from '../../../libs/services/pilgrimage/locality/event-detail';
import type { PilgrimageWork } from '../../../libs/services/pilgrimage/types';
import { PosterRailCard } from './PosterRailCard';
import { Radius, Spacing } from '../../../constants/DesignSystem';

export function RallyDiscoverCard({
  row,
  works,
  onPress,
}: {
  row: LocalityEventListRow;
  works: readonly PilgrimageWork[];
  onPress: () => void;
}) {
  const [coverFailed, setCoverFailed] = useState(false);
  const t = useT();
  const { language } = useI18n();
  const { theme } = useTheme();
  const title = resolveLocalIntelText(row.event.name, language).value;
  const area = row.primaryLocation
    ? resolveLocalIntelText(row.primaryLocation, language).value
    : null;
  const dateStatus = getDateStatus(row, t);
  const work = row.event.animeIds
    .map((id) => works.find((candidate) => candidate.bgm?.includes(id)))
    .find((candidate) => candidate !== undefined);
  const imageUri = work?.bgm?.[0] ? bangumiSubjectImageUrl(work.bgm[0], 'common') : undefined;

  if (!imageUri || coverFailed) {
    return (
      <PosterRailCard
        accessibilityLabel={title}
        poster={
          <ThemedSurface variant="card" style={styles.textCard}>
            <Ionicons name="ticket-outline" size={22} color={theme.accent} />
            <ThemedText variant="caption" weight="700" numberOfLines={3} align="center">
              {title}
            </ThemedText>
            {area ? (
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2} align="center">
                {area}
              </ThemedText>
            ) : null}
            <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2} align="center">
              {dateStatus}
            </ThemedText>
          </ThemedSurface>
        }
        title={null}
        meta={null}
        onPress={onPress}
      />
    );
  }

  const meta = [area, dateStatus].filter((value): value is string => Boolean(value)).join(' · ');
  return (
    <PosterRailCard
      accessibilityLabel={title}
      imageUri={imageUri}
      onImageError={() => setCoverFailed(true)}
      title={
        <ThemedText variant="caption" weight="700" numberOfLines={1}>
          {title}
        </ThemedText>
      }
      meta={
        <ThemedText variant="captionSmall" tone="secondary" numberOfLines={2}>
          {meta}
        </ThemedText>
      }
      onPress={onPress}
    />
  );
}

function getDateStatus(row: LocalityEventListRow, t: ReturnType<typeof useT>): string {
  if ('occurrence' in row.state && row.state.occurrence) {
    return `${row.state.occurrence.startsAt} – ${row.state.occurrence.endsAt}`;
  }
  if (row.state.state === 'unannounced') {
    return t('tabs.pilgrimageHome.eventTypicalMonth', { month: row.state.typicalMonth });
  }
  if (row.state.state === 'active') return t('tabs.pilgrimageHome.eventOngoing');
  return t('tabs.pilgrimageHome.eventDatesUnknown');
}

const styles = StyleSheet.create({
  textCard: {
    width: 112,
    height: 194,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
});
