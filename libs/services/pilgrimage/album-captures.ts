import type { PilgrimageCapture } from './captures';
import type { AnitabiBangumi, AnitabiPoint } from './types';

/** Reserved synthetic anime id for the "自由拍攝" (free capture) folder. */
export const FREE_FOLDER_ANIME_ID = -1;

export interface PilgrimageAlbumEntry {
  capture: PilgrimageCapture;
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  matchPercent: number | null;
  /** True for standalone free captures — the album renders a single photo (no comparison). */
  isFree?: boolean;
}

interface BuildAlbumEntriesInput {
  captures: readonly PilgrimageCapture[];
  free?: readonly PilgrimageCapture[];
  animes: readonly AnitabiBangumi[];
}

export function getCaptureFrameMatchPercent(capture: PilgrimageCapture): number | null {
  const value = capture.sensorSnapshot?.frameMatch;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 100);
}

export function buildPilgrimageAlbumEntries({
  captures,
  free = [],
  animes,
}: BuildAlbumEntriesInput): PilgrimageAlbumEntry[] {
  const entries: PilgrimageAlbumEntry[] = [];
  for (const capture of captures) {
    const known = findKnownSpot(capture, animes);
    if (known) {
      entries.push({
        capture,
        anime: known.anime,
        spot: known.spot,
        matchPercent: getCaptureFrameMatchPercent(capture),
      });
      continue;
    }

    const fromCapture = buildEntryFromCaptureMetadata(capture);
    if (fromCapture) entries.push(fromCapture);
  }

  for (const capture of free) {
    entries.push(buildFreeEntry(capture));
  }

  return entries.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt);
}

function buildFreeEntry(capture: PilgrimageCapture): PilgrimageAlbumEntry {
  const geo: [number, number] = capture.userLocation
    ? [capture.userLocation.latitude, capture.userLocation.longitude]
    : [0, 0];
  const spot: AnitabiPoint = {
    id: capture.spotId,
    name: '', // no reference scene name — folder label comes from i18n, not this
    image: '', // empty -> album renders the single captured photo, no comparison
    ep: 0,
    s: 0,
    geo,
  };
  const anime: AnitabiBangumi = {
    id: FREE_FOLDER_ANIME_ID,
    title: '', // free folder title is an i18n string in album.tsx, never this
    cn: '',
    city: '',
    cover: '',
    color: '',
    geo,
    zoom: 12,
    modified: capture.capturedAt,
    litePoints: [spot],
    pointsLength: 0,
    imagesLength: 0,
  };
  return { capture, spot, anime, matchPercent: null, isFree: true };
}

function findKnownSpot(
  capture: PilgrimageCapture,
  animes: readonly AnitabiBangumi[]
): { anime: AnitabiBangumi; spot: AnitabiPoint } | null {
  for (const anime of animes) {
    const spot = anime.litePoints?.find((point) => point.id === capture.spotId);
    if (spot) return { anime, spot };
  }
  return null;
}

function buildEntryFromCaptureMetadata(capture: PilgrimageCapture): PilgrimageAlbumEntry | null {
  if (
    typeof capture.animeId !== 'number' ||
    !Number.isFinite(capture.animeId) ||
    capture.animeId <= 0 ||
    !capture.spotImage ||
    !capture.spotName
  ) {
    return null;
  }

  const spot: AnitabiPoint = {
    id: capture.spotId,
    name: capture.spotName,
    cn: capture.spotNameCn,
    image: capture.spotImage,
    ep: capture.spotEp ?? 0,
    s: capture.spotSecond ?? 0,
    geo: capture.spotGeo ?? [0, 0],
  };
  const anime: AnitabiBangumi = {
    id: capture.animeId,
    title: capture.animeTitle || `Bangumi #${capture.animeId}`,
    cn: capture.animeTitleCn ?? '',
    city: capture.animeCity ?? '',
    cover: capture.animeCover ?? '',
    color: capture.animeColor ?? '',
    geo: capture.spotGeo ?? [0, 0],
    zoom: 12,
    modified: capture.capturedAt,
    litePoints: [spot],
    pointsLength: 0,
    imagesLength: 0,
  };

  return {
    capture,
    spot,
    anime,
    matchPercent: getCaptureFrameMatchPercent(capture),
  };
}
