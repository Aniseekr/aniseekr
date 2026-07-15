# API Contracts (Per Provider)

All contracts mirror iOS aniseeker behavior. Endpoints, headers, query params, and response
shapes match the Swift implementation. Mapping rules produce identical `UnifiedAnimeItem` data.

## Common Headers

```
User-Agent: Aniseekr/1.0 (https://github.com/Aniseekr)
Accept: application/json
```

Per-platform additions noted below.

## Status Code Handling

| Code | Mapped To |
|---|---|
| 200, 201 | success |
| 304 | success (use cached) |
| 401, 403 | `DataSourceError(UNAUTHORIZED)` |
| 404 | `DataSourceError(NOT_FOUND)` |
| 429 | `DataSourceError(RATE_LIMITED)` + register cooldown using `Retry-After` header |
| 5xx | `DataSourceError(SERVER_ERROR)` |
| network failure | `DataSourceError(NETWORK_ERROR)` |
| JSON.parse failure | `DataSourceError(DECODING_ERROR)` |

## 1. AniList (GraphQL)

| Property | Value |
|---|---|
| Base URL | `https://graphql.anilist.co` |
| Method | POST |
| Auth | `Authorization: Bearer <token>` (optional; public reads work without) |
| Content-Type | `application/json` |
| Rate Limit | ~90 req/min (degraded). Use rate-limiter `aniList` channel: 666ms min interval. |

### Queries

**MediaSearch** (search):
```graphql
query ($search: String, $page: Int, $perPage: Int = 20, $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME, isAdult: $isAdult) {
      ...MediaFields
    }
  }
}
```

**MediaById** (detail):
```graphql
query ($id: Int, $idMal: Int) {
  Media(id: $id, idMal: $idMal, type: ANIME) {
    ...MediaFields
    staff { ... }
    relations { ... }
    streamingEpisodes { ... }
  }
}
```

**SeasonalAnime**:
```graphql
query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int = 20) {
  Page(page: $page, perPage: $perPage) {
    media(season: $season, seasonYear: $year, type: ANIME, sort: POPULARITY_DESC) {
      ...MediaFields
    }
  }
}
```

**TopAnime**:
```graphql
query ($page: Int, $perPage: Int = 20) {
  Page(page: $page, perPage: $perPage) {
    media(type: ANIME, sort: SCORE_DESC) { ...MediaFields }
  }
}
```

**ByGenre**: same as MediaSearch with `genre_in: [String]`.

**Genres**: `query { GenreCollection }` → `string[]` mapped to `AnimeGenre` with synthetic `id = index + 1000`.

### Cross-platform ID resolution
- Caller passes `id` (numeric) and optional `sourcePlatform`.
- If `sourcePlatform == 'myanimelist'`: query with `idMal`.
- If `sourcePlatform == 'anilist'` or null: query with `id`.
- Other platforms: `idMappingService.translate(id, from, 'anilist')` first.
- On NOT_FOUND with `id`: retry once with `idMal`.

### Field mapping: `Media` → `UnifiedAnimeItem`

| AniList field | UnifiedAnimeItem field |
|---|---|
| `id` | `platformData.anilist.id` |
| `idMal` | `idMal` |
| `title.english` | `titleEnglish` |
| `title.romaji` | `titleRomaji`; also `title` if no Bangumi/MAL precedence |
| `title.native` | `titleJapanese` |
| `synonyms[]` | `synonyms` |
| `description` | `synopsis` (strip `<...>` HTML) |
| `format` | `format` |
| `coverImage.extraLarge` | `extraLargeImageURL` + `platformImages.anilist.extraLarge` |
| `coverImage.large` | `coverImageURL` + `platformImages.anilist.large` |
| `bannerImage` | `bannerImageURL` + `platformImages.anilist.banner` |
| `averageScore` (0-100) | `anilistScore` (raw, 0-100) |
| `episodes` | `totalEpisodes` |
| `seasonYear` | `year` |
| `season` | `season` (UPPERCASE) |
| `startDate.{year,month,day}` | `startDate` (Date) |
| `genres[]` | `genres` |
| `tags[].name` | `tags` (filtered by `isMediaSpoiler == false`) |
| `studios.nodes[].name` | `studios` |
| `nextAiringEpisode.airingAt` | (transient, not stored on UnifiedAnimeItem) |

---

## 2. MAL via Jikan (REST)

| Property | Value |
|---|---|
| Base URL | `https://api.jikan.moe/v4` |
| Auth | None |
| Rate Limit | 3 req/sec, 60 req/min. Channel: `jikan`. Min interval 350ms. |
| Quirks | 429 → exponential backoff (max 3 retries: 1s, 2s, 4s). SFW filter via `?sfw` query param. |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Detail | GET | `/anime/{id}` |
| Search | GET | `/anime?q={q}&page={p}&sfw` |
| Top | GET | `/top/anime?page={p}` |
| Seasonal current | GET | `/seasons/now?page={p}` |
| Seasonal explicit | GET | `/seasons/{year}/{season}?page={p}` |
| By genre | GET | `/anime?genres={id}&page={p}` |
| Genres | GET | `/genres/anime` |
| Staff | GET | `/anime/{id}/staff` |
| Characters | GET | `/anime/{id}/characters` |
| Relations | GET | `/anime/{id}/relations` |
| Streaming | GET | `/anime/{id}/streaming` |
| Themes | GET | `/anime/{id}/themes` |
| Statistics | GET | `/anime/{id}/statistics` |

### Field mapping

| Jikan field | UnifiedAnimeItem field |
|---|---|
| `mal_id` | `idMal`, `platformData.myanimelist.id` |
| `title` (default) | `title` if no higher-priority source |
| `title_english` | `titleEnglish` |
| `title_japanese` | `titleJapanese` |
| `title_synonyms[]` | `synonyms` |
| `synopsis` | `synopsis` |
| `type` | `format` |
| `images.jpg.large_image_url` | `coverImageURL`, `platformImages.myanimelist.large` |
| `images.webp.large_image_url` | `platformImages.myanimelist.large` (preferred) |
| `score` (0-10) | `malScore` |
| `episodes` | `totalEpisodes` |
| `year` | `year` |
| `season` (lowercase) | `season` (UPPERCASE) |
| `aired.from` | `startDate` |
| `genres[].name` | `genres` |
| `themes[].name` + `demographics[].name` | `tags` (deduplicated) |
| `studios[].name` | `studios` |
| `broadcast.day` | `broadcastDay` (e.g., "Mondays") |

---

## 3. Bangumi (REST v0)

| Property | Value |
|---|---|
| Base URL | `https://api.bgm.tv/v0` |
| Search base | `https://api.bgm.tv` (legacy `/search/subject`) |
| Auth | `Authorization: Bearer <token>` (optional; required for write only) |
| User-Agent | **Required**: `Aniseekr/1.0 (https://github.com/Aniseekr)` |
| Rate Limit | Channel `bangumi`: 333ms (3 req/s). Honor `Retry-After`. |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Detail | GET | `/v0/subjects/{id}` |
| Calendar (broadcast) | GET | `/calendar` |
| Search | POST | `/v0/search/subjects` body: `{ keyword, sort: "match", filter: { type: [2] } }` |
| Search (legacy) | GET | `/search/subject/{q}?type=2&responseGroup=small` |

### Delegation
- `searchAnime` (when not querying Bangumi exclusively): delegate to AniList, then enrich with `titleChinese` via `/v0/search/subjects` post-filter.
- `fetchTopAnime`, `fetchSeasonalAnime`: delegate to AniList (Bangumi has no native endpoints), then enrich.
- `fetchAnimeDetail`: native `/v0/subjects/{id}` (preferred for Chinese title).

### Field mapping

| Bangumi field | UnifiedAnimeItem field |
|---|---|
| `id` | `platformData.bangumi.id` |
| `name` (Japanese) | `titleJapanese`; also `title` (Bangumi has highest priority) |
| `name_cn` | `titleChinese`; also `title` if non-empty |
| `summary` | `synopsis` |
| `images.large` (HTTP→HTTPS normalize) | `coverImageURL`, `platformImages.bangumi.large` |
| `images.common` | `platformImages.bangumi.large` (fallback) |
| `rating.score` (0-10) | `bangumiScore` |
| `eps` or `total_episodes` | `totalEpisodes` |
| `date` | `startDate`, `year` |
| `tags[].name` | `tags` |
| (no genre data) | merge from AniList enrichment |

### Image URL normalization
All `bgm.tv` image URLs starting with `http://` MUST be rewritten to `https://` (ATS).

---

## 4. Annict (REST v1 + GraphQL)

| Property | Value |
|---|---|
| Base URL | `https://api.annict.com/v1` |
| Auth | `Authorization: Bearer <token>`; client_credentials flow at `/oauth/token` |
| Token cache | In-memory; refresh when expired |
| Rate Limit | Channel `annict`: 500ms |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Search/list | GET | `/v1/works?filter_title={q}&per_page=20&page={p}` |
| Detail | GET | `/v1/works?filter_ids={id}` (no dedicated detail endpoint) |
| Token | POST | `/oauth/token` (grant_type=client_credentials) |

### Image fallback
Annict cover images are often missing or low-quality. When `image.recommended_url` and
`image.facebook_og_image_url` are both empty:
1. Look up `mal_anime_id` field
2. Batch-call AniList `Media(idMal: $idMal)` to fetch `coverImage.large`
3. Cache batched results

### Field mapping

| Annict field | UnifiedAnimeItem field |
|---|---|
| `id` | `platformData.annict.id` |
| `title` | `titleJapanese`, `title` (fallback) |
| `title_kana` | (not stored) |
| `title_en` | `titleEnglish` |
| `media_text` | `format` (TV, OVA, etc.) |
| `image.recommended_url` | `coverImageURL`, `platformImages.annict.large` |
| `season_year` | `year` |
| `season_name_text` | `season` |
| `mal_anime_id` | `idMal` |

---

## 5. Kitsu (JSON:API)

| Property | Value |
|---|---|
| Base URL | `https://kitsu.io/api/edge` |
| Auth | None for read; OAuth2 password for write |
| Accept | `application/vnd.api+json` |
| Content-Type | `application/vnd.api+json` (write only) |
| Rate Limit | Channel `kitsu`: 333ms |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Detail | GET | `/anime/{id}` |
| Search | GET | `/anime?filter[text]={q}&page[limit]=20&page[offset]={offset}` |
| Top | GET | `/anime?sort=-averageRating&page[limit]=20&page[offset]={offset}` |
| Seasonal | GET | `/anime?filter[season]={season}&filter[seasonYear]={year}&page[limit]=20` |
| By genre (id) | GET | `/anime?filter[categories]={category-slug}` |

### Pagination
`offset = (page - 1) * 20`. Hard limit `page[limit]=20`.

### Field mapping

| Kitsu field | UnifiedAnimeItem field |
|---|---|
| `id` | `platformData.kitsu.id` |
| `attributes.canonicalTitle` | `title` (fallback) |
| `attributes.titles.en` or `en_us` or `en_jp` | `titleEnglish` |
| `attributes.titles.ja_jp` | `titleJapanese` |
| `attributes.synopsis` | `synopsis` |
| `attributes.subtype` | `format` |
| `attributes.posterImage.large` | `coverImageURL`, `platformImages.kitsu.large` |
| `attributes.posterImage.original` | `extraLargeImageURL` |
| `attributes.coverImage.large` | `bannerImageURL`, `platformImages.kitsu.banner` |
| `attributes.averageRating` (0-100 string) | `anilistScore` (parsed; no separate `kitsuScore`) |
| `attributes.episodeCount` | `totalEpisodes` |
| `attributes.startDate` | `startDate`, `year` |

---

## 6. Shikimori (REST)

| Property | Value |
|---|---|
| Base URL | `https://shikimori.one/api` |
| Auth | OAuth2 (optional for read) |
| User-Agent | **Required**: `Aniseekr/1.0` |
| Rate Limit | Channel `shikimori`: 200ms (5 req/s public limit) |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Detail | GET | `/animes/{id}` |
| Search | GET | `/animes?search={q}&page={p}&limit=20` |
| Top | GET | `/animes?order=ranked&limit=20&page={p}` |
| Seasonal | GET | `/animes?season={year}_{season}&limit=20` |

### Image base
Image URLs are relative (`/uploads/preview/animes/...`). Prefix with `https://shikimori.one`.

### Field mapping

| Shikimori field | UnifiedAnimeItem field |
|---|---|
| `id` | `platformData.shikimori.id` |
| `name` (Romaji) | `titleRomaji`, `title` (fallback) |
| `russian` | `titleRussian` |
| `english` (array, take first) | `titleEnglish` |
| `japanese` (array, take first) | `titleJapanese` |
| `synonyms` | `synonyms` |
| `description` (HTML) | `synopsis` (strip BB-code/HTML) |
| `kind` (tv, ova, movie, etc.) | `format` (uppercase) |
| `image.original` (relative) | `coverImageURL`, `platformImages.shikimori.large` (with base) |
| `score` (0-10 string) | (no shikimori_score field; parse and store as `anilistScore` when AniList absent) |
| `episodes` | `totalEpisodes` |
| `aired_on` | `startDate`, `year` |
| `genres[].name` | `genres` |

---

## 7. Simkl (REST)

| Property | Value |
|---|---|
| Base URL | `https://api.simkl.com` |
| Auth | `simkl-api-key: <key>` header (required for ALL requests) |
| Rate Limit | Channel `simkl`: 500ms |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Detail | GET | `/anime/{id}?extended=full&client_id={key}` |
| Search | GET | `/search/anime?q={q}&limit=20&extended=full&client_id={key}` |
| Top | GET | `/anime/best/{year}?limit=20&extended=full&client_id={key}` |
| Seasonal/premieres | GET | `/anime/premieres?limit=20&extended=full&client_id={key}` |

### Field mapping

| Simkl field | UnifiedAnimeItem field |
|---|---|
| `ids.simkl` | `platformData.simkl.id` |
| `ids.mal` | `idMal` |
| `ids.anilist` | `platformData.anilist.id` (cross-link) |
| `title` | `titleEnglish`, `title` (fallback) |
| `en_title` | `titleEnglish` |
| `overview` | `synopsis` |
| `anime_type` | `format` |
| `poster` (Simkl CDN path) | `coverImageURL` |
| `fanart` | `bannerImageURL` |
| `ratings.simkl.rating` | (no simkl_score; ignore) |
| `ratings.mal.rating` | `malScore` (cross-link) |
| `total_episodes` | `totalEpisodes` |
| `year` | `year` |
| `aired_at` | `startDate` |
| `genres[]` | `genres` |

### Image URL construction
Posters returned as path fragments like `12/12345_w.jpg`. Prefix:
```
https://wsrv.nl/?url=https://simkl.in/posters/{path}
```

---

## 8. Anitabi (Pilgrimage)

See `pilgrimage_spec.md` for full details.

| Property | Value |
|---|---|
| Primary base URL | `https://api.anitabi.cn` |
| HTTP 403 fallback | `https://www.anitabi.cn/d` |
| Auth | None |

### Endpoints

| Purpose | Method | Path |
|---|---|---|
| Lite | GET | `/bangumi/{bangumiId}/lite` |
| Full points | GET | `/bangumi/{bangumiId}/points` |
| Point attribution | GET | `/bangumi/{bangumiId}/points/detail?haveImage=true` |
| 403 fallback catalog | GET | `https://www.anitabi.cn/d/g.json` |
| 403 fallback point page | GET | `https://www.anitabi.cn/d/g{page}.json` |
| Search bangumi | GET | (uses Bangumi search, not Anitabi) |

---

## 9. Rate Limiter Channels

```ts
const CHANNELS = {
  anilist:    { minIntervalMs: 666 },  // ~90 req/min
  jikan:      { minIntervalMs: 350 },  // 3 req/s
  bangumi:    { minIntervalMs: 333 },
  annict:     { minIntervalMs: 500 },
  kitsu:      { minIntervalMs: 333 },
  shikimori:  { minIntervalMs: 200 },
  simkl:      { minIntervalMs: 500 },
  anitabi:    { minIntervalMs: 200 },
} as const;
```

`waitForAvailability(channel)` waits at least `minIntervalMs` since last request on that channel.
`registerCooldown(channel, ms)` extends availability (Retry-After response).
`registerCooldown` keeps the longer cooldown when called twice (no shrinking).
