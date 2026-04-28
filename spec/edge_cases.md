# Edge Cases

Boundary, null, and error conditions every implementation must handle correctly.

## UnifiedAnimeItem

- **Empty title** → constructor accepts but `title` is required string. Use `'Unknown'` only as last resort in `merge()`.
- **All scores null** → `normalizedScore` returns `null`. Don't return 0 (changes UI semantics).
- **Negative score** → defensive: clamp at 0 in mappers. Don't pass negatives through.
- **AniList score = 10.0** → `normalizedScore` returns 10.0 (the > 10 check uses strict `>` not `>=`).
- **AniList score = 0** → `normalizedScore` returns 0 (legitimate).
- **All platformImages empty** → `bestImage(...)` falls through to `coverImageURL`/`extraLargeImageURL`/`bannerImageURL` per type.
- **Cover URL is invalid string** → store as `string` not `URL` in TS port; let component swallow.
- **Synonyms array contains empty string** → keep as-is (don't filter; preserves source data fidelity).
- **`titleChinese` with traditional characters already** → conversion is idempotent.
- **`merge([])`** → return `null`, not throw.
- **`merge([single])`** → returns single item's data wrapped as `UnifiedAnimeItem`.

## Data Sources

- **Provider returns 200 but body is empty array** → return `[]`, do not throw.
- **Provider returns 200 with malformed JSON** → throw `DataSourceError(DECODING_ERROR)`.
- **Network timeout** (default 30s) → throw `DataSourceError(NETWORK_ERROR)`.
- **DNS failure** → throw `DataSourceError(NETWORK_ERROR)`.
- **HTTP 5xx** → throw `DataSourceError(SERVER_ERROR)`. Caller may retry.
- **HTTP 429 with no `Retry-After`** → register default 60s cooldown.
- **HTTP 429 with `Retry-After: <seconds>`** → register cooldown for that many seconds.
- **HTTP 429 with `Retry-After: <HTTP-date>`** → parse and register cooldown until that time.
- **HTTP 401 with valid token** → token may be expired server-side; throw UNAUTHORIZED, let auth service refresh.

## AniList Specific

- **Both `id` and `idMal` present in query variables** → `id` takes precedence per AniList docs.
- **Genre collection contains duplicates** → de-dup before mapping (sometimes happens during AniList migrations).
- **`description` contains `<br>`, `<i>`, `<b>` etc.** → strip all HTML tags via `.replace(/<[^>]*>/g, '')`.
- **`description` is `null`** → set `synopsis = ''` (empty string), not undefined, to keep the field shape stable.
- **`tags` array missing** → default to `[]`.
- **`isMediaSpoiler == true`** → exclude that tag.
- **`isAdult == true`** AND user has SFW filter on → exclude entire item from results.

## Jikan Specific

- **`mal_id == 0`** → invalid; throw `DataSourceError(INVALID_ID)`.
- **404 on detail** → may indicate anime delisted from MAL → propagate NOT_FOUND.
- **`year` field is `null` and `aired.from` is also null** → `year` field on UnifiedAnimeItem stays `null`.
- **`broadcast.day == "Unknown"`** → store as `null`, not the string "Unknown".
- **`images.webp.large_image_url` is the placeholder MAL "no image" URL** → treat as missing, fall back to jpg.
- **Multiple parallel 429s** → backoff applies to channel, not individual request — second request inherits cooldown.

## Bangumi Specific

- **`name_cn` is empty string** → use `name` (Japanese) for `titleChinese` only if explicit. Don't auto-promote Japanese to Chinese.
- **Image URL is `https://lain.bgm.tv/...`** (legacy CDN) → keep, do not rewrite domain.
- **Image URL is data URI** → pass through unchanged.
- **Subject type `2` is anime; type `1` is book; type `3` is music; type `6` is real**. Filter searches to type 2 only.
- **`/v0/subjects/{id}` returns subject of non-anime type** → throw `DataSourceError(INVALID_ID)`.

## Annict Specific

- **OAuth `client_credentials` token expires every 24h** → cache with `expiresAt - 60s` safety margin.
- **`mal_anime_id == 0`** → cannot fall back to AniList; use Annict's own image even if low-quality.
- **No detail endpoint** → `fetchAnimeDetail(id)` calls `/v1/works?filter_ids={id}` and returns first result; if empty array → NOT_FOUND.

## Kitsu Specific

- **`attributes.titles.en_jp`** preferred for romaji English title over `attributes.titles.en` (which is sometimes blank).
- **`averageRating` is a string** like `"82.4"` → parse to number; if `NaN` → null.
- **Pagination beyond 500 items** → JSON:API rejects; clamp `page` so offset never exceeds 500.

## Shikimori Specific

- **`russian` is empty** → `titleRussian = null`.
- **`description` contains BBCode (`[b]`, `[url=...]`)** → strip with regex `/\[\/?[^\]]*\]/g` in addition to HTML strip.
- **`image.original` is the placeholder** (path contains `/missing/`) → treat as missing.
- **`score == "0"` string** → parse to 0; if `NaN` → null.

## Simkl Specific

- **Missing `simkl-api-key` header** → returns 401 immediately.
- **`/anime/best/{year}` for current year before season starts** → may return empty; fall back to previous year.
- **`poster` field absent** → use `fanart` if present, else null.
- **`ids.imdb` field present but no `ids.mal`** → still capture `imdb` ID for future cross-link.

## Anitabi (Pilgrimage)

- **404 on `/bangumi/{id}/lite`** → return `null` (anime simply has no pilgrimage data; not an error).
- **`geo: [0, 0]`** → treat coordinates as missing; show but disable "Open in Maps".
- **`litePoints[].image` URL fails to load** → component shows colored placeholder, not error.
- **`pointsLength: 0`** → still render card (anime is in Anitabi but no spots yet).
- **`color` is `null` or invalid hex** → fall back to default theme color `#8B5CF6`.

## Repository

- **Browse source switched mid-flight** → in-flight `fetchSeasonalAnime` throws `CancellationError`. UI catches and re-fetches with new source.
- **All providers throw on a fetch** → propagate first error; don't return `[]`.
- **`fetchAnimeStaff` returns empty AND Jikan fallback throws** → return `[]`, don't throw (UI shows "No staff data").
- **`translateID` called with `from === to`** → return original ID, no DB lookup.

## QueryClient

- **Two parallel calls with same key, one resolves and another arrives mid-flight** → both await same Promise.
- **Fetcher throws** → in-flight entry is removed (next call retries).
- **Cache entry exactly at `staleTime` boundary** → stale (use `>=`).

## Cache Service

- **Concurrent `set()` and `get()` on same key** → reads return last-committed value.
- **`init()` called twice** → idempotent; no error.
- **Cache miss returns `undefined` vs `null`** → standardize on `null`.
- **Disk full** → swallow write errors, return cached read value.

## Rate Limiter

- **Cooldown of 0 ms** → no-op; doesn't reset existing longer cooldown.
- **Channel never used before** → initial wait is 0.
- **Concurrent waiters on same channel** → each waits for its own slot (serial release).

## ID Mapping

- **Same ID exists in two mapping rows** → return first match (deterministic order via `LIMIT 1`).
- **`bulkUpdate` of 100k entries** → wraps in transaction, doesn't OOM.
- **Mapping JSON download fails** → keep existing mappings, log warning.
- **Manual mapping conflicts with downloaded** → manual wins.

## Pilgrimage Repository

- **Anime has Bangumi platformData but no `id`** → call `idMappingService.translate(unifiedItem.id, source, 'bangumi')`.
- **AnitabiService throws (network)** → return `null`, log warning. Pilgrimage section just doesn't render.
- **SQLite write fails** → return in-memory result, log error. Cache populates next session.

## SQLite

- **Initial schema migration on existing DB** → `CREATE TABLE IF NOT EXISTS` is safe.
- **Adding `pilgrimage_spots` table to existing DB** → safe (idempotent).
- **Schema column type changed** → not in scope (no destructive migrations in v1).

## React Native Specific

- **AsyncStorage not available** (rare init race) → fall back to in-memory defaults.
- **`fetch` not available** (test env) → polyfill via `node-fetch` or `whatwg-fetch`.
- **Background task execution** → not in scope; sync runs only when app is foregrounded.
