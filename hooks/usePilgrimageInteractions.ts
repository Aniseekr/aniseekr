// usePilgrimageInteractions — owns the persisted user-interaction state for
// the pilgrimage detail screen: visited spots, save/plan intents, and the
// capture map. Returns stable handlers so leaf list items can stay memo'd.
//
// CLAUDE.md Rule 9: these three persisted maps + their handlers used to live
// as five loose `useState` + three `useEffect` at the top of
// `app/(tabs)/pilgrimage/[animeId].tsx`. Moving them into one feature hook
// shrinks the route shell and keeps the persistence policy in one file.

import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import {
  loadCapturesSync,
  type PilgrimageCapture,
} from '../libs/services/pilgrimage/captures';
import {
  applySpotIntentAtomic,
  buildSpotIntentMeta,
  loadSpotIntentsSync,
  type SpotIntentKind,
  type SpotIntentMap,
} from '../libs/services/pilgrimage/spot-intents';
import {
  loadVisitedSpotsSync,
  checkInSpot,
  checkOutSpot,
  type VisitedMap,
} from '../libs/services/pilgrimage/visited-prefs';
import type { AnitabiPoint, AnitabiSpot } from '../libs/services/pilgrimage/types';

export interface UsePilgrimageInteractionsResult {
  visited: VisitedMap;
  spotIntents: SpotIntentMap;
  captures: Record<string, PilgrimageCapture>;
  refreshCaptures: () => void;
  toggleVisitedPoint: (spot: AnitabiPoint) => void;
  /**
   * Toggle visited for every cut at this grouped location at once. Anitabi
   * returns one point per scene-cut, so a single shrine is often N near-
   * identical points; the UX treats them as one place.
   */
  toggleGroupedVisited: (group: AnitabiSpot) => void;
  /**
   * Toggle a `saved` or `planned` intent for every cut at this point's grouped
   * location. The lookup table mapping point-id → group is passed in so this
   * hook stays decoupled from the grouping pipeline.
   */
  toggleSpotIntent: (
    spot: AnitabiPoint,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, AnitabiSpot>,
    animeMeta: { animeId: number; name: string; cn?: string }
  ) => void;
  hasIntentForGroup: (group: AnitabiSpot, intent: SpotIntentKind) => boolean;
  hasIntentForPoint: (
    spot: AnitabiPoint,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, AnitabiSpot>
  ) => boolean;
}

export function usePilgrimageInteractions(): UsePilgrimageInteractionsResult {
  // Seed synchronously from MMKV so visited / save / plan / capture markers are
  // correct on the first frame instead of popping in after an async resolve.
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [spotIntents, setSpotIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [captures, setCaptures] =
    useState<Record<string, PilgrimageCapture>>(loadCapturesSync);

  // The three pieces of state are seeded synchronously from MMKV above.
  // `refreshCaptures` is exposed so callers can re-pull after they record a
  // capture from the camera flow without re-mounting the hook.
  const refreshCaptures = useCallback(() => {
    setCaptures(loadCapturesSync());
  }, []);

  // Persistence routes through the atomic per-spot `checkInSpot`/`checkOutSpot`
  // APIs (read-modify-write of the v2 timestamp map for ONE spot id), never
  // the bulk `saveVisitedSpots(map)` round-trip. A stale local snapshot handed
  // to `saveVisitedSpots` from this hook could clobber a timestamp another
  // surface just wrote for a different spot; the atomic APIs re-read fresh
  // storage on every call, so they can't stomp anything. `setVisited` keeps
  // the local boolean map that the UI renders from in sync in the same tick.
  const toggleVisitedPoint = useCallback((spot: AnitabiPoint) => {
    setVisited((prev) => {
      const next: VisitedMap = { ...prev };
      if (next[spot.id]) {
        delete next[spot.id];
        hapticsBridge.selection();
        void checkOutSpot(spot.id);
      } else {
        next[spot.id] = true;
        hapticsBridge.success(); // check-in finalizes the visit — Rule 7
        void checkInSpot(spot.id);
      }
      return next;
    });
  }, []);

  const toggleGroupedVisited = useCallback((group: AnitabiSpot) => {
    setVisited((prev) => {
      const anyVisited = group.scenes.some((p) => prev[p.id] === true);
      const next: VisitedMap = { ...prev };
      for (const p of group.scenes) {
        if (anyVisited) {
          delete next[p.id];
          void checkOutSpot(p.id);
        } else {
          next[p.id] = true;
          void checkInSpot(p.id);
        }
      }
      if (anyVisited) hapticsBridge.selection();
      else hapticsBridge.success(); // group checked in — Rule 7
      return next;
    });
  }, []);

  const toggleSpotIntent = useCallback(
    (
      spot: AnitabiPoint,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, AnitabiSpot>,
      animeMeta: { animeId: number; name: string; cn?: string }
    ) => {
      Haptics.selectionAsync().catch(() => undefined);
      const group = groupedSpotByPointId.get(spot.id);
      const points = group ? group.scenes : [spot];
      setSpotIntents((prev) => {
        const shouldRemove = points.some((p) => prev[p.id]?.[intent] === true);
        const op = shouldRemove ? 'remove' : 'add';
        // PERSISTENCE routes through `applySpotIntentAtomic`, which re-reads
        // a fresh synchronous snapshot from storage per point instead of
        // trusting `prev` — `prev` is a React-state closure that can be
        // stale if another surface (e.g. the map's own grouped toggle)
        // wrote a different spot's intent since this hook's state was last
        // set. Persisting through a stale `prev` would silently drop that
        // other write. Same hazard as the visited map above (:79-85).
        let persisted: SpotIntentMap = prev;
        for (const p of points) {
          // Only build (and re-snapshot) meta on add — a remove never reads
          // it, so building it unconditionally was a wasted allocation per
          // scene in the group.
          const meta = op === 'add' ? buildSpotIntentMeta(p, animeMeta) : undefined;
          persisted = applySpotIntentAtomic(p.id, intent, op, meta);
        }
        return persisted;
      });
    },
    []
  );

  const hasIntentForGroup = useCallback(
    (group: AnitabiSpot, intent: SpotIntentKind): boolean =>
      group.scenes.some((point) => spotIntents[point.id]?.[intent] === true),
    [spotIntents]
  );

  const hasIntentForPoint = useCallback(
    (
      spot: AnitabiPoint,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, AnitabiSpot>
    ): boolean => {
      const group = groupedSpotByPointId.get(spot.id);
      if (group) return group.scenes.some((p) => spotIntents[p.id]?.[intent] === true);
      return spotIntents[spot.id]?.[intent] === true;
    },
    [spotIntents]
  );

  return {
    visited,
    spotIntents,
    captures,
    refreshCaptures,
    toggleVisitedPoint,
    toggleGroupedVisited,
    toggleSpotIntent,
    hasIntentForGroup,
    hasIntentForPoint,
  };
}
