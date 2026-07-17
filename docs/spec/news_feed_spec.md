# Anime News Feed Spec

## 1. Goal

Give users an in-app stream of Japanese (and a few English) anime-news and
event/calendar sources they can follow individually. A curated recommended
set is followed by default; the merged stream is read-only and links out to
each article in the system browser. Sources are shipped as a bundled dataset
now, with a runtime-hydration seam for later server sync.

The feature never fabricates content. Every source in the dataset was
live-verified (the feed returned valid XML with recent items) and carries a
`verifiedAt`. Article content is always real, parsed from the source feed;
caches may be stale (shown via relative time), but a missing field is left
empty rather than invented.

## 2. Data Model

```ts
export interface NewsText {
  ja: string;        // canonical
  en?: string;
  zhHant?: string;
}

export type NewsCategory = 'pilgrimage' | 'news' | 'event' | 'goods' | 'industry';
export type NewsFormat = 'rss2' | 'atom' | 'rdf';

export interface NewsSource {
  id: string;                 // stable slug, e.g. 'seichimap'
  name: NewsText;
  feedUrl: string;            // resolved final URL (redirects pre-followed)
  homepageUrl: string;
  category: NewsCategory;
  language: 'ja' | 'en';
  format: NewsFormat;         // the format actually served (parser auto-detects too)
  recommended: boolean;       // followed by default for new users
  frequency: 'high' | 'medium' | 'low';
  verifiedAt: string;         // 'YYYY-MM-DD'
  notes?: string;
}

export interface NewsArticle {
  id: string;                 // guid/id when present, else the link
  sourceId: string;
  title: string;
  link: string;
  publishedAt: number;        // epoch ms; 0 when the feed omits a date
  excerpt?: string;           // description, HTML-stripped, entity-decoded, ~200 chars
  thumbnailUrl?: string;      // media:thumbnail/content or enclosure image; omitted when absent
}

export interface NewsSourceFile {
  $schema?: string;
  generatedAt: number;
  source: string;
  count: number;
  entries: NewsSource[];
}
```

## 3. Feed Parser

`parseFeed(xml: string, sourceId: string): NewsArticle[]` — a pure,
dependency-free tolerant parser (Hermes has no `DOMParser`; no XML library is
installed). It auto-detects the three formats and never throws:

- **RSS 2.0** — `channel > item`; `guid`, `title`, `link`, `pubDate`
  (RFC 822), `description`. Image from `media:thumbnail`/`media:content`
  `url`, `enclosure[type^=image] url`, or the first `<img src>` in the
  description.
- **Atom** — `feed > entry`; `id`, `title`, `updated`/`published` (RFC 3339),
  `link[rel=alternate]` (or the first `link`), `summary`/`content`.
- **RDF (RSS 1.0)** — top-level `item` elements; `dc:date`, `title`, `link`,
  `description`.

Tolerance rules (each pinned by a test):

- CDATA sections and the basic HTML entity set (`&amp; &lt; &gt; &quot;
  &#39; &#NN; &#xNN;`) are decoded in text fields.
- Titles/excerpts are HTML-tag-stripped and whitespace-collapsed; excerpt is
  truncated to ~200 chars on a word boundary.
- Missing `guid`/`id` → `id` falls back to `link`. Missing both `guid` and
  `link` → the item is dropped (unaddressable).
- Missing/unparseable date → `publishedAt = 0` (sorts last; never a fake
  "now").
- Malformed or non-feed XML → returns `[]`, never throws.

## 4. Sources

Curated bundle `libs/services/news/news-sources.data.json` (standard
envelope). Loaded lazily via `require()` on first access, partitioned/indexed
by id, memoized — mirroring `local-intel-repository.ts`. Normalization drops
entries missing `id`, `feedUrl`, or `verifiedAt`, and dedupes by id.

- `getAllNewsSources(): readonly NewsSource[]`
- `getNewsSource(id): NewsSource | null`
- `getRecommendedSourceIds(): readonly string[]`
- `hydrateNewsSourcesFromRuntime(file)` — runtime swap guarded by
  `hasSufficientRuntimeCoverage` (reused from
  `../pilgrimage/anitabi-runtime-coverage`), bumps a version counter and
  notifies subscribers via `subscribeNewsSources` / `getNewsSourcesVersion`.

## 5. Follow Set

`libs/services/news/news-follows.ts` — MMKV set of followed source ids,
mirroring `spot-intents.ts`. Key `NEWS_FOLLOWS_STORAGE_KEY =
'aniseekr.news.follows.v1'`.

- **Uninitialized (no stored value) resolves to the recommended set** — a
  new user follows exactly the `recommended === true` sources. Once the user
  makes any change, the stored explicit set is authoritative (including the
  empty set — following nothing is a valid, distinct state from
  uninitialized).
- Pure reducers `followSource(set, id)` / `unfollowSource(set, id)`; sync
  `loadFollowedSourceIdsSync()`, persist `saveFollowedSourceIds(ids)`,
  `subscribeNewsFollows`. Unknown/stale ids are sanitized out on read
  against the current source dataset.

## 6. RSS Client

`libs/clients/rss-client.ts` — one transport mirroring
`anitabi-client.ts`: injectable `fetchImpl`, `AbortController` +
30s timeout, `User-Agent: 'Aniseekr/1.0 (https://github.com/Aniseekr)'`,
`Accept: application/rss+xml, application/atom+xml, application/xml, text/xml`,
serialized through the new `'rss'` `RateLimiterChannel`
(`minIntervalMs` 250). Status normalization to `DataSourceError`
(`libs/services/data-sources/data-source-error.ts`): 429 →
`RATE_LIMITED` (honoring `Retry-After` via `registerCooldown`), ≥500 →
`SERVER_ERROR`, abort/timeout/network → `NETWORK_ERROR`, other non-2xx →
`UNKNOWN`. Returns the raw XML string for the parser.

## 7. Merged Stream

`libs/services/news/news-stream.ts` combines the followed sources.

- Per-source cache in `CacheService` under `news:feed:{sourceId}`, fresh TTL
  30 min, stale grace 24 h (`getWithMeta` / `getSyncWithMeta`). A source's
  cache TTL is independent of the others.
- `getStreamSync()` reads only sync caches for frame-1 paint (Rule 10);
  `refreshStream()` fetches each followed source through the rss-client +
  parser, writes its cache, and returns the merged result.
- Merge: concatenate all followed sources' articles, sort by `publishedAt`
  descending (id as a stable tiebreaker), dedupe by `link`.
- **A single source failing (network/parse) must not poison the stream** —
  its error is logged and its last good cache (even if stale) is used;
  other sources render normally. A source with no cache and a failed fetch
  simply contributes nothing.

## 8. UI

- **Stream screen** `app/(tabs)/pilgrimage/news/index.tsx` — frame-1 paints
  from `getStreamSync()` (cold load shows a `Skeleton.ListRow` set <100 ms),
  background-revalidates, pull-to-refresh forces `refreshStream()`. Rows show
  source chip, title, relative time, optional thumbnail (hidden on load
  error — no placeholder). Tap → `Linking.openURL(article.link)`. A "manage
  sources" affordance opens the sources screen.
- **Sources screen** `app/(tabs)/pilgrimage/news/sources.tsx` — grouped by
  category, each a toggle row (follow/unfollow) writing the follow set;
  recommended sources badged.
- **Hub entry** — an entry point into the news stream in the pilgrimage hub
  探索 section (`app/(tabs)/pilgrimage/index.tsx`).
- All UI strings via `useT()` (`news.*` keys, en first then zh-Hant); source
  and article text via the `NewsText`/feed values, never hardcoded English.

## 9. Calendar Rail Redesign

`components/pilgrimage/IntelEventsRail.tsx` is rebuilt around a fixed
date-block that makes the four event states visually distinct. A pure helper
`deriveEventDateBlock(state: EventDateState, language: string): EventDateBlock`
returns what the block renders:

```ts
export interface EventDateBlock {
  top: string;                                    // month label / '常設' / '未定'
  main: string;                                   // day number / '' / 'N月'
  emphasis: 'active' | 'upcoming' | 'ongoing' | 'tba';
}
```

- `active` (dated) → month + day, `emphasis: 'active'` (accent-filled block).
- `upcoming` → month + day of the occurrence, `emphasis: 'upcoming'`.
- `ongoing` → `top` = 常設/"Always", `main` empty, `emphasis: 'ongoing'`.
- `unannounced` → `top` = 未定/"TBA", `main` = the localized `N月`,
  `emphasis: 'tba'` (muted block, sorted last by the existing
  `getHubRailEvents` order).

The data layer (`getHubRailEvents`) is unchanged. Month labels are
locale-formatted deterministically (CJK `N月`, else `Mon`), mirroring
`components/pilgrimage/detail/intel-format.ts`.

## 10. Test Coverage

- NEWS-001: RSS 2.0 parse — guid/pubDate/description with CDATA and entities
- NEWS-002: Atom parse — entry/updated/`link[rel=alternate]`
- NEWS-003: RDF (RSS 1.0) parse — `dc:date`
- NEWS-004: parser tolerance — malformed XML returns `[]`, missing guid falls
  back to link, missing date yields `publishedAt = 0`, unaddressable item dropped
- NEWS-005: source dataset loads, drops entries missing id/feedUrl/verifiedAt,
  dedupes by id, exposes the recommended set
- NEWS-006: follow set — uninitialized resolves to recommended, follow/unfollow
  reducers, empty-set distinct from uninitialized, stale-id sanitize, persistence roundtrip
- NEWS-007: merged stream — cross-source publishedAt-descending order, link
  dedupe, one source failing does not poison the others
- NEWS-008: stream cache — fresh returns cached, stale returns value flagged
  for refresh, per-source TTL independence
- NEWS-009: rss-client error normalization — 429→RATE_LIMITED, ≥500→SERVER_ERROR,
  timeout/network→NETWORK_ERROR
- PILG-052: `deriveEventDateBlock` — active/upcoming/ongoing/unannounced produce
  the right top/main/emphasis across languages

## 11. Future Extensions (out of scope)

- Server-synced source catalog + daily CI feed-liveness validation
  (Aniseekr-source / aniseeker_backend); WalkerPlus JSON-LD event ingestion.
- In-app reader (expo-web-browser) instead of the system browser.
- Per-article read/seen state and unread counts.
- Keyword/anime-title filtering of the merged stream.
