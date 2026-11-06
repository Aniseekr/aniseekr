import type { AtlasScene } from './atlas/types';
import type { PilgrimageSpot } from './types';

export type PilgrimageDetailViewPreset = 'grid' | 'rows' | 'map';
export type PilgrimageDetailViewMode = 'list' | 'map';
export type PilgrimageDetailListLayout = 'grid' | 'rows';

export interface PilgrimageDetailViewState {
  viewMode: PilgrimageDetailViewMode;
  listLayout: PilgrimageDetailListLayout;
}

export function getPilgrimageDetailViewPreset(
  viewMode: PilgrimageDetailViewMode,
  listLayout: PilgrimageDetailListLayout
): PilgrimageDetailViewPreset {
  return viewMode === 'map' ? 'map' : listLayout;
}

export function resolvePilgrimageDetailViewPreset(
  preset: PilgrimageDetailViewPreset
): PilgrimageDetailViewState {
  return preset === 'map'
    ? { viewMode: 'map', listLayout: 'grid' }
    : { viewMode: 'list', listLayout: preset };
}

export function getInitialSpotSheetScene(spot: PilgrimageSpot): AtlasScene | null {
  return spot.scenes[0] ?? null;
}

export function resolveSpotSheetSceneStack(
  activeScene: AtlasScene | null,
  groupedSpot: PilgrimageSpot | null | undefined
): readonly AtlasScene[] {
  if (!activeScene) return [];
  if (!groupedSpot || groupedSpot.scenes.length === 0) return [activeScene];
  if (!groupedSpot.scenes.includes(activeScene)) return [activeScene];
  return groupedSpot.scenes;
}

export function getSpotSheetVisitedTarget(
  activeScene: AtlasScene | null,
  scenes: readonly AtlasScene[]
): AtlasScene | null {
  return scenes[0] ?? activeScene;
}
