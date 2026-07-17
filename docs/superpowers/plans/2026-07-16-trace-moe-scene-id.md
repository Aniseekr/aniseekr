# trace.moe scene identification for pilgrimage

## Goal

Help a user move from an anime screenshot to the correct anime and the most
specific real-world pilgrimage location supported by real data.

P0 is complete only when scene identification is connected to the existing
Anitabi flow. It is not a standalone image-search demo.

## Confirmed scope

### P0

- Pick one local image and explicitly upload a resized copy to trace.moe.
- Identify the AniList anime, episode, and timestamp when trace.moe returns a
  trustworthy result.
- Resolve AniList -> Bangumi using the existing cross-index/mapping service,
  then compare the episode/timestamp with real Anitabi points.
- Route a scene-level result to `/pilgrimage/[animeId]` and open the matching
  SpotSheet once through a `focusSpotId` route param.
- Show episode-level candidate spots when more than one real Anitabi point is
  plausible. Never invent a single best location without timestamp evidence.
- Route work-level results to the anime's pilgrimage page and no-pilgrimage
  results to the AniList-backed `/anime/[id]` screen.
- Add an action to the existing SpotSheet:
  - when `ep > 0 && s > 0`, use Anitabi metadata directly and do not call
    trace.moe;
  - when episode or timestamp metadata is missing, let the user explicitly run
    the same identification flow against the Anitabi image.
- Add a versioned first-use disclosure and update the in-app privacy policy to
  state that only the explicitly selected/resolved image copy is sent directly
  to trace.moe.
- Add a dedicated trace.moe channel to the existing shared RateLimiter.

### Deferred P1

- Multi-select import, persistent jobs, pause/resume, and grouped screenshot
  albums.
- Durable thumbnails and SQLite records for imported assets.
- Background or whole-library scanning. This remains prohibited unless the
  provider/quota architecture changes.

P0 types must not block P1, but P0 does not add speculative queue/database
tables.

## External constraints

- `POST https://api.trace.moe/search?cutBorders&anilistInfo` accepts an image
  multipart field and returns multiple results.
- `episode` is not reliably numeric; it can be a number, string, array, or
  null. Only one unambiguous positive numeric episode may enter episode/scene
  matching.
- `at` is optional in the schema. If absent, the midpoint of finite `from` and
  `to` values is real derived evidence and may be used.
- Similarity below `0.9` is treated as no match.
- HTTP 402 conflates search quota and concurrency. It must be presented as a
  shared service limit, not as proof that this user consumed a personal daily
  quota.
- Carrier NAT and shared Wi-Fi can cause multiple users to share an IP quota.
- trace.moe preview image/video URLs are ephemeral and are never persisted.

## P0 architecture

### `libs/services/pilgrimage/scene-id/trace-moe-client.ts`

- Owns HTTP, response validation, timeout, and status mapping.
- Uses the existing RateLimiter `traceMoe` channel before every search.
- Uses a 1,000 ms minimum interval. The client request queue holds until each
  response completes, providing one in-flight request per app process while
  staying below 100 requests/minute.
- On 429, registers `Retry-After` (or 60 seconds) as a cooldown and returns a
  rate-limited result without automatic retry.
- On 402, returns `service-limited`; no automatic retry.
- Returns a discriminated union: `matched`, `no-match`, `service-limited`,
  `rate-limited`, `invalid-image`, `cancelled`, or `error`.
- Validates unknown JSON instead of casting the provider response.

### `libs/services/pilgrimage/scene-id/scene-image.ts`

- Local picker returns a typed cancelled/denied/ok union.
- Remote Anitabi fallback first normalizes/downloads the image into cache.
- ImageManipulator resizes to a maximum width of 640 while preserving aspect
  ratio and writes a compressed JPEG cache file for upload.
- Temporary upload files are deleted best-effort after the request.

### `libs/services/pilgrimage/scene-id/scene-id-service.ts`

- Orchestrates trace result -> Bangumi mapping -> Anitabi detail points.
- Accepts dependencies for tests; UI never calls trace.moe directly.
- For Anitabi fallback, known Bangumi identity remains authoritative. If a
  trace result maps to another Bangumi work, return no match instead of
  silently switching anime.
- Match ladder:
  - `scene`: numeric episode matches and `abs(point.s - at) <= 15`, with all
    candidates sorted by timestamp delta;
  - `episode`: numeric episode matches but no point is inside the time window;
  - `anime`: Bangumi work has pilgrimage data but no episode match;
  - `identified`: anime identified but no Bangumi/Anitabi pilgrimage data.
- Points with `ep <= 0` or `s <= 0` do not participate in scene matching.
- The UI labels scene candidates as timestamp matches, not guaranteed exact
  locations.

### Navigation

- Extend `buildPilgrimageDetailRoute` with optional `focusSpotId`.
- The detail screen consumes `bangumiId:focusSpotId` once after points are
  available, calls `openSpot`, then never reopens it after the user closes the
  sheet during that mount.
- Scene and episode candidates link through the route builder with chrome seed
  data; anime-only links omit `focusSpotId`.
- No-pilgrimage matches call the existing AniList `/anime/[id]` route with
  provider title/image seeds.

### UI

- Add `app/(tabs)/pilgrimage/identify.tsx` as the actual tool screen: idle,
  processing, result, and explicit error/limited states.
- Add a compact identify entry in the hub Explore section; do not add a fifth
  header icon.
- Use `ThemedButton`, `ThemedIconButton`, `ThemedText`, theme tokens, and i18n.
- Show the selected image, source attribution, similarity, episode/time, and
  only actions backed by available data.
- The SpotSheet scene action is available on each Anitabi screenshot. Complete
  `ep`/`s` metadata opens the exact result without trace; only incomplete
  metadata exposes the explicit trace fallback.

## Privacy

- Store only a versioned disclosure acknowledgement in MMKV for P0.
- The disclosure states that a resized copy is sent directly from the device
  to trace.moe, identifies trace.moe as a third party, and offers cancel.
- Update `settings.privacyScreen.section.camera` and `thirdParty`; the current
  unconditional "We do not upload photos" statement would otherwise be false.
- Do not log image URIs, response preview URLs, or provider payloads.

## Spec and TDD cases

Add `pilgrimage_spec.md` scene-identification sections and cases beginning at
`PILG-029`, then update both spec CSV files.

- `PILG-029`: trace decoder accepts valid results, normalizes numeric episode,
  and rejects similarity below 0.9.
- `PILG-030`: trace client uses the traceMoe limiter and maps 402/429 without
  automatic retries; 429 registers cooldown.
- `PILG-031`: scene service resolves AniList -> Bangumi and returns sorted
  timestamp candidates inside the 15 second window.
- `PILG-032`: ambiguous/non-numeric episodes cannot produce episode/scene
  matches and fall back honestly.
- `PILG-033`: missing pilgrimage data still returns an identified anime result.
- `PILG-034`: Anitabi known metadata bypasses trace while incomplete metadata
  requires explicit identification and rejects cross-anime results.
- `PILG-035`: pilgrimage route round-trips `focusSpotId`; route focus is
  consumed once.
- `PILG-036`: upload resize policy caps width without upscaling and temporary
  cleanup continues after an individual delete failure.
- `PILG-037`: first-use disclosure acknowledgement persists under a versioned
  local key.
- `PILG-038`: same-episode points outside the scene window remain actionable
  episode candidates.

Work vertically: one failing behavioral test, minimum implementation, green,
then the next case.

## Verification

- Focused scene-id and navigation tests after each vertical slice.
- `bun run typecheck && bun run lint && bun run test:unit && bun run spec:check`
- Manual device checks: local high-confidence match, low-confidence result,
  402, 429, cancelled picker, AniList-only result, exact SpotSheet deep link,
  known Anitabi metadata bypass, and missing-metadata fallback.
- Run code-review on the final diff and fix all correctness findings before
  completion.
