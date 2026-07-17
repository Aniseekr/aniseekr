import { beforeEach, describe, expect, it } from 'bun:test';

import {
  getAllLocalIntelEntries,
  getEventsForAnime,
  getHubRailEvents,
  getLocalIntelVersion,
  getShopsForAnime,
  getShopsNear,
  getViewingHintForSpot,
  getViewingHintNear,
  hydrateLocalIntelFromRuntime,
  resetLocalIntelForTests,
  subscribeLocalIntel,
} from '../../../libs/services/pilgrimage/local-intel/local-intel-repository';
import type {
  LocalIntelEntry,
  LocalIntelEvent,
  LocalIntelFile,
  LocalIntelShop,
  LocalIntelViewingHint,
} from '../../../libs/services/pilgrimage/local-intel/types';

const NOW = new Date(Date.UTC(2026, 6, 17, 3, 0)); // 2026-07-17 noon JST

function file(entries: LocalIntelEntry[]): LocalIntelFile {
  return { generatedAt: 1, source: 'test', count: entries.length, entries };
}

function shop(id: string, overrides: Partial<LocalIntelShop> = {}): LocalIntelShop {
  return {
    kind: 'shop',
    id,
    bangumiIds: [100],
    category: 'goods',
    name: { ja: id },
    description: { ja: id },
    animeConnection: { ja: id },
    geo: [35, 139],
    sourceUrl: 'https://example.com',
    verifiedAt: '2026-07-17',
    ...overrides,
  };
}

function intelEvent(id: string, overrides: Partial<LocalIntelEvent> = {}): LocalIntelEvent {
  return {
    kind: 'event',
    id,
    bangumiIds: [100],
    category: 'festival',
    name: { ja: id },
    description: { ja: id },
    geo: [35, 139],
    schedule: { kind: 'fixed', startsAt: '2026-08-01', endsAt: '2026-08-02' },
    sourceUrl: 'https://example.com',
    verifiedAt: '2026-07-17',
    ...overrides,
  };
}

function hint(id: string, overrides: Partial<LocalIntelViewingHint> = {}): LocalIntelViewingHint {
  return {
    kind: 'viewing_hint',
    id,
    bangumiIds: [100],
    name: { ja: id },
    description: { ja: id },
    geo: [35, 139],
    hint: 'sunset',
    note: { ja: id },
    sourceUrl: 'https://example.com',
    verifiedAt: '2026-07-17',
    ...overrides,
  };
}

describe('local-intel repository', () => {
  beforeEach(() => {
    resetLocalIntelForTests();
  });

  it('PILG-039 loads the real bundled dataset with full provenance', () => {
    // No fixture installed: the first query lazily parses the bundled JSON.
    const entries = getAllLocalIntelEntries();
    expect(entries.length).toBeGreaterThanOrEqual(10);
    for (const entry of entries) {
      expect(entry.sourceUrl.startsWith('http')).toBe(true);
      expect(entry.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const shops = getShopsForAnime(165553); // Love Live! Sunshine!! S1
    expect(shops.some((s) => s.id === 'yasudaya-ryokan')).toBe(true);
    const events = getEventsForAnime(22759); // Hanasaku Iroha
    expect(events.some((e) => e.id === 'yuwaku-bonbori-matsuri')).toBe(true);
  });

  it('PILG-039 drops entries missing provenance or identity and dedupes by id', () => {
    const bad = [
      { ...shop('no-source'), sourceUrl: '' },
      { ...shop('no-verified'), verifiedAt: '' },
      { ...shop(''), id: '' },
      shop('dupe'),
      shop('dupe'),
      shop('ok'),
    ];
    resetLocalIntelForTests(file(bad as LocalIntelEntry[]));
    const ids = getAllLocalIntelEntries().map((e) => e.id);
    expect(ids.sort()).toEqual(['dupe', 'ok']);
  });

  it('PILG-044 exact spotRefs beat geo proximity and radius bounds matching', () => {
    const byRef = hint('by-ref', {
      geo: [40, 140], // far away — must still win via the exact ref
      spotRefs: [{ bangumiId: 100, pointId: 'p1' }],
    });
    const byGeo = hint('by-geo', { geo: [35, 139] }); // default 250m radius
    resetLocalIntelForTests(file([byRef, byGeo]));

    expect(getViewingHintForSpot(100, 'p1')?.id).toBe('by-ref');
    expect(getViewingHintForSpot(100, 'p2')).toBeNull();
    expect(getViewingHintForSpot(999, 'p1')).toBeNull();

    // ~222m north of by-geo: inside the 250m default radius.
    expect(getViewingHintNear([35.002, 139])?.id).toBe('by-geo');
    // ~333m north: outside.
    expect(getViewingHintNear([35.003, 139])).toBeNull();
  });

  it('PILG-045 shop queries filter by anime and sort geo hits by distance', () => {
    const near = shop('near', { geo: [35.001, 139] }); // ~111m
    const far = shop('far', { geo: [35.004, 139] }); // ~444m
    const otherAnime = shop('other', { bangumiIds: [200], geo: [35.002, 139] }); // ~222m
    resetLocalIntelForTests(file([far, near, otherAnime]));

    expect(getShopsForAnime(100).map((s) => s.id).sort()).toEqual(['far', 'near']);
    expect(getShopsForAnime(999)).toEqual([]);

    const nearby = getShopsNear([35, 139], 0.3);
    expect(nearby.map((s) => s.id)).toEqual(['near', 'other']);
  });

  it('PILG-049 runtime hydration swaps data, bumps version, and notifies subscribers', () => {
    resetLocalIntelForTests(file([shop('a'), shop('b'), shop('c'), shop('d'), shop('e')]));
    const versionBefore = getLocalIntelVersion();
    let notified = 0;
    const unsubscribe = subscribeLocalIntel(() => {
      notified += 1;
    });

    hydrateLocalIntelFromRuntime(
      file([shop('a'), shop('b'), shop('c'), shop('d'), shop('f')]),
    );
    expect(getLocalIntelVersion()).toBe(versionBefore + 1);
    expect(notified).toBe(1);
    expect(getAllLocalIntelEntries().some((e) => e.id === 'f')).toBe(true);
    unsubscribe();
  });

  it('PILG-049 rejects a low-coverage runtime payload', () => {
    resetLocalIntelForTests(file([shop('a'), shop('b'), shop('c'), shop('d'), shop('e')]));
    const versionBefore = getLocalIntelVersion();

    hydrateLocalIntelFromRuntime(file([shop('tiny')]));
    expect(getLocalIntelVersion()).toBe(versionBefore);
    expect(getAllLocalIntelEntries().length).toBe(5);
    expect(getAllLocalIntelEntries().some((e) => e.id === 'tiny')).toBe(false);
  });

  it('PILG-051 hub rail orders active, dated upcoming, then unannounced-in-horizon', () => {
    const active = intelEvent('active', {
      schedule: { kind: 'fixed', startsAt: '2026-07-01', endsAt: '2026-07-31' },
    });
    const ongoing = intelEvent('ongoing', { schedule: { kind: 'ongoing' } });
    const soon = intelEvent('soon', {
      schedule: { kind: 'fixed', startsAt: '2026-07-20', endsAt: '2026-07-20' },
    });
    const later = intelEvent('later', {
      schedule: { kind: 'fixed', startsAt: '2026-08-10', endsAt: '2026-08-10' },
    });
    const unannouncedInHorizon = intelEvent('tba-oct', {
      schedule: { kind: 'annual', typicalMonth: 10, confirmed: [] },
    });
    const unannouncedOutside = intelEvent('tba-march', {
      schedule: { kind: 'annual', typicalMonth: 3, confirmed: [] },
    });
    const ended = intelEvent('ended', {
      schedule: { kind: 'fixed', startsAt: '2026-01-01', endsAt: '2026-01-02' },
    });
    resetLocalIntelForTests(
      file([ended, unannouncedOutside, later, unannouncedInHorizon, soon, ongoing, active]),
    );

    const rail = getHubRailEvents(NOW, 90);
    expect(rail.map((r) => r.event.id)).toEqual(['active', 'ongoing', 'soon', 'later', 'tba-oct']);
    expect(rail[0].state.state).toBe('active');
    expect(rail[4].state.state).toBe('unannounced');
  });
});
