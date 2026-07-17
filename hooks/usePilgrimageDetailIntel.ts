// Local-intel data for the active SpotSheet (spec §13). All reads are sync
// bundled data — frame-1 safe, no I/O. Re-derives when the runtime payload
// hydrates (version bump) or the active spot changes.

import { useMemo, useSyncExternalStore } from 'react';
import {
  computeBestTimeForSpot,
  type ComputedBestTime,
} from '../libs/services/pilgrimage/local-intel/best-time';
import { resolveEventDateState } from '../libs/services/pilgrimage/local-intel/event-schedule';
import {
  getEventsForAnime,
  getLocalIntelVersion,
  getShopsNear,
  getViewingHintForSpot,
  getViewingHintNear,
  subscribeLocalIntel,
  type HubRailEvent,
} from '../libs/services/pilgrimage/local-intel/local-intel-repository';
import type {
  LocalIntelViewingHint,
} from '../libs/services/pilgrimage/local-intel/types';
import { haversineKm } from '../libs/services/pilgrimage/spot-index';
import type { AnitabiPoint } from '../libs/services/pilgrimage/types';
import type { NearbyShopRow } from '../components/pilgrimage/detail/IntelShopsSection';

const SHOP_RADIUS_KM = 5;
const MAX_SHOPS = 3;

export interface SpotSheetIntel {
  bestTime: ComputedBestTime | null;
  hint: LocalIntelViewingHint | null;
  shopRows: readonly NearbyShopRow[];
  /** Most relevant event for this anime: active first, else soonest upcoming. */
  event: HubRailEvent | null;
}

const EMPTY_INTEL: SpotSheetIntel = { bestTime: null, hint: null, shopRows: [], event: null };

function hasGeo(spot: AnitabiPoint | null): spot is AnitabiPoint {
  return (
    !!spot &&
    Array.isArray(spot.geo) &&
    Number.isFinite(spot.geo[0]) &&
    Number.isFinite(spot.geo[1]) &&
    (spot.geo[0] !== 0 || spot.geo[1] !== 0)
  );
}

export function usePilgrimageDetailIntel(
  bangumiId: number | null,
  spot: AnitabiPoint | null,
): SpotSheetIntel {
  const version = useSyncExternalStore(
    subscribeLocalIntel,
    getLocalIntelVersion,
    getLocalIntelVersion,
  );

  const spotId = spot?.id ?? null;
  const lat = hasGeo(spot) ? spot.geo[0] : null;
  const lng = hasGeo(spot) ? spot.geo[1] : null;

  return useMemo(() => {
    if (spotId === null || lat === null || lng === null) return EMPTY_INTEL;
    const geo: [number, number] = [lat, lng];
    // "Now" is captured when the spot opens (memo key), not per render.
    const now = new Date();

    const hint =
      (bangumiId !== null ? getViewingHintForSpot(bangumiId, spotId) : null) ??
      getViewingHintNear(geo);
    const bestTime = computeBestTimeForSpot(geo, now, hint);

    const shopRows = getShopsNear(geo, SHOP_RADIUS_KM)
      .slice(0, MAX_SHOPS)
      .map((shop) => ({
        shop,
        distanceKm: shop.geo ? haversineKm(lat, lng, shop.geo[0], shop.geo[1]) : 0,
      }));

    let event: HubRailEvent | null = null;
    if (bangumiId !== null) {
      let bestUpcomingDays = Number.POSITIVE_INFINITY;
      for (const candidate of getEventsForAnime(bangumiId)) {
        const state = resolveEventDateState(candidate, now);
        if (state.state === 'active') {
          event = { event: candidate, state };
          break;
        }
        if (state.state === 'upcoming' && state.startsInDays < bestUpcomingDays) {
          bestUpcomingDays = state.startsInDays;
          event = { event: candidate, state };
        }
      }
    }

    return { bestTime, hint, shopRows, event };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version invalidates repository reads
  }, [bangumiId, spotId, lat, lng, version]);
}
