import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DETAIL_PATH = join(process.cwd(), 'app/(tabs)/pilgrimage/[animeId].tsx');
const SHEET_PATH = join(process.cwd(), 'components/pilgrimage/detail/PilgrimageDetailSheet.tsx');
const TOOLS_MENU_PATH = join(
  process.cwd(),
  'components/pilgrimage/detail/PilgrimageDetailToolsMenu.tsx'
);
const SCENE_TILE_PATH = join(process.cwd(), 'components/pilgrimage/detail/SceneTile.tsx');

describe('Pilgrimage detail simplification', () => {
  it('keeps every existing detail action reachable after consolidating the chrome', () => {
    expect(existsSync(TOOLS_MENU_PATH)).toBe(true);

    const detailSource = readFileSync(DETAIL_PATH, 'utf8');
    const sheetSource = readFileSync(SHEET_PATH, 'utf8');
    const toolsSource = readFileSync(TOOLS_MENU_PATH, 'utf8');

    expect(detailSource).toContain('<PilgrimageDetailToolsMenu');
    expect(detailSource).toContain('onShare={handleShare}');
    expect(detailSource).toContain('onToggleMarkerMode={handleMarkerModeToggle}');
    expect(detailSource).toContain('onToggleOfflineOnly={handleOfflineToggle}');
    expect(detailSource).toContain('onPress={handleOpenAlbum}');

    expect(detailSource).toContain('spotSearchQuery={spotSearchQuery}');
    expect(detailSource).toContain('filterCycleStates={filterCycleStates}');
    expect(detailSource).toContain('activeViewPreset={activeViewPreset}');
    expect(detailSource).toContain('onSearchChange={handleSearchChange}');
    expect(detailSource).toContain('onSearchClear={handleSearchClear}');
    expect(detailSource).toContain('onSpotFilterChange={handleSpotFilterChange}');
    expect(detailSource).toContain('onViewPresetChange={handleViewPresetChange}');

    expect(sheetSource).toContain('<PilgrimageDetailControls');
    expect(toolsSource).toContain('<Modal');
    expect(toolsSource).toContain('animationType="fade"');

    for (const preservedSpotAction of [
      'onToggleVisited={toggleVisitedPoint}',
      'onToggleSaved={handleToggleSaved}',
      'onTogglePlanned={handleTogglePlanned}',
      'onOpenMaps={handleOpenMaps}',
      'onStartCamera={handleStartCamera}',
      'onFrameShot={handleFrameShot}',
      'onIdentifyScene={handleIdentifyScene}',
      'onSelectScene={openSpot}',
    ]) {
      expect(detailSource).toContain(preservedSpotAction);
    }
  });

  it('renders scene metadata below a clean image without replaying stagger motion', () => {
    const sceneTileSource = readFileSync(SCENE_TILE_PATH, 'utf8');

    expect(sceneTileSource).toContain('styles.imageWrap');
    expect(sceneTileSource).toContain('styles.tileBody');
    expect(sceneTileSource).not.toContain("from 'react-native-reanimated'");
    expect(sceneTileSource).not.toContain('listItemEnter');
    expect(sceneTileSource).not.toContain('<LinearGradient');

    for (const preservedCapability of [
      'captureUri',
      'onTakeComparison',
      'onToggleVisited',
      'visited',
      'saved',
      'planned',
    ]) {
      expect(sceneTileSource).toContain(preservedCapability);
    }
  });

  it('keeps all four anime stats while removing the nested stats card and poster badge', () => {
    const sheetSource = readFileSync(SHEET_PATH, 'utf8');

    expect(sheetSource).toContain('styles.statsSummary');
    expect(sheetSource).toContain('spotStats.spotCount');
    expect(sheetSource).toContain('spotStats.radiusKm');
    expect(sheetSource).toContain('userStats.visitedCount');
    expect(sheetSource).toContain('userStats.capturedCount');
    expect(sheetSource).not.toContain('<StatCell');
    expect(sheetSource).not.toContain('styles.posterBadge');
  });
});
