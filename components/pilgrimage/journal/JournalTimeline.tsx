// 時間流: the journal by trip and day, newest first — photos, recorded walks
// and on-site stamps. Each trip header turns that run of days into a
// pilgrimage album in one tap.
import { memo, useMemo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type ThemePalette } from '../../../context/ThemeContext';
import { ON_DARK, ThemedButton, ThemedText } from '../../themed';
import { Radius, Size, Spacing } from '../../../constants/DesignSystem';
import { useT } from '../../../libs/i18n';
import type { PilgrimageAlbumEntry } from '../../../libs/services/pilgrimage/album-captures';
import { getPilgrimageAnimeTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';
import type { TimelineDay, TimelineTrip } from '../../../libs/services/pilgrimage/journal-timeline';
import { formatTrackDuration } from '../../../libs/services/pilgrimage/track/track-math';
import { formatDistanceKm } from '../detail/_helpers';
import { SpotImage } from '../SpotImage';
import { formatJournalDay, formatJournalRange } from './journal-dates';

const THUMB_PERCENT = 32.6;
const MAX_PLACES = 3;

interface JournalTimelineProps {
  trips: TimelineTrip[];
  onOpenEntry: (entry: PilgrimageAlbumEntry) => void;
  onDeleteEntry: (entry: PilgrimageAlbumEntry) => void;
  onMakeAlbum: (trip: TimelineTrip) => void;
  onOpenWalk: (id: string) => void;
}

const walkLabel = (meters: number, movingMs: number) =>
  `${formatDistanceKm(meters / 1000)} · ${formatTrackDuration(movingMs)}`;

function JournalTimelineImpl({
  trips,
  onOpenEntry,
  onDeleteEntry,
  onMakeAlbum,
  onOpenWalk,
}: JournalTimelineProps) {
  const t = useT();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.list}>
      {trips.map((trip) => (
        <View key={trip.from} style={styles.trip}>
          <View style={styles.tripHeader}>
            <View style={styles.tripText}>
              <ThemedText variant="titleMedium" weight="700" numberOfLines={1}>
                {formatJournalRange(trip.from, trip.to, t)}
              </ThemedText>
              <ThemedText variant="captionSmall" tone="secondary" numberOfLines={1}>
                {[
                  trip.photos === 0
                    ? null
                    : trip.works > 0
                      ? t('pilgrimage.album.tripSummary', {
                          photos: trip.photos,
                          works: trip.works,
                        })
                      : t('pilgrimage.album.tripSummaryNoWorks', { photos: trip.photos }),
                  trip.walkMeters > 0 ? walkLabel(trip.walkMeters, trip.walkMovingMs) : null,
                  trip.stamps > 0
                    ? t('pilgrimage.stamps.onsiteCount', { count: trip.stamps })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
            {/* An album needs photos or a route (a walk, or two stamps to join). */}
            {trip.photos > 0 || trip.walkMeters > 0 || trip.stamps >= 2 ? (
              <ThemedButton
                size="sm"
                variant="secondary"
                label={t('pilgrimage.album.makeAlbum')}
                onPress={() => onMakeAlbum(trip)}
              />
            ) : null}
          </View>
          {trip.days.map((day) => (
            <DaySection
              key={day.start}
              day={day}
              showDate={trip.days.length > 1}
              styles={styles}
              onOpenEntry={onOpenEntry}
              onDeleteEntry={onDeleteEntry}
              onOpenWalk={onOpenWalk}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export const JournalTimeline = memo(JournalTimelineImpl);

function DaySection({
  day,
  showDate,
  styles,
  onOpenEntry,
  onDeleteEntry,
  onOpenWalk,
}: {
  day: TimelineDay;
  /** A one-day trip already shows its date in the trip header. */
  showDate: boolean;
  styles: ReturnType<typeof makeStyles>;
  onOpenEntry: (entry: PilgrimageAlbumEntry) => void;
  onDeleteEntry: (entry: PilgrimageAlbumEntry) => void;
  onOpenWalk: (id: string) => void;
}) {
  const t = useT();
  const { theme } = useTheme();
  const places = day.places.slice(0, MAX_PLACES).join(' · ');
  const more = day.places.length - MAX_PLACES;
  return (
    <View style={styles.day}>
      {showDate || places ? (
        <View style={styles.dayHeader}>
          {showDate ? (
            <ThemedText variant="bodySmall" weight="700">
              {formatJournalDay(day.start, t)}
            </ThemedText>
          ) : null}
          {places ? (
            <ThemedText
              variant="captionSmall"
              tone="secondary"
              numberOfLines={1}
              style={styles.places}>
              {more > 0 ? `${places} ${t('pilgrimage.album.morePlaces', { count: more })}` : places}
            </ThemedText>
          ) : null}
        </View>
      ) : null}
      {day.walks.map((walk) => {
        const started = new Date(walk.startedAt);
        const clock = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;
        const label = `${clock} · ${walkLabel(walk.meters, walk.movingMs)}`;
        return (
          <Pressable
            key={walk.id}
            onPress={() => onOpenWalk(walk.id)}
            accessibilityRole="button"
            accessibilityLabel={t('pilgrimage.track.walkA11y', { summary: label })}
            style={({ pressed }) => [styles.walk, { opacity: pressed ? 0.6 : 1 }]}>
            <Ionicons name="walk" size={18} color={theme.accent} />
            <ThemedText variant="bodySmall" weight="700" style={styles.walkLabel}>
              {label}
            </ThemedText>
            <Ionicons name="chevron-forward" size={16} color={theme.text.tertiary} />
          </Pressable>
        );
      })}
      {day.entries.length > 0 ? (
        <View style={styles.grid}>
          {day.entries.map((entry) => (
            <Thumb
              key={`${entry.capture.spotId}:${entry.capture.uri}`}
              entry={entry}
              styles={styles}
              onPress={() => onOpenEntry(entry)}
              onLongPress={() => onDeleteEntry(entry)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Thumb({
  entry,
  styles,
  onPress,
  onLongPress,
}: {
  entry: PilgrimageAlbumEntry;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const t = useT();
  const work = entry.anime ? getPilgrimageAnimeTitles(entry.anime).primary : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={work ?? t('pilgrimage.album.freeCapturesFolder')}
      accessibilityHint={t('pilgrimage.album.deleteHint')}
      style={({ pressed }) => [styles.thumb, { opacity: pressed ? 0.85 : 1 }]}>
      <SpotImage uri={entry.capture.uri} style={styles.fill} contentFit="cover" />
      {work ? (
        <View style={styles.badge}>
          <ThemedText variant="badge" numberOfLines={1} style={{ color: ON_DARK }}>
            {work}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

function makeStyles(theme: ThemePalette) {
  return StyleSheet.create({
    list: { gap: Spacing.xl },
    trip: { gap: Spacing.md },
    tripHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    tripText: { flex: 1, gap: Spacing.xxs },
    day: { gap: Spacing.xs },
    dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
    places: { flex: 1 },
    walk: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      minHeight: Size.minTouchTarget,
      paddingHorizontal: Spacing.md,
      borderRadius: Radius.sm,
      borderWidth: 1,
      borderColor: theme.glassBorder,
      backgroundColor: theme.background.secondary,
    },
    walkLabel: { flex: 1, fontVariant: ['tabular-nums'] },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
    thumb: {
      // 3 × 32.6% leaves room for the two 2pt gaps on any phone width.
      width: `${THUMB_PERCENT}%`,
      aspectRatio: 1,
      backgroundColor: theme.background.tertiary,
      overflow: 'hidden',
      borderRadius: Radius.sm,
    },
    fill: { width: '100%', height: '100%' },
    badge: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: Spacing.xs,
      paddingVertical: 2,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
  });
}
