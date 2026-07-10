// usePilgrimageMapScreenState — parent-owned view controls for the hub map
// screen (app/(tabs)/pilgrimage/map.tsx): search / filter / layout / region /
// focused card / view-mode. Lifted out so the route file stays a view
// orchestrator (CLAUDE.md Rule 9). Derived memos (hubEntries, filteredEntries,
// markers, stats, focusedAnime) + the imperative camera effects stay in the
// screen and consume these outputs where the local state used to live.
import { useCallback, useDeferredValue, useState } from 'react';
import * as Haptics from 'expo-haptics';
import type { AnimeTourism88Region } from '../libs/services/pilgrimage/anime88-repository';
import {
  setPilgrimageMapViewMode,
  loadPilgrimageMapViewModeSync,
  type PilgrimageMapViewMode,
} from '../libs/services/pilgrimage/map-view-mode-prefs';

export type HubFilter = 'all' | 'collection' | 'official88';

export interface UsePilgrimageMapScreenStateParams {
  initialFilter: HubFilter; // seeded from route `filter` param
  initialFocusBangumiId: number | null; // route `focus` param
}

export interface UsePilgrimageMapScreenState {
  searchQuery: string;
  deferredSearchQuery: string;
  hubFilter: HubFilter;
  listLayout: 'grid' | 'rows';
  selectedRegions: ReadonlySet<AnimeTourism88Region>;
  flyTick: number;
  focusedAnimeId: number | null;
  mapViewMode: PilgrimageMapViewMode;
  setFocusedAnimeId: (updater: number | null | ((cur: number | null) => number | null)) => void;
  persistMapViewMode: (next: PilgrimageMapViewMode) => void;
  handleSearchChange: (text: string) => void;
  handleSearchClear: () => void;
  handlePickFilter: (next: HubFilter) => void;
  handlePickLayout: (next: 'grid' | 'rows') => void;
  handlePickRegion: (region: AnimeTourism88Region) => void;
  handleResetToJapan: () => void;
}

export function usePilgrimageMapScreenState({
  initialFilter,
  initialFocusBangumiId,
}: UsePilgrimageMapScreenStateParams): UsePilgrimageMapScreenState {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [hubFilter, setHubFilter] = useState<HubFilter>(initialFilter);
  const [listLayout, setListLayout] = useState<'grid' | 'rows'>('rows');
  // Multi-select region filter for the Tourism-88 view. Empty set = whole
  // Japan; otherwise the 88 markers + camera narrow to the union of picks (US-04).
  const [selectedRegions, setSelectedRegions] = useState<ReadonlySet<AnimeTourism88Region>>(
    () => new Set()
  );
  const [flyTick, setFlyTick] = useState(0);
  // Track which anime should be in the swap-able focused card. We persist the
  // bangumi id (not the index) so the swap behaviour survives list re-sorts.
  const [focusedAnimeId, setFocusedAnimeId] = useState<number | null>(initialFocusBangumiId);
  const [mapViewMode, setMapViewModeState] = useState<PilgrimageMapViewMode>(
    loadPilgrimageMapViewModeSync
  );

  const persistMapViewMode = useCallback((next: PilgrimageMapViewMode) => {
    setMapViewModeState(next);
    setPilgrimageMapViewMode(next).catch(() => undefined);
  }, []);
  const handleSearchChange = useCallback((text: string) => setSearchQuery(text), []);
  const handleSearchClear = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setSearchQuery('');
  }, []);
  const handlePickFilter = useCallback((next: HubFilter) => {
    Haptics.selectionAsync().catch(() => undefined);
    setHubFilter(next);
  }, []);
  const handlePickLayout = useCallback((next: 'grid' | 'rows') => {
    Haptics.selectionAsync().catch(() => undefined);
    setListLayout(next);
  }, []);
  const handlePickRegion = useCallback((region: AnimeTourism88Region) => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedRegions((cur) => {
      const next = new Set(cur);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
    setFlyTick((tk) => tk + 1);
  }, []);
  const handleResetToJapan = useCallback(() => {
    Haptics.selectionAsync().catch(() => undefined);
    setSelectedRegions((cur) => (cur.size === 0 ? cur : new Set()));
    setFlyTick((tk) => tk + 1);
  }, []);

  return {
    searchQuery,
    deferredSearchQuery,
    hubFilter,
    listLayout,
    selectedRegions,
    flyTick,
    focusedAnimeId,
    mapViewMode,
    setFocusedAnimeId,
    persistMapViewMode,
    handleSearchChange,
    handleSearchClear,
    handlePickFilter,
    handlePickLayout,
    handlePickRegion,
    handleResetToJapan,
  };
}
