import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useT } from '../libs/i18n';
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
  loadStampDetailsSync,
  loadVisitedSpotsSync,
  checkInSpot,
  checkOutSpot,
  type VisitedMap,
} from '../libs/services/pilgrimage/visited-prefs';
import { locationService } from '../libs/services/pilgrimage/location-service';
import { isOnsite, spotsOnsite, type StampFix } from '../libs/services/pilgrimage/stamp-grade';
import type { StampDetailMap, StampMeta } from '../libs/services/pilgrimage/stamp-details';
import { formatPackDate } from '../libs/services/pilgrimage/offline-pack/pack-format';
import type { PilgrimageSpot, PilgrimageWork } from '../libs/services/pilgrimage/types';

/** The latest stamping, so the screen can play the press animation once. */
export interface StampEvent {
  key: number;
  count: number;
  onsite: boolean;
  /** True when an existing manual note became an on-site stamp. */
  upgraded: boolean;
}

/** A stamp pressed without a new position check needs a fix this recent. */
const INSTANT_FIX_MAX_AGE_MS = 60_000;

/** The session's last fix when it is fresh enough to stamp on; otherwise a new one is asked for. */
function recentFix(): StampFix | null {
  const fix = locationService.getLastFix();
  return fix && Date.now() - fix.at <= INSTANT_FIX_MAX_AGE_MS ? fix : null;
}

export function stampMetaOf(spot: PilgrimageSpot): StampMeta {
  const meta: StampMeta = { workKey: spot.workKey, name: spot.name };
  if (spot.muniCd) meta.muniCd = spot.muniCd;
  if (spot.lat !== null && spot.lon !== null) {
    meta.lat = spot.lat;
    meta.lon = spot.lon;
  }
  return meta;
}

export interface UsePilgrimageInteractionsResult {
  visited: VisitedMap;
  /** On-site proof and spot snapshot per visited spot; no entry = manual note. */
  stampDetails: StampDetailMap;
  lastStamp: StampEvent | null;
  spotIntents: SpotIntentMap;
  captures: Record<string, PilgrimageCapture>;
  refreshCaptures: () => void;
  toggleVisitedPoint: (spot: PilgrimageSpot) => void;
  checkInHere: (spot: PilgrimageSpot) => void;
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

/**
 * `work` lets one on-site check-in stamp every scene of the work at that
 * place; without it only the tapped spot is stamped.
 */
export function usePilgrimageInteractions(
  work?: PilgrimageWork | null
): UsePilgrimageInteractionsResult {
  const t = useT();
  const workRef = useRef(work);
  workRef.current = work;
  const [visited, setVisited] = useState<VisitedMap>(loadVisitedSpotsSync);
  const [stampDetails, setStampDetails] = useState<StampDetailMap>(loadStampDetailsSync);
  const [lastStamp, setLastStamp] = useState<StampEvent | null>(null);
  const [spotIntents, setSpotIntents] = useState<SpotIntentMap>(loadSpotIntentsSync);
  const [captures, setCaptures] = useState<Record<string, PilgrimageCapture>>(loadCapturesSync);

  const refreshCaptures = useCallback(() => {
    setCaptures(loadCapturesSync());
  }, []);

  // Storage (sync MMKV) is the truth; React state mirrors it after each write.
  const syncFromStore = useCallback(() => {
    setVisited(loadVisitedSpotsSync());
    setStampDetails(loadStampDetailsSync());
  }, []);

  const stampSpots = useCallback(
    (spots: readonly PilgrimageSpot[], onsite: boolean, upgraded = false) => {
      if (spots.length === 0) return;
      const now = Date.now();
      for (const spot of spots) {
        void checkInSpot(spot.id, now, {
          onsiteVia: onsite ? 'gps' : undefined,
          meta: stampMetaOf(spot),
        });
      }
      hapticsBridge.success();
      syncFromStore();
      setLastStamp({ key: now, count: spots.length, onsite, upgraded });
    },
    [syncFromStore]
  );

  /** The tapped spot plus every unvisited scene of the work the fix also covers. */
  const onsiteGroup = useCallback((spot: PilgrimageSpot, fix: StampFix | null, now: number) => {
    if (!isOnsite(spot, fix, now)) return null;
    // Scenes already noted by hand are upgraded along with the unvisited ones.
    const details = loadStampDetailsSync();
    const siblings = (workRef.current?.spots ?? []).filter(
      (other) => other.id !== spot.id && details[other.id]?.onsiteAt === undefined
    );
    return [spot, ...spotsOnsite(siblings, fix, now)];
  }, []);

  const toggleVisitedPoint = useCallback(
    (spot: PilgrimageSpot) => {
      const checkOut = () => {
        hapticsBridge.selection();
        void checkOutSpot(spot.id);
        syncFromStore();
      };
      if (loadVisitedSpotsSync()[spot.id]) {
        const onsiteAt = loadStampDetailsSync()[spot.id]?.onsiteAt;
        if (onsiteAt === undefined) {
          // Standing at a spot noted earlier by hand: the tap proves it instead of removing it.
          const here = onsiteGroup(spot, recentFix(), Date.now());
          if (here) return stampSpots(here, true, true);
          // An older fix says "here": confirm with a new one instead of removing the note.
          if (!onsiteGroup(spot, locationService.getLastFix(), Date.now())) return checkOut();
          void locationService.getFreshFix().then((fix) => {
            const fresh = onsiteGroup(spot, fix, Date.now());
            if (fresh) stampSpots(fresh, true, true);
          });
          return;
        }
        // An on-site stamp cannot be re-earned from the sofa — confirm first.
        hapticsBridge.warning();
        Alert.alert(
          t('pilgrimage.stamps.removeOnsiteTitle'),
          t('pilgrimage.stamps.removeOnsiteMessage', { date: formatPackDate(onsiteAt) }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('pilgrimage.stamps.remove'), style: 'destructive', onPress: checkOut },
          ]
        );
        return;
      }
      const group = onsiteGroup(spot, recentFix(), Date.now());
      if (group) return stampSpots(group, true);
      stampSpots([spot], false);
      // The cached fix may just be stale: ask once (never prompts) and upgrade.
      void locationService.getFreshFix().then((fix) => {
        if (!loadVisitedSpotsSync()[spot.id]) return;
        const fresh = onsiteGroup(spot, fix, Date.now());
        if (fresh) stampSpots(fresh, true, true);
      });
    },
    [onsiteGroup, stampSpots, syncFromStore, t]
  );

  /** The "you are here" prompt: stamps or upgrades, and never removes a visit. */
  const checkInHere = useCallback(
    (spot: PilgrimageSpot) => {
      const wasVisited = loadVisitedSpotsSync()[spot.id] === true;
      const group = onsiteGroup(spot, recentFix(), Date.now());
      if (group) return stampSpots(group, true, wasVisited);
      if (!wasVisited) stampSpots([spot], false);
      void locationService.getFreshFix().then((fix) => {
        const fresh = onsiteGroup(spot, fix, Date.now());
        if (fresh) stampSpots(fresh, true, true);
      });
    },
    [onsiteGroup, stampSpots]
  );

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
    stampDetails,
    lastStamp,
    spotIntents,
    captures,
    refreshCaptures,
    toggleVisitedPoint,
    checkInHere,
    toggleGroupedVisited,
    toggleSpotIntent,
    hasIntentForGroup,
    hasIntentForPoint,
  };
}
