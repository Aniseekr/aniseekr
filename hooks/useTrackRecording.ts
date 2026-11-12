// Live view of the pilgrimage walk recorder for screens. The recorder writes
// from a background task; these hooks re-render only when a batch lands.
import { useSyncExternalStore } from 'react';

import {
  loadActiveTrackSync,
  loadTrackIndexSync,
  subscribeTracks,
  type ActiveTrack,
  type TrackSummary,
} from '@/libs/services/pilgrimage/track/track-store';

/** The walk being recorded (or paused), or null. */
export function useActiveTrack(): ActiveTrack | null {
  return useSyncExternalStore(subscribeTracks, loadActiveTrackSync, loadActiveTrackSync);
}

/** Saved walks, newest first. */
export function useTrackIndex(): TrackSummary[] {
  return useSyncExternalStore(subscribeTracks, loadTrackIndexSync, loadTrackIndexSync);
}
