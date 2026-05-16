import type { PilgrimageCapture } from './captures';
import type { AnitabiBangumi, AnitabiPoint } from './types';

export interface PilgrimageAlbumEntry {
  capture: PilgrimageCapture;
  spot: AnitabiPoint;
  anime: AnitabiBangumi;
  matchPercent: number | null;
}

interface BuildAlbumEntriesInput {
  captures: readonly PilgrimageCapture[];
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

  return entries.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt);
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
