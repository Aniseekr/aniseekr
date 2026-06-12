# Architecture: API Aggregation & Pilgrimage

## 1. Module Layout

```
libs/
├── db.ts                                  # SQLite wrapper (favorites, ratings, id_mappings, user_anime, collections)
├── clients/
│   ├── anilist-client.ts                  # GraphQL transport (existing)
│   ├── anilist-api.ts                     # GraphQL queries (existing)
│   ├── jikan-client.ts                    # MAL/Jikan REST transport (existing)
│   ├── bangumi-client.ts                  # NEW — bgm.tv v0 REST + chinese title enrichment
│   ├── annict-client.ts                   # NEW — Annict v1 REST + token cache
│   ├── kitsu-client.ts                    # NEW — JSON:API REST
│   ├── shikimori-client.ts                # NEW — Shikimori REST
│   ├── simkl-client.ts                    # NEW — Simkl REST + simkl-api-key
│   └── anitabi-client.ts                  # NEW — pilgrimage data
├── repositories/
│   ├── anime-repository.ts                # ORCHESTRATOR: resolveSource → queryClient → cache
│   └── user-repository.ts                 # (existing) — to be wired through new repo
├── services/
│   ├── data-sources/                      # NEW DIR — read-side (UnifiedAnimeItem)
│   │   ├── anime-data-source.ts           # protocol + types
│   │   ├── anilist-data-source.ts
│   │   ├── jikan-data-source.ts
│   │   ├── bangumi-data-source.ts
│   │   ├── annict-data-source.ts
│   │   ├── kitsu-data-source.ts
│   │   ├── shikimori-data-source.ts
│   │   ├── simkl-data-source.ts
│   │   └── data-source-error.ts
│   ├── providers/                         # (existing) — write-side (sync)
│   │   ├── base-provider.ts
│   │   └── *-provider.ts (8)
│   ├── pilgrimage/                        # NEW DIR
│   │   ├── anitabi-service.ts             # singleton with cache
│   │   ├── pilgrimage-repository.ts       # link anime → spots
│   │   └── types.ts                       # AnitabiPoint, AnitabiBangumi
│   ├── auth/
│   │   ├── auth-service.ts                # (existing)
│   │   └── types.ts                       # (existing) — extend with PlatformImageData, PlatformAnimeData
│   ├── sync/                              # (existing)
│   │   ├── id-mapping-service.ts          # cross-platform ID translation
│   │   └── multi-platform-sync-service.ts
│   ├── cache-service.ts                   # (existing) SQLite-backed TTL cache
│   ├── query-client.ts                    # NEW — in-memory request dedup + stale time
│   ├── rate-limiter.ts                    # NEW — per-platform interval + cooldown
│   ├── data-source-config.ts              # NEW — browse source persistence
│   └── data-source-switching-coordinator.ts # NEW — state machine
├── models/
│   ├── unified-anime-item.ts              # NEW — central type + merge/normalize
│   ├── platform-image-data.ts             # NEW
│   └── watch-status.ts                    # NEW (re-export from auth/types AnimeStatus)
└── utils/
    ├── chinese-converter.ts               # NEW — simplified→traditional (lazy)
    └── season-utils.ts                    # NEW — current season/year detection

components/
├── pilgrimage/                            # NEW DIR
│   ├── AnimePilgrimageCard.tsx            # card from japanwalker
│   ├── PilgrimageSpotList.tsx             # spot grid w/ scene images
│   └── NearbyPilgrimageBadge.tsx
└── ... (existing)

app/
├── pilgrimage/                            # NEW DIR
│   └── [animeId].tsx                      # spots view for one anime
├── settings/
│   └── data-source.tsx                    # NEW — browse source picker
└── ... (existing)

spec/
├── SPEC.md
├── architecture.md
├── api_contracts.md
├── pilgrimage_spec.md
├── provider_matrix.csv
├── test_cases.csv
├── test_traceability.csv
├── edge_cases.md
├── mutation_targets.txt
├── mutation_test_suites.txt
└── fixtures/
    ├── anilist-search-response.json
    ├── jikan-anime-1.json
    ├── bangumi-subject-7157.json
    ├── anitabi-bangumi-7157-lite.json
    └── ...

__tests__/
├── unit/
│   ├── unified-anime-item.test.ts
│   ├── data-source-config.test.ts
│   ├── id-mapping-service.test.ts
│   ├── query-client.test.ts
│   ├── rate-limiter.test.ts
│   ├── providers/
│   │   ├── anilist-data-source.test.ts
│   │   └── ... (one per provider)
│   ├── repositories/
│   │   └── anime-repository.test.ts
│   └── pilgrimage/
│       └── anitabi-service.test.ts
├── integration/
│   ├── anilist-live.test.ts
│   ├── jikan-live.test.ts
│   ├── bangumi-live.test.ts
│   └── anitabi-live.test.ts
└── parity/
    └── unified-item-parity.test.ts
```

## 2. Data Flow: Read Path

```
UI (e.g., Bangumi screen)
  ↓ animeRepository.fetchSeasonalAnime(page, season, year, preferredSource)
AnimeRepository
  ├─ resolveSource(preferredSource)  → preferred ?? config.browseSource ?? AniList
  ├─ check disk CacheService (key: "seasonal_<src>_<year>_<season>_<page>", TTL: 1h)
  └─ queryClient.fetch(key)
       ├─ in-flight dedup (same key → return same Promise)
       ├─ stale time: 5m
       └─ fetcher: source.fetchSeasonalAnime(...)
            ↓
            <Provider>DataSource
              ├─ rateLimiter.waitForAvailability(platform)
              ├─ <Provider>Client.fetch(...)  ← HTTP / GraphQL
              └─ convertToUnifiedItem(response)
                   ↓
                   UnifiedAnimeItem[]
  ← cache disk (only if non-empty AND source still matches current browse)
  ← return UnifiedAnimeItem[]
```

## 3. Data Flow: Detail with Cross-Platform Media Fallback

```
UI calls animeRepository.fetchAnimeStaff(id, sourcePlatform)
  ↓
AnimeRepository
  ├─ source = resolveSource(null)
  ├─ if source is AniList:
  │     result = aniList.fetchAnimeStaff(id, sourcePlatform)
  │              (AniList resolves cross-platform IDs internally)
  │  else:
  │     queryId = idMappingService.translate(id, from: sourcePlatform, to: source.type)
  │     result = source.fetchAnimeStaff(queryId)
  ├─ if result.empty AND source ≠ MAL:
  │     malId = idMappingService.translate(id, from: sourcePlatform, to: MAL)
  │     result = jikan.fetchAnimeStaff(malId)  ← Jikan fallback
  └─ return result
```

## 4. Data Flow: Pilgrimage Linkage

```
UI on anime detail screen
  ↓ pilgrimageRepository.getSpotsForAnime(unifiedAnimeItem)
PilgrimageRepository
  ├─ bangumiId = unifiedItem.platformData.bangumi?.id
  │   ?? idMappingService.translate(unifiedItem.id, from: source, to: bangumi)
  ├─ if no bangumiId → return null (anime has no pilgrimage data)
  ├─ check SQLite cache (table: pilgrimage_spots, FK by bangumiId, TTL: 7 days)
  └─ AnitabiService.getAnimePilgrimage(bangumiId)
       ├─ GET https://api.anitabi.cn/bangumi/{id}/lite
       └─ AnitabiBangumi { id, cn, title, city, cover, color, geo, zoom, litePoints[], pointsLength, imagesLength }
  ← persist to SQLite + return
```

## 5. Source Resolution Priority

| Step | Source | Used When |
|---|---|---|
| 1 | `preferredSource` arg | Caller explicitly pins (e.g., "show me Bangumi's view of this anime") |
| 2 | `dataSourceConfig.browseSource` | User-selected default (persisted in AsyncStorage) |
| 3 | `'anilist'` | Hard fallback when 2 unavailable |

## 6. Caching Strategy

| Layer | Storage | TTL | Use |
|---|---|---|---|
| QueryClient | In-memory Map | 5m stale time + dedup | Session-level dedup |
| CacheService | SQLite `cache` table | 1h list / 24h detail / 5m search | Cross-session disk |
| CharacterService | In-memory Map | 1h | Existing — keep |
| AnitabiService | In-memory Map | session lifetime | First load |
| pilgrimage_spots | SQLite | 7d | Persistent pilgrimage data |

Cache key conventions:
- List queries: `<endpoint>_<source>_<param1>_<param2>`
- Details: `anime_detail_<source>_<id>`
- Pilgrimage: `pilgrimage_<bangumiId>`

## 7. Error Taxonomy

```ts
class DataSourceError extends Error {
  code: 'NOT_FOUND' | 'SERVER_ERROR' | 'NETWORK_ERROR' | 'DECODING_ERROR' |
        'RATE_LIMITED' | 'UNAUTHORIZED' | 'INVALID_ID' | 'UNKNOWN';
  platform?: PlatformType;
  cause?: unknown;
}
```

Caller contract:
- `NOT_FOUND` → caller may fall back to alternate source
- `RATE_LIMITED` → caller should not retry without backoff (handled in RateLimiter)
- `UNAUTHORIZED` → trigger token refresh in auth service
- `NETWORK_ERROR` → caller may retry with exponential backoff
- Other → propagate

## 8. Cross-Cutting Concerns

| Concern | Location | Behavior |
|---|---|---|
| Logging | `libs/utils/logger.ts` | `Logger.debug/info/warn/error`; no-op in production |
| SFW filter | `data-source-config.ts` | Reads `allowR18Content` AsyncStorage key |
| Localization | `libs/utils/anime-localization-service.ts` | Display title from user lang prefs |
| Network status | (future) | NetInfo integration; offline mode skips network ops |
| Telemetry | (future) | OpenTelemetry-style hooks |

## 9. Module Boundaries (Don'ts)

- Repositories must NOT import from `app/` or `components/`
- Data sources must NOT depend on each other directly (use Repository for cross-source flows)
- Clients must be pure HTTP/GraphQL — no domain logic, no caching
- Components must NOT import from `libs/clients` directly — go through `repositories` or services

## 10. Migration Plan

Existing `libs/repositories/anime-repository.ts` is AniList-only. Migration steps:

1. Build new `libs/services/data-sources/` (this spec)
2. Wire new `AnimeRepository` to compose data sources
3. Keep existing static methods as facade that delegates to instance
4. Migrate UI calls one screen at a time
5. Delete old `libs/clients/anilist-client.ts` AniList-direct calls when no caller remains
