// The route of a trip as a drawing: the recorded walk as a solid line, or —
// when nothing was recorded — the on-site stamps joined by a dotted line in
// visit order. Drawn with SVG so it lands in the shared album image as-is.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { formatDistanceKm } from '@/components/pilgrimage/detail/_helpers';
import { ThemedText } from '@/components/themed';
import { Radius, Spacing } from '@/constants/DesignSystem';
import { useTheme } from '@/context/ThemeContext';
import { useStamps } from '@/hooks/useStamps';
import { useTrackIndex } from '@/hooks/useTrackRecording';
import { useT } from '@/libs/i18n';
import { formatTrackDuration } from '@/libs/services/pilgrimage/track/track-math';
import { readTrack, type SavedTrack } from '@/libs/services/pilgrimage/track/track-store';
import {
  buildTripRoute,
  drawRoute,
  type TripRoute,
} from '@/libs/services/pilgrimage/track/trip-route';

const HEIGHT = 200;
const PADDING = 18;

/** The route for a journal date range; null when there is nothing to draw. */
export function useTripRoute(from: number | null, to: number | null): TripRoute | null {
  const index = useTrackIndex();
  const stamps = useStamps();
  // `ids` the loaded tracks belong to; until it matches there is nothing honest to draw.
  const [loaded, setLoaded] = useState<{ ids: string; tracks: SavedTrack[] }>({
    ids: '',
    tracks: [],
  });
  const ids = useMemo(
    () =>
      from === null || to === null
        ? ''
        : index
            .filter((row) => row.startedAt >= from && row.startedAt <= to)
            .map((row) => row.id)
            .join(','),
    [index, from, to]
  );
  useEffect(() => {
    if (!ids) return undefined;
    let cancelled = false;
    void Promise.all(ids.split(',').map(readTrack)).then((tracks) => {
      if (cancelled) return;
      setLoaded({ ids, tracks: tracks.filter((track): track is SavedTrack => track !== null) });
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);
  return useMemo(() => {
    if (from === null || to === null) return null;
    // Walks exist but are still being read: wait, rather than flash a visit-order line.
    if (ids && loaded.ids !== ids) return null;
    return buildTripRoute(ids ? loaded.tracks : [], stamps, from, to);
  }, [ids, loaded, stamps, from, to]);
}

export function RouteCard({ route, onPress }: { route: TripRoute; onPress?: () => void }) {
  const t = useT();
  const { theme } = useTheme();
  const [width, setWidth] = useState(0);
  const drawing = useMemo(
    () => (width > 0 ? drawRoute(route, width, HEIGHT, PADDING) : null),
    [route, width]
  );
  const walked = route.kind === 'track';
  const summary = [
    walked && route.meters !== null ? formatDistanceKm(route.meters / 1000) : null,
    walked && route.movingMs !== null ? formatTrackDuration(route.movingMs) : null,
    walked ? null : t('pilgrimage.track.visitOrder'),
    route.stops.length > 0
      ? t('pilgrimage.stamps.onsiteCount', { count: route.stops.length })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={summary}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.background.secondary, borderColor: theme.glassBorder },
        pressed && styles.pressed,
      ]}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.canvas}>
        {drawing ? (
          <Svg width={width} height={HEIGHT}>
            {drawing.paths.map((d, index) => (
              <Path
                // Keyed by kind: react-native-svg keeps a dash pattern on a reused element.
                key={`${route.kind}-${index}`}
                d={d}
                fill="none"
                stroke={theme.accent}
                strokeWidth={walked ? 3 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={walked ? undefined : '1 7'}
              />
            ))}
            {drawing.stops.map((stop, index) => (
              <Circle
                key={index}
                cx={stop.x}
                cy={stop.y}
                r={3.5}
                fill={theme.background.secondary}
                stroke={theme.accent}
                strokeWidth={1.5}
              />
            ))}
            {walked && drawing.start ? (
              <Circle cx={drawing.start.x} cy={drawing.start.y} r={3} fill={theme.text.primary} />
            ) : null}
            {walked && drawing.end ? (
              <Circle cx={drawing.end.x} cy={drawing.end.y} r={5} fill={theme.accent} />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <ThemedText variant="bodySmall" weight="700" style={styles.summary}>
        {summary}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  pressed: { opacity: 0.85 },
  canvas: { height: HEIGHT },
  summary: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    fontVariant: ['tabular-nums'],
  },
});
