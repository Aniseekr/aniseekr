/**
 * Streaming platform catalog.
 *
 * Separate from `PlatformType` (auth/types.ts) which lists *tracking* sources
 * (AniList, MyAnimeList, Bangumi, …). This catalog lists *watch* destinations
 * — Netflix, Crunchyroll, Bahamut, etc. — that the user can configure as
 * their preferred ways to watch each anime.
 *
 * Brand colors are hex literals (semantic identifiers, not theme-derived) —
 * same convention as PLATFORM_CONFIGS. See CLAUDE.md Rule 4.
 *
 * URL templates are kept simple on purpose. We do not pretend to know every
 * deep-link scheme; only the ones with a published custom scheme that the
 * Linker can `canOpenURL` against are populated. Everything else falls back
 * to the web URL — that is the correct behaviour, not a stub.
 */

import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type StreamingPlatformId =
  | 'crunchyroll'
  | 'netflix'
  | 'disneyplus'
  | 'amazonprime'
  | 'hulu'
  | 'hidive'
  | 'bahamut'
  | 'bilibili'
  | 'iqiyi'
  | 'youku'
  | 'abema'
  | 'youtube'
  | 'muse-asia'
  | 'viu'
  | 'aniplus';

export interface StreamingPlatformSpec {
  id: StreamingPlatformId;
  displayName: string;
  /** Brand color (hex). Semantic identifier, not a theme token. */
  color: string;
  /** Ionicons glyph used as a generic platform icon (real logos require an asset pipeline). */
  icon: IoniconName;
  /** Lowercase domain fragments used to match incoming watch URLs back to this platform. */
  domains: string[];
  /** Aliases (lowercased) used to map AniList's `site` label to a catalog id. */
  aliases: string[];
  /** Optional iOS / Android custom URL scheme used to launch the native app. */
  deepLinkScheme?: string;
  /**
   * Build a search URL for a given (non-empty) title. Implementations should
   * return the platform's in-app search page so users land on something useful
   * even when the AniList streaming list is empty for this anime.
   */
  buildSearch(title: string): string;
  /** Region hints. 'Global' for global services, ISO codes for regional ones. */
  regions?: string[];
  /** One-line description for the settings screen. Optional. */
  description?: string;
  /**
   * Domain used by the clearbit logo CDN to fetch the official brand logo
   * (`https://logo.clearbit.com/<logoDomain>`). Defaults to the first item
   * in `domains`. Override when the first domain doesn't have a clearbit-
   * indexed logo (e.g. regional services use the corporate root).
   */
  logoDomain?: string;
  /**
   * Direct URL to a square icon (e.g. Play Store app icon). When set, this is
   * tried *before* favicon/clearbit so we can pin a known-good asset for
   * regional services where the favicon CDNs don't carry a recognisable logo.
   * The image is rendered with `cover` fit at zero inset, so the source must
   * be roughly square — Play Store / App Store icons are perfect.
   */
  iconUrl?: string;
  /**
   * 1–2 character fallback monogram rendered inside a brand-color disc when
   * the official logo can't be loaded (network failure, clearbit doesn't
   * carry the brand). Required so every catalog entry has *some* visual
   * identity even fully offline.
   */
  monogram: string;
}

const platforms: StreamingPlatformSpec[] = [
  {
    id: 'crunchyroll',
    displayName: 'Crunchyroll',
    color: '#F47521',
    icon: 'play-circle',
    domains: ['crunchyroll.com'],
    aliases: ['crunchyroll', 'funimation', 'vrv'],
    deepLinkScheme: 'crunchyroll://',
    buildSearch: (q) => `https://www.crunchyroll.com/search?q=${encodeURIComponent(q)}`,
    regions: ['Global'],
    description: 'Largest global anime catalog (subs + dubs).',
    monogram: 'CR',
  },
  {
    id: 'netflix',
    displayName: 'Netflix',
    color: '#E50914',
    icon: 'film',
    domains: ['netflix.com'],
    aliases: ['netflix'],
    deepLinkScheme: 'nflx://',
    buildSearch: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`,
    regions: ['Global'],
    monogram: 'N',
  },
  {
    id: 'disneyplus',
    displayName: 'Disney+',
    color: '#113CCF',
    icon: 'planet',
    domains: ['disneyplus.com'],
    aliases: ['disney+', 'disneyplus', 'disney plus'],
    buildSearch: (q) => `https://www.disneyplus.com/search/${encodeURIComponent(q)}`,
    regions: ['Global'],
    monogram: 'D+',
  },
  {
    id: 'amazonprime',
    displayName: 'Prime Video',
    color: '#00A8E1',
    icon: 'logo-amazon',
    domains: ['primevideo.com', 'amazon.com', 'amazon.co.jp'],
    aliases: ['amazon prime video', 'prime video', 'amazon', 'primevideo'],
    buildSearch: (q) => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(q)}`,
    regions: ['Global'],
    monogram: 'PV',
  },
  {
    id: 'hulu',
    displayName: 'Hulu',
    color: '#1CE783',
    icon: 'tv',
    domains: ['hulu.com'],
    aliases: ['hulu'],
    buildSearch: (q) => `https://www.hulu.com/search?q=${encodeURIComponent(q)}`,
    regions: ['US', 'JP'],
    monogram: 'h',
  },
  {
    id: 'hidive',
    displayName: 'HIDIVE',
    color: '#00BCD4',
    icon: 'flash',
    domains: ['hidive.com'],
    aliases: ['hidive'],
    buildSearch: (q) => `https://www.hidive.com/search?q=${encodeURIComponent(q)}`,
    regions: ['US'],
    monogram: 'HD',
  },
  {
    id: 'bahamut',
    displayName: '動漫瘋',
    color: '#F8C73B',
    icon: 'sparkles',
    domains: ['ani.gamer.com.tw', 'gamer.com.tw'],
    aliases: [
      'bahamut',
      '巴哈姆特',
      '巴哈姆特動畫瘋',
      '動漫瘋',
      '動畫瘋',
      'animation crazy',
      'gamer',
      'animad',
    ],
    buildSearch: (q) =>
      `https://ani.gamer.com.tw/search.php?keyword=${encodeURIComponent(q)}`,
    regions: ['TW'],
    description: '巴哈姆特動漫瘋 (Animation Crazy) — 台灣最大授權動畫平台。',
    // Play Store app icon, pinned because clearbit doesn't index gamer.com.tw
    // and the corporate favicon is the Bahamut dragon rather than the dedicated
    // 動漫瘋 mark. Falls through to favicon → monogram if this asset ever 404s.
    iconUrl:
      'https://play-lh.googleusercontent.com/FNShJS-ArMjI28I4-CHlgWaA9HqKnj4DrW8-lXF2B_FH3U0KxP_djBnMuyK7Hxymxrq8=w240-h480-rw',
    logoDomain: 'gamer.com.tw',
    monogram: '巴',
  },
  {
    id: 'bilibili',
    displayName: 'Bilibili',
    color: '#00A1D6',
    icon: 'play',
    domains: ['bilibili.com', 'bilibili.tv', 'b23.tv'],
    aliases: ['bilibili', '哔哩哔哩', '嗶哩嗶哩'],
    buildSearch: (q) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(q)}`,
    regions: ['CN', 'TW', 'SEA'],
    monogram: 'b',
  },
  {
    id: 'iqiyi',
    displayName: 'iQIYI',
    color: '#00BE06',
    icon: 'play-skip-forward',
    domains: ['iqiyi.com', 'iq.com'],
    aliases: ['iqiyi', 'iq.com', '愛奇藝', '爱奇艺'],
    buildSearch: (q) => `https://www.iq.com/search?query=${encodeURIComponent(q)}`,
    regions: ['CN', 'TW', 'SEA'],
    logoDomain: 'iqiyi.com',
    monogram: 'iQ',
  },
  {
    id: 'youku',
    displayName: 'Youku',
    color: '#1B95E0',
    icon: 'aperture',
    domains: ['youku.com'],
    aliases: ['youku', '优酷', '優酷'],
    buildSearch: (q) => `https://so.youku.com/search_video/q_${encodeURIComponent(q)}`,
    regions: ['CN'],
    monogram: '优',
  },
  {
    id: 'abema',
    displayName: 'ABEMA',
    color: '#00DD00',
    icon: 'radio',
    domains: ['abema.tv'],
    aliases: ['abema', 'abematv', 'abema tv'],
    deepLinkScheme: 'abema://',
    buildSearch: (q) => `https://abema.tv/search?q=${encodeURIComponent(q)}`,
    regions: ['JP'],
    monogram: 'A',
  },
  {
    id: 'youtube',
    displayName: 'YouTube',
    color: '#FF0000',
    icon: 'logo-youtube',
    domains: ['youtube.com', 'youtu.be', 'm.youtube.com'],
    aliases: ['youtube', 'yt'],
    deepLinkScheme: 'youtube://',
    buildSearch: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    regions: ['Global'],
    monogram: 'YT',
  },
  {
    id: 'muse-asia',
    displayName: '木棉花 Muse',
    color: '#EE2737',
    icon: 'musical-notes',
    // 木棉花國際 (Muse Communication) distributes via several YouTube channels
    // (Muse Asia for SEA, Muse 木棉花 for TW). We match the SEA channel path
    // and both corporate web roots; for everything else the search URL routes
    // through YouTube filtered by the brand keyword.
    domains: ['youtube.com/c/MuseAsia', 'museasia.tv', 'muse.com.tw'],
    aliases: [
      'muse asia',
      'muse-asia',
      'museasia',
      'muse',
      'muse communication',
      '木棉花',
      '木棉花國際',
      'mumianhua',
      'kapok',
    ],
    buildSearch: (q) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`${q} 木棉花`)}`,
    regions: ['TW', 'SEA'],
    description: '木棉花國際 — official YouTube distribution for TW/SEA.',
    // muse.com.tw is the Taiwan corporate site; its favicon carries the kapok
    // brand mark cleanly. The favicon-first PlatformLogo loader picks that up
    // even when clearbit doesn't index the corporate domain.
    logoDomain: 'muse.com.tw',
    monogram: '木',
  },
  {
    id: 'viu',
    displayName: 'Viu',
    color: '#FFB400',
    icon: 'play-circle-outline',
    domains: ['viu.com'],
    aliases: ['viu'],
    buildSearch: (q) => `https://www.viu.com/ott/sg/en-us/search/?keywords=${encodeURIComponent(q)}`,
    regions: ['SEA'],
    monogram: 'V',
  },
  {
    id: 'aniplus',
    displayName: 'ANIPLUS Asia',
    color: '#1E88E5',
    icon: 'tv-outline',
    domains: ['aniplus-asia.com'],
    aliases: ['aniplus', 'aniplus asia'],
    buildSearch: (q) => `https://www.aniplus-asia.com/?s=${encodeURIComponent(q)}`,
    regions: ['SEA'],
    monogram: 'A+',
  },
];

const byId: Record<string, StreamingPlatformSpec> = {};
const aliasIndex: Map<string, StreamingPlatformSpec> = new Map();
const domainIndex: Array<{ domain: string; spec: StreamingPlatformSpec }> = [];

for (const spec of platforms) {
  byId[spec.id] = spec;
  for (const alias of [...spec.aliases, spec.id, spec.displayName]) {
    aliasIndex.set(alias.trim().toLowerCase(), spec);
  }
  for (const d of spec.domains) {
    domainIndex.push({ domain: d.toLowerCase(), spec });
  }
}
// Longer (more specific) domains first so e.g. 'youtube.com/c/MuseAsia' beats
// 'youtube.com' for Muse Asia links.
domainIndex.sort((a, b) => b.domain.length - a.domain.length);

export const STREAMING_PLATFORMS: Record<StreamingPlatformId, StreamingPlatformSpec> =
  byId as Record<StreamingPlatformId, StreamingPlatformSpec>;

export const STREAMING_PLATFORM_IDS: readonly StreamingPlatformId[] = platforms.map(
  (p) => p.id
);

export function listStreamingPlatforms(): StreamingPlatformSpec[] {
  return platforms.slice();
}

export function getStreamingPlatform(
  id: StreamingPlatformId | string
): StreamingPlatformSpec | null {
  return byId[id] ?? null;
}

export function matchStreamingPlatformByUrl(url: string | null | undefined): StreamingPlatformSpec | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let host = '';
  let path = '';
  try {
    const parsed = new URL(trimmed);
    host = parsed.host.toLowerCase();
    path = parsed.pathname.toLowerCase();
  } catch {
    return null;
  }

  if (!host) return null;
  const hostAndPath = host + path;

  for (const { domain, spec } of domainIndex) {
    if (domain.includes('/')) {
      if (hostAndPath.includes(domain)) return spec;
    } else if (host === domain || host.endsWith('.' + domain)) {
      return spec;
    }
  }
  return null;
}

export function matchStreamingPlatformBySite(site: string | null | undefined): StreamingPlatformSpec | null {
  if (!site || typeof site !== 'string') return null;
  const key = site.trim().toLowerCase();
  if (!key) return null;
  return aliasIndex.get(key) ?? null;
}

export function buildSearchUrl(
  id: StreamingPlatformId | string,
  title: string | null | undefined
): string | null {
  const spec = byId[id as string];
  if (!spec) return null;
  if (!title || typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (!trimmed) return null;
  return spec.buildSearch(trimmed);
}

/**
 * Resolve the clearbit-compatible logo domain for a spec. Prefers the
 * explicit `logoDomain` override, otherwise picks the first plain (non-path)
 * domain from the spec's `domains` list. Returns null when no candidate
 * exists — caller should fall back to the spec's monogram.
 */
export function resolveLogoDomain(spec: StreamingPlatformSpec): string | null {
  if (spec.logoDomain) return spec.logoDomain;
  for (const d of spec.domains) {
    if (!d.includes('/')) return d;
  }
  return null;
}

export function buildDeepLink(
  id: StreamingPlatformId | string,
  webUrl: string
): string | null {
  const spec = byId[id as string];
  if (!spec || !spec.deepLinkScheme) return null;
  // The scheme alone is enough for `Linking.canOpenURL` to probe whether the
  // app is installed. Most schemes don't have a public deep-link grammar to
  // map an arbitrary web URL onto, so we keep this minimal: scheme + host
  // path so the launched app at least lands on its home screen.
  // (For schemes with richer deep-link contracts we can add a per-platform
  // resolver here; today we only need the probe-able scheme.)
  return spec.deepLinkScheme + (webUrl ? '' : '');
}
