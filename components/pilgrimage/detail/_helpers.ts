// Shared helpers used by the pilgrimage detail leaf components. These are
// the small pure functions formerly inlined at the top of
// `app/(tabs)/pilgrimage/[animeId].tsx`. Moving them out of the route file
// lets the leaf components import once instead of routing back through the
// 3.8k-line root.

import { Platform } from 'react-native';
import type { PlatformType } from '../../../libs/services/auth/types';
import type { PilgrimageSpot, PilgrimageSpotConfidence } from '../../../libs/services/pilgrimage/types';
import type { useT } from '../../../libs/i18n';

type Translate = ReturnType<typeof useT>;

export function getSpotConfidenceLabel(t: Translate, confidence: PilgrimageSpotConfidence): string {
  switch (confidence) {
    case 'confirmed':
      return t('pilgrimage.confidence.confirmed');
    case 'single':
      return t('pilgrimage.confidence.single');
    case 'unverified':
      return t('pilgrimage.confidence.unverified');
  }
}

export function buildMapsURL(lat: number, lng: number, name?: string): string {
  const encoded = name ? encodeURIComponent(name) : '';
  if (Platform.OS === 'ios') {
    const q = encoded ? `&q=${encoded}` : '';
    return `https://maps.apple.com/?ll=${lat},${lng}${q}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export function hasValidGeo(geo: readonly [number, number] | null | undefined): boolean {
  if (!geo || geo.length < 2) return false;
  const [lat, lng] = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

export function getSpotGeo(spot: PilgrimageSpot): [number, number] | null {
  if (spot.lat === null || spot.lon === null) return null;
  return hasValidGeo([spot.lat, spot.lon]) ? [spot.lat, spot.lon] : null;
}

export function getSpotEpisode(spot: PilgrimageSpot): string | null {
  return spot.scenes[0]?.episode ?? null;
}

export function getEpisodeNumber(spot: PilgrimageSpot): number | undefined {
  for (const scene of spot.scenes) {
    const match = scene.episode.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return undefined;
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function buildBrowseUrl(platform: PlatformType, bangumiId: number): string | null {
  if (platform === 'bangumi') return `https://bgm.tv/subject/${bangumiId}`;
  return null;
}

/** Great-circle initial bearing from the user to a spot, degrees 0–360 (north = 0). */
export function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: readonly [number, number]
): number {
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to[0] * Math.PI) / 180;
  const Δλ = ((to[1] - from.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type CardinalKey = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function cardinalFromBearing(deg: number): CardinalKey {
  const keys: readonly CardinalKey[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  return keys[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
