import { beforeEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_EXPERIENCE_PREFS,
  SEEKER_TAB_CATALOG,
  normalizeExperiencePrefs,
  resolveExperienceLandingHref,
  resolveExperienceRouteNames,
  resolveExperienceTabTarget,
  resolveExperienceTabs,
  toggleSeekerTab,
} from '../../libs/navigation/experience-tabs';
import {
  loadUserPrefsSync,
  patchExperiencePrefs,
  subscribeUserPrefs,
  USER_PREFS_STORAGE_KEY,
} from '../../libs/services/user-prefs';
import { __resetAppStorageForTests, appStorage } from '../../libs/services/storage/app-storage';

describe('Experience tabs', () => {
  beforeEach(() => {
    appStorage.clearAll();
    __resetAppStorageForTests();
  });

  it('EXP-TABS-001 keeps the current five-tab product as the Seeker default', () => {
    expect(DEFAULT_EXPERIENCE_PREFS.mode).toBe('seeker');
    expect(resolveExperienceTabs(DEFAULT_EXPERIENCE_PREFS)).toEqual([
      'discover',
      'bangumi',
      'collection',
      'pilgrimage',
      'profile',
    ]);
  });

  it('EXP-TABS-002 migrates legacy preferences to Seeker without changing navigation', () => {
    expect(normalizeExperiencePrefs(undefined)).toEqual(DEFAULT_EXPERIENCE_PREFS);
  });

  it('EXP-TABS-003 keeps Seeker tab order while dropping duplicates and unknown routes', () => {
    expect(
      normalizeExperiencePrefs({
        mode: 'seeker',
        seekerTabs: ['pilgrimage', 'discover', 'pilgrimage', 'profile', 'missing'],
      })
    ).toEqual({
      mode: 'seeker',
      seekerTabs: ['pilgrimage', 'discover'],
    });
  });

  it('EXP-TABS-004 resolves the fixed Explorer and Collector presets', () => {
    expect(resolveExperienceTabs({ mode: 'explorer', seekerTabs: [] })).toEqual([
      'pilgrimage',
      'explorerCamera',
      'explorerJournal',
      'profile',
    ]);
    expect(resolveExperienceTabs({ mode: 'collector', seekerTabs: [] })).toEqual([
      'discover',
      'bangumi',
      'collection',
      'profile',
    ]);
  });

  it('EXP-TABS-005 always keeps Profile when every optional Seeker tab is removed', () => {
    expect(resolveExperienceTabs({ mode: 'seeker', seekerTabs: [] })).toEqual(['profile']);
  });

  it('EXP-TABS-006 migrates legacy persisted preferences to the Seeker default', () => {
    appStorage.set(
      USER_PREFS_STORAGE_KEY,
      JSON.stringify({ cardHeightPercent: 91, allowAdultContent: false })
    );

    const prefs = loadUserPrefsSync();

    expect(prefs.cardHeightPercent).toBe(91);
    expect(prefs.experience).toEqual(DEFAULT_EXPERIENCE_PREFS);
  });

  it('EXP-TABS-007 lands on the first visible tab for every mode', () => {
    expect(resolveExperienceLandingHref({ mode: 'explorer', seekerTabs: [] })).toBe('/pilgrimage');
    expect(resolveExperienceLandingHref({ mode: 'collector', seekerTabs: [] })).toBe('/(rate)');
    expect(resolveExperienceLandingHref({ mode: 'seeker', seekerTabs: ['collection'] })).toBe(
      '/collection'
    );
    expect(resolveExperienceLandingHref({ mode: 'seeker', seekerTabs: [] })).toBe('/profile');
  });

  it('EXP-TABS-008 removes a Seeker tab and appends it when enabled again', () => {
    const removed = toggleSeekerTab(['pilgrimage', 'discover'], 'pilgrimage');
    expect(removed).toEqual(['discover']);
    expect(toggleSeekerTab(removed, 'pilgrimage')).toEqual(['discover', 'pilgrimage']);
  });

  it('EXP-TABS-009 keeps Seeker within four optional tabs while still allowing removal', () => {
    const full = ['discover', 'bangumi', 'collection', 'explorerJournal'] as const;

    expect(toggleSeekerTab(full, 'explorerCamera')).toEqual([...full]);
    expect(toggleSeekerTab(full, 'collection')).toEqual(['discover', 'bangumi', 'explorerJournal']);
  });

  it('EXP-TABS-010 clamps persisted Seeker tabs to the visible navigation capacity', () => {
    expect(
      normalizeExperiencePrefs({
        mode: 'seeker',
        seekerTabs: [
          'explorerCamera',
          'explorerSearch',
          'explorerMap',
          'explorerJournal',
          'discover',
          'bangumi',
          'collection',
        ],
      }).seekerTabs
    ).toEqual(['explorerCamera', 'explorerJournal', 'discover', 'bangumi']);
  });

  it('normalizes saved Seeker tabs containing only removed routes to the default four', () => {
    expect(
      normalizeExperiencePrefs({ mode: 'seeker', seekerTabs: ['explorerMap', 'explorerSearch'] })
    ).toEqual(DEFAULT_EXPERIENCE_PREFS);
  });

  it('EXP-TABS-011 persists mode changes and notifies mounted navigation', async () => {
    let observedMode: string | undefined;
    const unsubscribe = subscribeUserPrefs((prefs) => {
      observedMode = prefs.experience.mode;
    });

    await patchExperiencePrefs({ mode: 'explorer' });
    unsubscribe();

    expect(loadUserPrefsSync().experience.mode).toBe('explorer');
    expect(observedMode).toBe('explorer');
  });

  it('EXP-TABS-012 falls back to a stack route when a Seeker tab is hidden', () => {
    expect(
      resolveExperienceTabTarget(
        ['explorerJournal', 'profile'],
        'explorerCamera',
        '/pilgrimage/capture'
      )
    ).toEqual({ href: '/pilgrimage/capture', isVisibleTab: false });
    expect(
      resolveExperienceTabTarget(
        ['explorerCamera', 'profile'],
        'explorerCamera',
        '/pilgrimage/capture'
      )
    ).toEqual({ href: '/explorer-camera', isVisibleTab: true });
  });

  it('EXP-TABS-013 exposes only the registered routes for the active mode with Profile fixed', () => {
    expect(SEEKER_TAB_CATALOG).toEqual([
      'discover',
      'bangumi',
      'collection',
      'pilgrimage',
      'explorerCamera',
      'explorerJournal',
    ]);
    expect(resolveExperienceRouteNames({ mode: 'explorer', seekerTabs: [] })).toEqual([
      'pilgrimage',
      'explorer-camera',
      'explorer-journal',
      'profile',
    ]);
    expect(resolveExperienceRouteNames({ mode: 'collector', seekerTabs: [] })).toEqual([
      '(rate)',
      'bangumi',
      'collection',
      'profile',
    ]);
    expect(
      resolveExperienceRouteNames({
        mode: 'seeker',
        seekerTabs: ['explorerCamera', 'collection'],
      })
    ).toEqual(['explorer-camera', 'collection', 'profile']);
  });
});
