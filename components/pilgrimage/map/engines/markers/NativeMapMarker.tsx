// Per-kind rich marker view for the MapLibre engine. Geometry and badges come
// from the unit-tested `resolveMarkerVisual`; this file is the presentational
// shell the engine drops inside a <Marker>.
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Typography } from '../../../../../constants/DesignSystem';
import type {
  MapMarker,
  MapMarkerMode,
} from '../../../../../libs/services/pilgrimage/map-engine/types';
import {
  resolveMarkerVisual,
  VISITED_COLOR,
  type MarkerVisual,
} from '../../../../../libs/services/pilgrimage/map-engine/marker-style';
import { anitabiImageSource } from '../../../../../libs/services/pilgrimage/anitabi-image';
import { sanitizeImageUri } from '../../../spot-image-uri';

// Fixed map-pin chrome. These float over the tiles, not over app surfaces, so
// they use fixed white chrome + a dark badge chip rather than theme surfaces.
const CHROME = Colors.text.primary;
const BADGE_BG = Colors.background.tertiary;
const BADGE_FG = Colors.text.primary;

export interface NativeMapMarkerProps {
  marker: MapMarker;
  /** Surface fallback bubble/dot for spot markers with no own markerMode. */
  defaultMode?: MapMarkerMode;
  onPress?: (marker: MapMarker) => void;
  onLongPress?: (marker: MapMarker) => void;
}

function Badge({ visual }: { visual: MarkerVisual }) {
  if (!visual.badge) return null;
  const is88 = visual.badge.kind === 'id88';
  const isEp = visual.badge.kind === 'ep';
  const bg = is88 ? CHROME : visual.visited && isEp ? VISITED_COLOR : BADGE_BG;
  const fg = is88 ? visual.ringColor : BADGE_FG;
  return (
    <View style={[styles.badge, { backgroundColor: bg }, badgePosition(visual)]}>
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {visual.badge.text}
      </Text>
    </View>
  );
}

function badgePosition(visual: MarkerVisual) {
  // EP/pts ride the top-left; the 88 id rides the bottom-right.
  return visual.badge?.kind === 'id88' ? styles.badgeBottomRight : styles.badgeTopLeft;
}

function BalloonMarker({ marker, visual }: { marker: MapMarker; visual: MarkerVisual }) {
  const border = visual.visited ? VISITED_COLOR : CHROME;
  const imageUri = sanitizeImageUri(marker.image);
  return (
    <View style={[styles.balloonBox, { width: visual.width, height: visual.height }]}>
      <View style={[styles.photo, { borderColor: border }]}>
        <View style={[styles.photoFallback, { backgroundColor: visual.ringColor }]}>
          <Text style={styles.photoFallbackPin}>📍</Text>
        </View>
        {imageUri ? (
          <Image
            source={anitabiImageSource(imageUri)}
            style={styles.photoImg}
            onError={() => undefined}
          />
        ) : null}
      </View>
      <View style={[styles.tail, { borderTopColor: border }]} />
      <View style={[styles.regionDot, { backgroundColor: visual.ringColor }]} />
      <Badge visual={visual} />
    </View>
  );
}

function Gold88Marker({ visual }: { visual: MarkerVisual }) {
  return (
    <View style={[styles.balloonBox, { width: visual.width, height: visual.height }]}>
      <View style={[styles.goldDisc, { backgroundColor: visual.ringColor }]}>
        <Text style={styles.star}>★</Text>
      </View>
      <View style={[styles.tail, { borderTopColor: CHROME }]} />
      <Badge visual={visual} />
    </View>
  );
}

function DotMarker({ visual }: { visual: MarkerVisual }) {
  const fill = visual.visited ? VISITED_COLOR : visual.ringColor;
  return (
    <View style={[styles.dotBox, { width: visual.width, height: visual.height }]}>
      <View style={[styles.dot, { backgroundColor: fill }]} />
    </View>
  );
}

function NativeMapMarkerImpl({ marker, defaultMode, onPress, onLongPress }: NativeMapMarkerProps) {
  const visual = resolveMarkerVisual(marker, defaultMode);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress?.(marker)}
      onLongPress={onLongPress ? () => onLongPress(marker) : undefined}>
      {visual.shape === 'dot' ? (
        <DotMarker visual={visual} />
      ) : visual.shape === 'gold88' ? (
        <Gold88Marker visual={visual} />
      ) : (
        <BalloonMarker marker={marker} visual={visual} />
      )}
    </Pressable>
  );
}

export const NativeMapMarker = memo(NativeMapMarkerImpl);

const styles = StyleSheet.create({
  balloonBox: { alignItems: 'center' },
  photo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: BADGE_BG,
  },
  photoImg: { width: '100%', height: '100%' },
  photoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  photoFallbackPin: { ...Typography.titleLarge, color: CHROME },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  regionDot: {
    position: 'absolute',
    right: 2,
    bottom: 11,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: CHROME,
  },
  goldDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: CHROME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: { ...Typography.titleLarge, color: CHROME },
  dotBox: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: CHROME },
  badge: {
    position: 'absolute',
    minWidth: 18,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTopLeft: { top: -2, left: -2 },
  badgeBottomRight: { right: -2, bottom: 9 },
  badgeText: { ...Typography.captionSmall, fontWeight: '700' },
});
