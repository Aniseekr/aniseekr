import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import en from '../../../libs/i18n/locales/en.json';
import zhHant from '../../../libs/i18n/locales/zh-Hant.json';

const HUB_PATH = join(process.cwd(), 'app/(tabs)/pilgrimage/index.tsx');
const TOOLS_MENU_PATH = join(process.cwd(), 'components/pilgrimage/PilgrimageToolsMenu.tsx');
const TOURISM_RAIL_PATH = join(process.cwd(), 'components/pilgrimage/Tourism88Rail.tsx');
const HUB_SOURCE = readFileSync(HUB_PATH, 'utf8');
const TOURISM_RAIL_SOURCE = readFileSync(TOURISM_RAIL_PATH, 'utf8');

describe('Pilgrimage hub simplification', () => {
  it('keeps search and every existing destination reachable', () => {
    expect(HUB_SOURCE).toContain(
      "router.push({ pathname: '/search', params: { context: 'pilgrimage' } })"
    );
    expect(HUB_SOURCE).toContain("router.push('/companion/library')");
    expect(HUB_SOURCE).toContain("'explorerJournal',\n    '/pilgrimage/album'");
    expect(HUB_SOURCE).toContain('router.navigate(journalTarget.href)');
    expect(HUB_SOURCE).toContain('router.push(journalTarget.href)');
    expect(HUB_SOURCE).toContain("'explorerCamera',\n    '/pilgrimage/capture'");
    expect(HUB_SOURCE).toContain('router.navigate(cameraTarget.href)');
    expect(HUB_SOURCE).toContain('router.push(cameraTarget.href)');
    expect(HUB_SOURCE).toContain("router.push('/pilgrimage/identify')");
    expect(HUB_SOURCE).toContain("router.push('/pilgrimage/news')");
    expect(HUB_SOURCE).toContain("pathname: '/pilgrimage/map'");
    expect(HUB_SOURCE).toContain('buildPilgrimageDetailRoute(');
  });

  it('keeps every data-driven hub surface while moving only secondary actions', () => {
    expect(HUB_SOURCE).toContain('<NearbyHero');
    expect(HUB_SOURCE).toContain('sortedCollectionAnimes.map(');
    expect(HUB_SOURCE).toContain('popularList.map(');
    expect(HUB_SOURCE).toContain('<Tourism88Rail');
    expect(HUB_SOURCE).toContain('featuredSpots.map(');
    expect(HUB_SOURCE).toContain('<AnitabiAttributionFooter');
  });

  it('uses one anchored tools menu for the five secondary actions', () => {
    expect(existsSync(TOOLS_MENU_PATH)).toBe(true);
    const menuSource = readFileSync(TOOLS_MENU_PATH, 'utf8');

    expect(HUB_SOURCE).toContain('<PilgrimageToolsMenu');
    for (const prop of [
      'onOpenCharacters={handleOpenCharacters}',
      'onOpenAlbum={handleOpenAlbum}',
      'onOpenCamera={handleOpenCamera}',
      'onIdentifyScene={handleIdentifyScene}',
      'onOpenNews={handleOpenNews}',
    ]) {
      expect(HUB_SOURCE).toContain(prop);
    }

    expect(menuSource).toContain('<Modal');
    expect(menuSource).toContain('animationType="fade"');
    expect(menuSource).toContain("t('tabs.pilgrimageScreen.charactersA11y')");
    expect(menuSource).toContain("t('tabs.pilgrimageScreen.myAlbumA11y')");
    expect(menuSource).toContain("t('pilgrimage.capture.title')");
    expect(menuSource).toContain("t('pilgrimage.identify.entry')");
    expect(menuSource).toContain("t('news.hubEntry')");
  });

  it('does not replay decorative entrance motion on this high-frequency tab', () => {
    expect(HUB_SOURCE).not.toContain('entering=');
    expect(HUB_SOURCE).not.toContain("from 'react-native-reanimated'");
  });

  it('keeps useful metadata while removing repetitive card chrome', () => {
    expect(HUB_SOURCE).toContain("t('pilgrimageUi.spotsCount'");
    expect(HUB_SOURCE).toContain('progress.visitedCount');
    expect(HUB_SOURCE).toContain('distanceKm');
    expect(HUB_SOURCE).toContain('nearestSpotAnimeName');
    expect(HUB_SOURCE).not.toContain('<LinearGradient');
    expect(HUB_SOURCE).not.toContain('styles.popularBadge');
    expect(HUB_SOURCE).toContain('showDivider={index < featuredSpots.length - 1}');

    expect(TOURISM_RAIL_SOURCE).toContain('primaryEntry.id');
    expect(TOURISM_RAIL_SOURCE).toContain("t('pilgrimage.tourism88.moreCities'");
    expect(TOURISM_RAIL_SOURCE).not.toContain('styles.idChip');
    expect(TOURISM_RAIL_SOURCE).not.toContain('styles.cityCount');
  });

  it('localizes the tools affordance in English and Traditional Chinese', () => {
    expect(en.tabs.pilgrimageScreen.moreActions).toBe('Tools');
    expect(zhHant.tabs.pilgrimageScreen.moreActions).toBe('巡禮工具');
  });
});
