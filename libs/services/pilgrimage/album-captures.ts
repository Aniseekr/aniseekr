import type { PilgrimageCapture } from './captures';
import { FRAME_MATCH_VERSION } from './frame-match-score';
import type { PilgrimageSpot, PilgrimageWork } from './types';

export const FREE_FOLDER_ANIME_ID = -1;

export interface PilgrimageAlbumEntry {
  capture: PilgrimageCapture;
  spot: PilgrimageSpot | null;
  anime: PilgrimageWork | null;
  matchPercent: number | null;
  isFree?: boolean;
}

interface BuildAlbumEntriesInput {
  captures: readonly PilgrimageCapture[];
  free?: readonly PilgrimageCapture[];
  animes: readonly PilgrimageWork[];
}

export function getCaptureFrameMatchPercent(capture: PilgrimageCapture): number | null {
  const snapshot = capture.sensorSnapshot;
  if (snapshot?.frameMatchVersion !== FRAME_MATCH_VERSION) return null;
  const value = snapshot.frameMatch;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function buildPilgrimageAlbumEntries({
  captures,
  free = [],
  animes,
}: BuildAlbumEntriesInput): PilgrimageAlbumEntry[] {
  const entries: PilgrimageAlbumEntry[] = [];
  for (const capture of captures) {
    const match = findKnownSpot(capture, animes);
    if (!match) {
      entries.push({
        capture,
        anime: null,
        spot: null,
        matchPercent: getCaptureFrameMatchPercent(capture),
      });
      continue;
    }
    entries.push({
      capture,
      anime: match.anime,
      spot: match.spot,
      matchPercent: getCaptureFrameMatchPercent(capture),
    });
  }
  for (const capture of free) {
    entries.push({
      capture,
      anime: null,
      spot: null,
      matchPercent: null,
      isFree: true,
    });
  }
  return entries.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt);
}

function findKnownSpot(
  capture: PilgrimageCapture,
  animes: readonly PilgrimageWork[]
): { anime: PilgrimageWork; spot: PilgrimageSpot } | null {
  for (const anime of animes) {
    const spot = anime.spots.find((candidate) => candidate.id === capture.spotId);
    if (spot) return { anime, spot };
  }
  return null;
}
