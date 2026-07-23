// Per-kind rich marker view for the MapLibre engine. Geometry and badges come
// from the unit-tested `resolveMarkerVisual`; this file is the presentational
// shell the engine drops inside a <Marker>.
import { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors, Shadow, Typography } from '../../../../../constants/DesignSystem';
import type {
  MapMarker,
  MapMarkerMode,
} from '../../../../../libs/services/pilgrimage/map-engine/types';
import {
  resolveMarkerVisual,
  type MarkerVisual,
} from '../../../../../libs/services/pilgrimage/map-engine/marker-style';
import { anitabiImageSource } from '../../../../../libs/services/pilgrimage/anitabi-image';
import { readableTextOn } from '../../../../themed/contrast';
import { sanitizeImageUri } from '../../../spot-image-uri';

export interface MarkerChrome {
  chrome: string;
  badgeBackground: string;
  badgeForeground: string;
  visited: string;
}

const DEFAULT_CHROME: MarkerChrome = {
  chrome: Colors.text.primary,
  badgeBackground: Colors.background.tertiary,
  badgeForeground: Colors.text.primary,
  visited: Colors.success,
};

export interface NativeMapMarkerProps {
  marker: MapMarker;
  /** Surface fallback bubble/dot for spot markers with no own markerMode. */
  defaultMode?: MapMarkerMode;
  /** Theme chrome is supplied by the owning map engine; defaults keep this view testable. */
  chrome?: MarkerChrome;
  onPress?: (marker: MapMarker) => void;
  onLongPress?: (marker: MapMarker) => void;
}

function Badge({ visual, chrome }: { visual: MarkerVisual; chrome: MarkerChrome }) {
  if (!visual.badge) return null;
  const is88 = visual.badge.kind === 'id88';
  const isEp = visual.badge.kind === 'ep';
  const bg = is88
    ? visual.ringColor
    : visual.visited && isEp
      ? chrome.visited
      : chrome.badgeBackground;
  const fg = is88 || (visual.visited && isEp) ? readableTextOn(bg) : chrome.badgeForeground;
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

function BalloonMarker({
  marker,
  visual,
  chrome,
}: {
  marker: MapMarker;
  visual: MarkerVisual;
  chrome: MarkerChrome;
}) {
  const border = visual.visited ? chrome.visited : chrome.chrome;
  const imageUri = sanitizeImageUri(marker.image);
  return (
    <View style={[styles.balloonBox, { width: visual.width, height: visual.height }]}>
      <View
        style={[
          styles.photo,
          {
            backgroundColor: chrome.badgeBackground,
            borderColor: border,
            ...Shadow.glow(visual.ringColor),
          },
        ]}>
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.photoFallback,
            { backgroundColor: visual.ringColor },
          ]}>
          <Text style={[styles.photoFallbackPin, { color: readableTextOn(visual.ringColor) }]}>
            📍
          </Text>
        </View>
        {imageUri ? (
          <Image
            source={anitabiImageSource(imageUri)}
            style={StyleSheet.absoluteFill}
            onError={() => undefined}
          />
        ) : null}
      </View>
      <View style={[styles.tail, { borderTopColor: border }]} />
      <View
        style={[
          styles.regionDot,
          { backgroundColor: visual.ringColor, borderColor: chrome.chrome },
        ]}
      />
      <Badge visual={visual} chrome={chrome} />
    </View>
  );
}

function Gold88Marker({ visual, chrome }: { visual: MarkerVisual; chrome: MarkerChrome }) {
  return (
    <View style={[styles.balloonBox, { width: visual.width, height: visual.height }]}>
      <View
        style={[
          styles.goldDisc,
          {
            backgroundColor: visual.ringColor,
            borderColor: chrome.chrome,
            ...Shadow.glow(visual.ringColor),
          },
        ]}>
        <Text style={[styles.star, { color: readableTextOn(visual.ringColor) }]}>★</Text>
      </View>
      <View style={[styles.tail, { borderTopColor: chrome.chrome }]} />
      <Badge visual={visual} chrome={chrome} />
    </View>
  );
}

function LocalityPinMarker({
  marker,
  visual,
  chrome,
}: {
  marker: MapMarker;
  visual: MarkerVisual;
  chrome: MarkerChrome;
}) {
  const icon =
    marker.kind === 'stamp'
      ? 'ticket-outline'
      : marker.kind === 'shop'
        ? 'storefront-outline'
        : 'sparkles-outline';
  const border = visual.visited ? chrome.visited : chrome.chrome;
  const foreground = readableTextOn(visual.ringColor);
  const shapeStyle =
    marker.kind === 'stamp'
      ? styles.stampDisc
      : marker.kind === 'shop'
        ? styles.shopFrame
        : styles.festivalDiamond;
  return (
    <View style={[styles.localityBox, { width: visual.width, height: visual.height }]}>
      <View
        style={[
          styles.localityDisc,
          shapeStyle,
          {
            backgroundColor: visual.ringColor,
            borderColor: border,
            ...Shadow.glow(visual.ringColor),
          },
        ]}>
        {marker.kind === 'shop' ? (
          <View style={[styles.shopTape, { backgroundColor: foreground }]} />
        ) : null}
        <View style={marker.kind === 'festival' ? styles.festivalIcon : undefined}>
          <Ionicons name={icon} size={18} color={foreground} />
        </View>
      </View>
      <View style={[styles.localityTail, { borderTopColor: border }]} />
      {visual.visited ? (
        <View
          style={[
            styles.collectedBadge,
            { backgroundColor: chrome.visited, borderColor: chrome.chrome },
          ]}>
          <Ionicons name="checkmark" size={10} color={readableTextOn(chrome.visited)} />
        </View>
      ) : null}
    </View>
  );
}

function AreaMarker({
  marker,
  visual,
  chrome,
}: {
  marker: MapMarker;
  visual: MarkerVisual;
  chrome: MarkerChrome;
}) {
  return (
    <View
      style={[
        styles.areaLabel,
        {
          width: visual.width,
          height: visual.height,
          backgroundColor: chrome.badgeBackground,
          borderColor: visual.ringColor,
        },
      ]}>
      <Ionicons name="map-outline" size={13} color={visual.ringColor} />
      <Text style={[styles.areaText, { color: chrome.badgeForeground }]} numberOfLines={1}>
        {marker.title}
      </Text>
    </View>
  );
}

function DotMarker({ visual, chrome }: { visual: MarkerVisual; chrome: MarkerChrome }) {
  const fill = visual.visited ? chrome.visited : visual.ringColor;
  return (
    <View style={[styles.dotBox, { width: visual.width, height: visual.height }]}>
      <View style={[styles.dot, { backgroundColor: fill, borderColor: chrome.chrome }]} />
    </View>
  );
}

function NativeMapMarkerImpl({
  marker,
  defaultMode,
  chrome = DEFAULT_CHROME,
  onPress,
  onLongPress,
}: NativeMapMarkerProps) {
  const visual = resolveMarkerVisual(marker, defaultMode);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={marker.title}
      onPress={() => onPress?.(marker)}
      onLongPress={onLongPress ? () => onLongPress(marker) : undefined}>
      {visual.shape === 'dot' ? (
        <DotMarker visual={visual} chrome={chrome} />
      ) : visual.shape === 'gold88' ? (
        <Gold88Marker visual={visual} chrome={chrome} />
      ) : visual.shape === 'area' ? (
        <AreaMarker marker={marker} visual={visual} chrome={chrome} />
      ) : visual.shape === 'stamp' || visual.shape === 'shop' || visual.shape === 'festival' ? (
        <LocalityPinMarker marker={marker} visual={visual} chrome={chrome} />
      ) : (
        <BalloonMarker marker={marker} visual={visual} chrome={chrome} />
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
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFallbackPin: { ...Typography.titleLarge },
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
  },
  goldDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  localityBox: { alignItems: 'center' },
  localityDisc: {
    width: 36,
    height: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampDisc: {
    borderRadius: 18,
    borderStyle: 'dashed',
  },
  shopFrame: {
    borderRadius: 6,
  },
  shopTape: {
    position: 'absolute',
    top: 3,
    width: 18,
    height: 2,
    borderRadius: 1,
    opacity: 0.72,
    transform: [{ rotate: '-4deg' }],
  },
  festivalDiamond: {
    width: 30,
    height: 30,
    marginTop: 3,
    borderRadius: 5,
    transform: [{ rotate: '45deg' }],
  },
  festivalIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  localityTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  collectedBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 18,
    paddingHorizontal: 8,
  },
  areaText: {
    ...Typography.captionSmall,
    fontWeight: '700',
    flexShrink: 1,
  },
  star: { ...Typography.titleLarge },
  dotBox: { alignItems: 'center', justifyContent: 'center' },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
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
