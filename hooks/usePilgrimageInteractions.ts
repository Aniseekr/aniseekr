import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { hapticsBridge } from '../modules/haptics/hapticsBridge';
import { loadCapturesSync, type PilgrimageCapture } from '../libs/services/pilgrimage/captures';
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
import type { PilgrimageSpot, PilgrimageWork } from '../libs/services/pilgrimage/types';

export interface UsePilgrimageInteractionsResult {
  visited: VisitedMap;
  spotIntents: SpotIntentMap;
  captures: Record<string, PilgrimageCapture>;
  refreshCaptures: () => void;
  toggleVisitedPoint: (spot: PilgrimageSpot) => void;
  toggleGroupedVisited: (spot: PilgrimageSpot) => void;
  toggleSpotIntent: (
    spot: PilgrimageSpot,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, PilgrimageSpot>,
    work: PilgrimageWork
  ) => void;
  hasIntentForGroup: (spot: PilgrimageSpot, intent: SpotIntentKind) => boolean;
  hasIntentForPoint: (
    spot: PilgrimageSpot,
    intent: SpotIntentKind,
    groupedSpotByPointId: Map<string, PilgrimageSpot>
  ) => boolean;
}

export function usePilgrimageInteractions(): UsePilgrimageInteractionsResult {
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [spotIntents, setSpotIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>(loadCapturesSync);

  const refreshCaptures = useCallback(() => {
    setCaptures(loadCapturesSync());
  }, []);

  const toggleVisitedPoint = useCallback((spot: PilgrimageSpot) => {
    setVisited((previous) => {
      const next = { ...previous };
      if (next[spot.id]) {
        delete next[spot.id];
        hapticsBridge.selection();
        void checkOutSpot(spot.id);
      } else {
        next[spot.id] = true;
        hapticsBridge.success();
        void checkInSpot(spot.id);
      }
      return next;
    });
  }, []);

  const toggleGroupedVisited = toggleVisitedPoint;

  const toggleSpotIntent = useCallback(
    (
      spot: PilgrimageSpot,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, PilgrimageSpot>,
      work: PilgrimageWork
    ) => {
      Haptics.selectionAsync().catch(() => undefined);
      const target = groupedSpotByPointId.get(spot.id) ?? spot;
      setSpotIntents((previous) => {
        const action = previous[target.id]?.[intent] ? 'remove' : 'add';
        const meta = action === 'add' ? buildSpotIntentMeta(target, work) : undefined;
        return applySpotIntentAtomic(target.id, intent, action, meta);
      });
    },
    []
  );

  const hasIntentForGroup = useCallback(
    (spot: PilgrimageSpot, intent: SpotIntentKind) => spotIntents[spot.id]?.[intent] === true,
    [spotIntents]
  );

  const hasIntentForPoint = useCallback(
    (
      spot: PilgrimageSpot,
      intent: SpotIntentKind,
      groupedSpotByPointId: Map<string, PilgrimageSpot>
    ) => {
      const target = groupedSpotByPointId.get(spot.id) ?? spot;
      return spotIntents[target.id]?.[intent] === true;
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
