import { describe, it, expect } from 'bun:test';
import { resolveWatchOptions } from '../../libs/services/streaming/streaming-resolver';
import { DEFAULT_STREAMING_PREFS } from '../../libs/services/user-prefs';

describe('streaming-resolver', () => {
  it('SR-001 empty AniList list with no prefs returns an empty array — never a fake row', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [],
      prefs: DEFAULT_STREAMING_PREFS,
    });
    expect(got).toEqual([]);
  });

  it('SR-002 maps AniList streaming links onto known platform ids', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/12345' },
        { site: 'Netflix', url: 'https://www.netflix.com/title/80999636' },
      ],
      prefs: DEFAULT_STREAMING_PREFS,
    });
    // Both AniList entries surface as 'official' options when no prefs are set.
    expect(got.map((o) => o.platformId)).toEqual(['crunchyroll', 'netflix']);
    expect(got.every((o) => o.source === 'official')).toBe(true);
    expect(got[0].url).toBe('https://www.crunchyroll.com/series/12345');
  });

  it('SR-003 preserves unknown sites as "unknown" entries with their raw label', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Spice and Wolf',
      anilistStreaming: [{ site: 'Random TV', url: 'https://random.example/show/1' }],
      prefs: DEFAULT_STREAMING_PREFS,
    });
    expect(got).toHaveLength(1);
    expect(got[0].platformId).toBeNull();
    expect(got[0].displayName).toBe('Random TV');
    expect(got[0].source).toBe('official');
  });

  it('SR-004 primary platform sorts first even when AniList lists it last', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [
        { site: 'Netflix', url: 'https://www.netflix.com/title/1' },
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/2' },
      ],
      prefs: { enabled: ['crunchyroll'], primary: 'crunchyroll', preferAppDeepLink: true },
    });
    expect(got[0].platformId).toBe('crunchyroll');
    expect(got[0].url).toBe('https://www.crunchyroll.com/series/2');
    expect(got[1].platformId).toBe('netflix');
  });

  it('SR-005 enabled platforms not in AniList list still appear with search URLs', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [{ site: 'Netflix', url: 'https://www.netflix.com/title/1' }],
      prefs: { enabled: ['bahamut', 'netflix'], primary: 'bahamut', preferAppDeepLink: true },
    });
    // Primary (bahamut) is enabled-only (no AniList row) → must surface with a search URL.
    expect(got[0].platformId).toBe('bahamut');
    expect(got[0].source).toBe('search');
    expect(got[0].url).toContain('ani.gamer.com.tw');
    expect(got[0].url).toContain(encodeURIComponent('Frieren'));
    // Second is netflix (enabled AND matched by AniList) — official, not search.
    expect(got[1].platformId).toBe('netflix');
    expect(got[1].source).toBe('official');
  });

  it('SR-006 dedupes the same platform when AniList lists multiple URLs', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/2' },
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/2' },
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/2-dub' },
      ],
      prefs: DEFAULT_STREAMING_PREFS,
    });
    expect(got).toHaveLength(1);
    expect(got[0].url).toBe('https://www.crunchyroll.com/series/2');
  });

  it('SR-007 search fallback is skipped for blank titles (avoids fake "Available" rows)', () => {
    const got = resolveWatchOptions({
      animeTitle: '   ',
      anilistStreaming: [],
      prefs: { enabled: ['bahamut'], primary: 'bahamut', preferAppDeepLink: true },
    });
    // No title → cannot build a real search URL → nothing to render. Follows
    // CLAUDE.md Rule 8: we render no row before a fake row.
    expect(got).toEqual([]);
  });

  it('SR-008 enabled-without-primary keeps enabled order in result', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [],
      prefs: {
        enabled: ['crunchyroll', 'netflix', 'bahamut'],
        primary: null,
        preferAppDeepLink: true,
      },
    });
    expect(got.map((o) => o.platformId)).toEqual(['crunchyroll', 'netflix', 'bahamut']);
    expect(got.every((o) => o.source === 'search')).toBe(true);
  });

  it('SR-009 non-enabled AniList rows trail enabled ones', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [
        // unenabled
        { site: 'Hulu', url: 'https://www.hulu.com/watch/abc' },
        // enabled (matches crunchyroll)
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/x' },
      ],
      prefs: { enabled: ['crunchyroll'], primary: 'crunchyroll', preferAppDeepLink: true },
    });
    expect(got[0].platformId).toBe('crunchyroll');
    expect(got[1].platformId).toBe('hulu');
  });

  it('SR-010 each option carries the brand color/icon needed by the UI', () => {
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [{ site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/x' }],
      prefs: DEFAULT_STREAMING_PREFS,
    });
    expect(got[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(typeof got[0].icon).toBe('string');
  });

  it('SR-011 each option carries logoDomain + monogram so PlatformLogo can render', () => {
    // The detail screen, CTA, and settings row all feed WatchOption directly
    // into <PlatformLogo>. Without these fields the badges would render
    // empty discs.
    const got = resolveWatchOptions({
      animeTitle: 'Frieren',
      anilistStreaming: [
        { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/series/x' },
        { site: 'Random TV', url: 'https://random.example/show/1' },
      ],
      prefs: { enabled: ['bahamut'], primary: 'bahamut', preferAppDeepLink: true },
    });
    // Catalog entries inherit their spec's fields.
    const crunchy = got.find((o) => o.platformId === 'crunchyroll');
    expect(crunchy?.logoDomain).toBe('crunchyroll.com');
    expect(crunchy?.monogram).toBe('CR');

    // Bahamut has an explicit logoDomain override + Chinese monogram.
    const baha = got.find((o) => o.platformId === 'bahamut');
    expect(baha?.logoDomain).toBe('gamer.com.tw');
    expect(baha?.monogram).toBe('巴');

    // Unknown sites still get a monogram derived from the label, plus the
    // host parsed from the URL for a best-effort logo fetch.
    const unknown = got.find((o) => o.platformId === null);
    expect(unknown?.monogram).toBe('RT'); // "Random TV" → R + T
    expect(unknown?.logoDomain).toBe('random.example');
  });
});
