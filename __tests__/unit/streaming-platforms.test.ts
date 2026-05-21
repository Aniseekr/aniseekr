import { describe, it, expect } from 'bun:test';
import {
  STREAMING_PLATFORMS,
  getStreamingPlatform,
  matchStreamingPlatformByUrl,
  matchStreamingPlatformBySite,
  buildSearchUrl,
  buildDeepLink,
  listStreamingPlatforms,
  resolveLogoDomain,
  STREAMING_PLATFORM_IDS,
  type StreamingPlatformId,
} from '../../libs/services/streaming/streaming-platforms';

describe('streaming-platforms catalog', () => {
  it('SP-001 ships a curated set with stable ids and brand metadata', () => {
    const ids = STREAMING_PLATFORM_IDS;
    expect(ids.length).toBeGreaterThanOrEqual(10);
    for (const id of ids) {
      const spec = getStreamingPlatform(id);
      expect(spec).not.toBeNull();
      expect(spec!.id).toBe(id);
      expect(spec!.displayName.length).toBeGreaterThan(0);
      // Every entry must have at least one matchable web domain.
      expect(spec!.domains.length).toBeGreaterThan(0);
      // Brand color is a hex literal — semantic, not theme-derived (matches
      // PLATFORM_CONFIGS convention from auth/types.ts).
      expect(spec!.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    // Snapshot a few well-known ids exist by name.
    expect(ids).toContain('crunchyroll');
    expect(ids).toContain('netflix');
    expect(ids).toContain('bahamut');
    expect(ids).toContain('bilibili');
  });

  it('SP-002 listStreamingPlatforms preserves declaration order from the catalog', () => {
    const ordered = listStreamingPlatforms().map((p) => p.id);
    expect(ordered).toEqual(STREAMING_PLATFORM_IDS as unknown as StreamingPlatformId[]);
  });

  it('SP-003 matchStreamingPlatformByUrl resolves common host patterns', () => {
    expect(matchStreamingPlatformByUrl('https://www.crunchyroll.com/series/12345')?.id).toBe(
      'crunchyroll'
    );
    expect(matchStreamingPlatformByUrl('https://www.netflix.com/title/80999636')?.id).toBe(
      'netflix'
    );
    // Bahamut TW (ani.gamer.com.tw / gamer.com.tw) — both should match.
    expect(matchStreamingPlatformByUrl('https://ani.gamer.com.tw/animeVideo.php?sn=1')?.id).toBe(
      'bahamut'
    );
    expect(matchStreamingPlatformByUrl('https://gamer.com.tw/animeRef.php?sn=1')?.id).toBe(
      'bahamut'
    );
    // Bilibili spans .com (CN) and .tv (TW/SEA) — both must match the same id.
    expect(matchStreamingPlatformByUrl('https://www.bilibili.com/bangumi/play/ss123')?.id).toBe(
      'bilibili'
    );
    expect(matchStreamingPlatformByUrl('https://www.bilibili.tv/anime/123/456')?.id).toBe(
      'bilibili'
    );
  });

  it('SP-004 unknown URL returns null instead of throwing', () => {
    expect(matchStreamingPlatformByUrl('https://example.com/anime/x')).toBeNull();
    // Invalid URLs must not crash — malformed input returns null.
    expect(matchStreamingPlatformByUrl('not a url')).toBeNull();
    expect(matchStreamingPlatformByUrl('')).toBeNull();
  });

  it('SP-005 matchStreamingPlatformBySite uses AniList "site" labels', () => {
    // AniList returns `site: "Crunchyroll"` for streaming externalLinks. Match
    // is case-insensitive and tolerant of whitespace.
    expect(matchStreamingPlatformBySite('Crunchyroll')?.id).toBe('crunchyroll');
    expect(matchStreamingPlatformBySite('  netflix  ')?.id).toBe('netflix');
    expect(matchStreamingPlatformBySite('NETFLIX')?.id).toBe('netflix');
    // Aliases: AniList sometimes returns "Amazon Prime Video".
    expect(matchStreamingPlatformBySite('Amazon Prime Video')?.id).toBe('amazonprime');
    // Unknown site returns null.
    expect(matchStreamingPlatformBySite('Random TV')).toBeNull();
  });

  it('SP-006 buildSearchUrl encodes the anime title safely', () => {
    const u = buildSearchUrl('crunchyroll', '鬼滅の刃');
    expect(u).toContain('crunchyroll.com');
    // Title must be URL-encoded so multibyte characters round-trip.
    expect(u).toContain(encodeURIComponent('鬼滅の刃'));
    // Netflix has a distinct search path.
    expect(buildSearchUrl('netflix', 'Frieren')).toMatch(/netflix\.com\/search\?q=Frieren/);
  });

  it('SP-007 buildSearchUrl returns null for unknown platform id', () => {
    expect(buildSearchUrl('not-a-platform' as StreamingPlatformId, 'Frieren')).toBeNull();
    // Empty title is rejected — caller should fall back to platform homepage.
    expect(buildSearchUrl('netflix', '')).toBeNull();
    expect(buildSearchUrl('netflix', '   ')).toBeNull();
  });

  it('SP-008 buildDeepLink yields scheme URL when platform has one', () => {
    // Netflix has a registered iOS scheme (nflx://) for opening the app.
    const dl = buildDeepLink('netflix', 'https://www.netflix.com/title/80999636');
    expect(dl).not.toBeNull();
    expect(dl!.startsWith('nflx://')).toBe(true);
  });

  it('SP-009 buildDeepLink returns null when platform has no known scheme', () => {
    // Bahamut on iOS uses an unstable in-app router we cannot guarantee.
    expect(buildDeepLink('bahamut', 'https://ani.gamer.com.tw/animeVideo.php?sn=1')).toBeNull();
  });

  it('SP-010 region hints surface for regional services', () => {
    // Bahamut is Taiwan-only; the catalog declares that so UI can suggest it.
    const baha = getStreamingPlatform('bahamut');
    expect(baha?.regions).toContain('TW');
    // Abema is Japan-only.
    expect(getStreamingPlatform('abema')?.regions).toContain('JP');
    // Global services either omit `regions` or include the "Global" tag.
    const cr = getStreamingPlatform('crunchyroll');
    expect(cr?.regions === undefined || cr!.regions!.includes('Global')).toBe(true);
  });

  it('SP-011 every platform has a logoDomain + monogram so the badge never goes blank', () => {
    // Logo rendering is layered: the monogram is the placeholder *and* the
    // network-failure fallback. A spec without a monogram would render an
    // empty disc when clearbit 404s — and we ship offline-capable.
    for (const id of STREAMING_PLATFORM_IDS) {
      const spec = getStreamingPlatform(id)!;
      const monogram = spec.monogram;
      expect(monogram).toBeTruthy();
      expect(monogram.length).toBeGreaterThan(0);
      expect(monogram.length).toBeLessThanOrEqual(2);

      // resolveLogoDomain must return a bare host (no path), so the clearbit
      // URL we build is well-formed. Path-style entries (e.g. Muse Asia's
      // youtube.com/c/...) must be overridden via `logoDomain`.
      const domain = resolveLogoDomain(spec);
      // Null is OK — we want to *know* when it falls back to monogram, not crash.
      if (domain !== null) {
        expect(domain).not.toContain('/');
        expect(domain).not.toContain(' ');
      }
    }
  });

  it('SP-012 resolveLogoDomain prefers logoDomain override over first domain', () => {
    // 木棉花 Muse's primary "domain" is a YouTube channel path; the catalog
    // points logoDomain at the TW corporate site (muse.com.tw) whose favicon
    // carries the kapok brand mark.
    const muse = getStreamingPlatform('muse-asia')!;
    expect(muse.domains[0]).toContain('/');
    expect(resolveLogoDomain(muse)).toBe('muse.com.tw');

    // Platforms without an override fall back to the first domain.
    expect(resolveLogoDomain(getStreamingPlatform('netflix')!)).toBe('netflix.com');
    expect(resolveLogoDomain(getStreamingPlatform('crunchyroll')!)).toBe('crunchyroll.com');
  });
});
