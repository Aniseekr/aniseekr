import { useCallback, useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { AtlasScene } from '../libs/services/pilgrimage/atlas/types';
import type { PilgrimageSpot } from '../libs/services/pilgrimage/types';
import type { SpotIntentKind, SpotIntentMap } from '../libs/services/pilgrimage/spot-intents';
import type { PilgrimageCapture } from '../libs/services/pilgrimage/captures';
import type { VisitedMap } from '../libs/services/pilgrimage/visited-prefs';

export interface UsePilgrimageSpotSheetArgs {
  groupedSpotByPointId: Map<string, PilgrimageSpot>;
  visited: VisitedMap;
  captures: Record<string, PilgrimageCapture>;
  spotIntents: SpotIntentMap;
  distanceFor: (spot: PilgrimageSpot) => number | null;
}

export interface UsePilgrimageSpotSheetResult {
  activeSpot: PilgrimageSpot | null;
  clusterSpots: readonly PilgrimageSpot[] | null;
  selectedSpotId: string | null;
  setSelectedSpotId: React.Dispatch<React.SetStateAction<string | null>>;
  focusRequest: number;
  menuSpotId: string | null;
  setMenuSpotId: React.Dispatch<React.SetStateAction<string | null>>;
  openGroup: (spot: PilgrimageSpot) => void;
  openSpot: (spot: PilgrimageSpot) => void;
  selectSpot: (spot: PilgrimageSpot) => void;
  openDetails: (spot: PilgrimageSpot) => void;
  openCluster: (spots: readonly PilgrimageSpot[]) => void;
  closeSheet: () => void;
  clearSelection: () => void;
  closeCluster: () => void;
  pickFromCluster: (spot: PilgrimageSpot) => void;
  activeSpotGroup: PilgrimageSpot | null;
  activeSpotScenes: readonly AtlasScene[];
  activeSpotVisitedTarget: PilgrimageSpot | null;
  activeSpotVisited: boolean;
  activeSpotSaved: boolean;
  activeSpotPlanned: boolean;
  activeSpotDistance: number | null;
  activeSpotHasCapture: boolean;
  activeSpotSceneCount: number;
}

export function usePilgrimageSpotSheet({
  groupedSpotByPointId,
  visited,
  captures,
  spotIntents,
  distanceFor,
}: UsePilgrimageSpotSheetArgs): UsePilgrimageSpotSheetResult {
  const [activeSpot, setActiveSpot] = useState<PilgrimageSpot | null>(null);
  const [clusterSpots, setClusterSpots] = useState<readonly PilgrimageSpot[] | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [menuSpotId, setMenuSpotId] = useState<string | null>(null);

  const openGroup = useCallback((spot: PilgrimageSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedSpotId(spot.id);
  }, []);
  const openSpot = useCallback((spot: PilgrimageSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setActiveSpot(spot);
  }, []);
  const selectSpot = useCallback((spot: PilgrimageSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedSpotId(spot.id);
    setFocusRequest((request) => request + 1);
  }, []);
  const openCluster = useCallback((spots: readonly PilgrimageSpot[]) => {
    Haptics.selectionAsync().catch(() => undefined);
    setClusterSpots(spots);
  }, []);
  const closeSheet = useCallback(() => setActiveSpot(null), []);
  const clearSelection = useCallback(() => setSelectedSpotId(null), []);
  const closeCluster = useCallback(() => setClusterSpots(null), []);
  const pickFromCluster = useCallback((spot: PilgrimageSpot) => {
    Haptics.selectionAsync().catch(() => undefined);
    setClusterSpots(null);
    setActiveSpot(spot);
  }, []);

  const activeSpotGroup = useMemo(
    () => (activeSpot ? (groupedSpotByPointId.get(activeSpot.id) ?? null) : null),
    [activeSpot, groupedSpotByPointId]
  );
  const activeSpotScenes = activeSpot?.scenes ?? [];
  const activeSpotVisitedTarget = activeSpot;
  const activeSpotVisited = activeSpot ? visited[activeSpot.id] === true : false;
  const activeSpotSaved = activeSpot ? spotIntents[activeSpot.id]?.saved === true : false;
  const activeSpotPlanned = activeSpot ? spotIntents[activeSpot.id]?.planned === true : false;
  const activeSpotDistance = activeSpot ? distanceFor(activeSpot) : null;
  const activeSpotHasCapture = activeSpot ? !!captures[activeSpot.id] : false;

  return {
    activeSpot,
    clusterSpots,
    selectedSpotId,
    setSelectedSpotId,
    focusRequest,
    menuSpotId,
    setMenuSpotId,
    openGroup,
    openSpot,
    selectSpot,
    openDetails: openSpot,
    openCluster,
    closeSheet,
    clearSelection,
    closeCluster,
    pickFromCluster,
    activeSpotGroup,
    activeSpotScenes,
    activeSpotVisitedTarget,
    activeSpotVisited,
    activeSpotSaved,
    activeSpotPlanned,
    activeSpotDistance,
    activeSpotHasCapture,
    activeSpotSceneCount: activeSpotScenes.length,
  };
}

export function hasSpotIntent(
  spot: PilgrimageSpot,
  intent: SpotIntentKind,
  spotIntents: SpotIntentMap
): boolean {
  return spotIntents[spot.id]?.[intent] === true;
}
