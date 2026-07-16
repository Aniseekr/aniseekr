# Pilgrimage Integration Spec

## 1. Goal

Allow users browsing an anime in aniseekr to discover and view real-world
filming/inspiration locations (聖地巡礼) when the anime has Anitabi data.

## 2. Data Source: Anitabi

Anitabi is maintained by the anitabi.cn community and links anime by Bangumi
subject ID. JSON requests use `https://api.anitabi.cn` first. Only an explicit
HTTP 403 falls back to the same official static files as the website:

- `https://www.anitabi.cn/d/g.json` for the complete anime catalog and compact point coordinates.
- `https://www.anitabi.cn/d/g{page}.json` for per-anime point metadata.
- `https://img-tc.anitabi.cn/...` for covers and scene images (the origin used
  by Anitabi's own `www.anitabi.cn` frontend).

No authentication is required. Images use `https://img-tc.anitabi.cn/...`.
`https://www.anitabi.cn/images/...` is not an image endpoint: it returns the
website HTML shell with HTTP 200 and must never be handed to an image decoder.
The legacy `https://image.anitabi.cn/...` origin is WAF-blocked in Japan;
cached URLs from that origin are rewritten to `img-tc.anitabi.cn`.

## 3. Types

```ts
// Single scene/location point
export interface AnitabiPoint {
  id: string;       // unique within an anime, e.g., "abc123"
  cn?: string;      // Chinese name of the spot
  name: string;     // Japanese name (canonical)
  image: string;    // scene screenshot URL from the anime
  ep: number;       // episode number where this scene appears
  s: number;        // second/scene marker within the episode
  geo: [number, number]; // [latitude, longitude]
}

// Anime entry from Anitabi (the "container")
export interface AnitabiBangumi {
  id: number;             // Bangumi subject ID (THE link key)
  cn: string;             // Chinese title
  title: string;          // Japanese title (original)
  city: string;           // primary city/prefecture (e.g., "東京都")
  cover: string;          // cover image URL
  color: string;          // dominant theme color hex (e.g., "#8DC5D8")
  geo: [number, number];  // center coordinates [lat, lng]
  zoom: number;           // recommended map zoom level (8–14)
  modified: number;       // last-modified epoch
  litePoints: AnitabiPoint[]; // sample points (for cards)
  pointsLength: number;   // total spot count
  imagesLength: number;   // total scene image count
}

// Full point with extended fields (from /points/detail)
export interface AnitabiPointDetail extends AnitabiPoint {
  origin?: { lat: number; lng: number; address: string };
  zoom?: number;
  ja?: string;
  haveImage?: boolean;
}
```

## 4. Service Contract

```ts
class AnitabiService {
  static instance: AnitabiService;

  // Lite fetch: returns null if anime has no pilgrimage data
  async getAnimePilgrimage(bangumiId: number): Promise<AnitabiBangumi | null>;

  // Full points fetch (large; lazy-load on map screen)
  async getDetailedPoints(bangumiId: number): Promise<AnitabiPointDetail[]>;

  // Cache controls
  invalidate(bangumiId?: number): void;
  invalidateAll(): void;
}
```

Caching:
- In-memory: session lifetime, 100-entry LRU per method
- SQLite: table `pilgrimage_spots` keyed by `bangumi_id`, TTL 7 days

## 5. Linking Anime ↔ Pilgrimage Spots

### Primary lookup
```
unifiedAnimeItem.platformData.bangumi?.id  →  AnitabiService.getAnimePilgrimage(bangumiId)
```

### Fallback when anime lacks Bangumi ID
1. Try `idMappingService.translate(unifiedItem.id, from: source, to: 'bangumi')`
2. If still no Bangumi ID, return `null` (anime has no pilgrimage)

### Bulk enrichment
For lists (e.g., seasonal anime grid), the repository should NOT eager-fetch pilgrimage
data for every item. Instead, expose a hook `usePilgrimageBadge(bangumiId)` that fetches
on-demand when an item enters the viewport.

## 6. SQLite Schema Addition

```sql
CREATE TABLE IF NOT EXISTS pilgrimage_spots (
  bangumi_id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  title_cn TEXT,
  city TEXT,
  cover TEXT,
  color TEXT,
  center_lat REAL,
  center_lng REAL,
  zoom INTEGER,
  points_length INTEGER,
  images_length INTEGER,
  lite_points_json TEXT,  -- JSON-encoded AnitabiPoint[]
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pilg_city ON pilgrimage_spots(city);
CREATE INDEX IF NOT EXISTS idx_pilg_expires ON pilgrimage_spots(expires_at);
```

## 7. UI Components

### AnimePilgrimageCard
Ported verbatim from japanwalker. Self-contained; only depends on:
- `expo-image` for cover
- `expo-haptics` for touch feedback
- `Ionicons` from `@expo/vector-icons`
- `expo-linear-gradient`

Props:
```ts
interface AnimePilgrimageCardProps {
  anime: AnitabiBangumi;
  distance?: number; // optional km from user
  onPress?: (anime: AnitabiBangumi) => void;
}
```

Renders:
- Cover image with bottom gradient
- Top-right badge: `{pointsLength} spots`
- Top-left distance badge if provided
- Title (Japanese) + Chinese name
- City tag with location pin icon
- Grid of first 3 `litePoints[].image` thumbnails with `+N more` overlay
- Theme color from `anime.color`

Behavior:
- `onPress(anime)` → navigation to `/pilgrimage/{anime.id}`
- Haptic feedback on press
- Scale animation 1.0 → 0.98 on press

### NearbyPilgrimageBadge
Inline badge shown on `UnifiedAnimeItem` cards (search/seasonal/detail) when the
anime has pilgrimage data. Loads lazily.

Props:
```ts
interface NearbyPilgrimageBadgeProps {
  bangumiId: number;
  variant?: 'icon' | 'pill';
}
```

Renders nothing until data loaded; then shows pin icon (icon variant) or
`📍 {city}` pill.

### PilgrimageSpotList
Used on `/pilgrimage/[animeId]` route. Grid of all spots with scene image, Japanese
name, episode number, and "Open in Maps" action.

## 8. Routes

```
app/
├── pilgrimage/
│   └── [animeId].tsx     # animeId = Bangumi subject ID
```

`/pilgrimage/{bangumiId}` screen flow:
1. Hydrate `AnitabiBangumi` from cache or fetch
2. Show header (cover, title, city, points count)
3. Show "View on Map" button (deep link to native Maps with first point)
4. Render `PilgrimageSpotList`

For MVP, **no embedded map view**. Map links open native Maps app via:
```
https://maps.apple.com/?q={lat},{lng}
https://www.google.com/maps/search/?api=1&query={lat},{lng}
```

## 9. Anitabi Data Behavior Notes

- API 404 maps to `null`. API 403 alone activates the static fallback; 429,
  5xx, decoding failures, and network errors keep their normal error semantics.
- A Bangumi ID absent from fallback `g.json` also maps to `null`.
- The static catalog stores point coordinates in groups of four
  (`id, lat, lng, priority`); the matching `g{page}.json` row supplies names,
  images, episode markers, folders, and attribution links.
- `litePoints` is the first 10 displayable points; full detail retains every
  point with an image.
- `geo` is sometimes `[0, 0]` for old/incomplete entries → treat as missing.
- Relative image paths are resolved against `https://img-tc.anitabi.cn`.
  Invalid `https://www.anitabi.cn/images/...` values persisted by older builds
  and legacy `https://image.anitabi.cn/...` values are healed back to the
  official www image CDN before rendering.
- Cross-index hydration must reject a candidate with less than 80% of the
  current entry count. This prevents a partial CI fallback from replacing the
  complete bundled cross-index.

## 10. Street View Data

Spot-level street view availability is resolved lazily through a pure
TypeScript resolver before any native or UI surface renders a preview.

Resolver behavior:

- iOS first asks an injected Look Around provider whether Apple has a nearby
  scene. A positive answer returns a `lookaround` result without calling
  Mapillary.
- A negative iOS answer falls back to Mapillary. Android and other platforms
  skip Look Around and use Mapillary directly.
- Look Around availability is cached by rounded coordinate for 30 days.
- Mapillary metadata is cached by rounded coordinate for 24 hours because
  thumbnail URLs are signed and can expire.
- When no provider has data, or Mapillary is disabled by a missing token, the
  resolver returns `null` so UI can omit the whole section instead of rendering
  fake content.
- A synchronous peek (`peekStreetView`) reads the in-memory cache mirror and
  returns a definite verdict only when the cached entries fully determine the
  async chain; warm opens therefore paint on the first frame without a
  skeleton.
- Successful-but-empty Mapillary answers are cached like hits (`[]`, 24h) so
  no-coverage spots don't refire radius+bbox on every open; error answers
  (`null`) are never cached.
- When the native Look Around preview reports its scene unavailable despite a
  cached positive verdict, the verdict is overwritten to `false` and the
  resolver re-runs, falling through to Mapillary.

Mapillary behavior:

- Requests use `process.env.EXPO_PUBLIC_MAPILLARY_TOKEN`; missing token returns
  `null` without network I/O.
- Search uses a 50m radius first. If that returns no parseable images, it tries
  a bbox of ±0.0025° around the coordinate to recover from slightly offset
  Anitabi points.
- Parsed image metadata includes thumbnail URL, coordinate, compass angle,
  panorama flag, quality score, capture date, and distance from the spot.
- Images are ordered by nearest distance, then higher quality score, then
  panorama preference.
- HTTP 429, network failures, and malformed payloads return `null`.

## 11. Multi-angle Spot Grouping

`groupPointsIntoSpots` treats Anitabi folders as authoritative. For loose
points that have no folder metadata, it groups same-location cuts only when the
normalized names match and the representative coordinates are within 60m.

Loose-point name normalization folds Unicode with NFKC and strips common
multi-angle suffixes before comparison:

- `別角度`
- `別カット`
- `アングル`
- `その[0-9]+`
- trailing ASCII or full-width digits
- trailing circled numerals such as `①②③`
- trailing bracketed notes such as `（別角度）`

The 60m threshold and folder-first representative ordering are unchanged.

## 12. Screenshot Scene Identification

Scene identification is a user-triggered bridge between local screenshots,
trace.moe anime metadata, and Anitabi pilgrimage points. The UI never calls the
provider directly.

Provider behavior:

- Search requests are serialized through the shared `traceMoe` RateLimiter
  channel with a 1,000ms minimum interval.
- HTTP 402 is a shared `service-limited` state because trace.moe conflates
  quota and concurrency. HTTP 429 registers `Retry-After` (60 seconds when
  absent) and returns `rate-limited`. Neither status retries automatically.
- Only the highest-similarity valid result is considered. Similarity below 0.9
  is `no-match`.
- `episode` may be a number, string, array, or null. Episode/scene matching
  requires one unambiguous positive numeric episode.
- A finite `at` timestamp is preferred. When absent, the midpoint of finite
  `from` and `to` values is used.
- Preview URLs are transient display data. They may be carried in memory or as
  route chrome seeds, but are never written to app storage or the database.

Before upload, the selected image is re-encoded as JPEG and images wider than
640px are downscaled without upscaling smaller images. Temporary upload files
are deleted best-effort. The first trace search requires a versioned local
disclosure acknowledgement; accepting it is the only persisted scene-ID state.

Anitabi match ladder:

- `scene`: episode matches and one or more points with real timestamps are
  within 15 seconds. Candidates are sorted by absolute timestamp delta.
- `episode`: episode matches real points but no timestamp is within 15 seconds.
- `anime`: the mapped work has pilgrimage data but no episode match.
- `identified`: trace.moe identified an anime but no mapped pilgrimage work is
  available.

Points with `ep <= 0` or `s <= 0` cannot participate in scene matching. An
existing Anitabi point with both values uses that metadata directly and does
not spend a trace.moe request. An incomplete point may be explicitly searched,
but its known Bangumi identity remains authoritative; a result mapped to a
different work is rejected.

Navigation carries an optional `focusSpotId` into `/pilgrimage/[animeId]`. The
detail route consumes a focus once after points are available and must not
reopen the sheet after the user closes it during that mount.

## 13. Test Coverage

- PILG-001: `AnitabiService.getAnimePilgrimage` returns `null` on 404
- PILG-002: Caches fetched result in memory (second call no HTTP)
- PILG-003: Persists to SQLite; reads from SQLite on cold start
- PILG-004: Expires after 7 days
- PILG-005: `AnimePilgrimageCard` renders all required fields
- PILG-006: `AnimePilgrimageCard` shows distance badge only when prop provided
- PILG-007: `AnimePilgrimageCard` `onPress` callback invoked with full `anime` object
- PILG-008: `AnimePilgrimageCard` calls haptic feedback on press
- PILG-009: `NearbyPilgrimageBadge` renders nothing until loaded
- PILG-010: `NearbyPilgrimageBadge` swallows fetch errors (no UI break)
- PILG-011: Pilgrimage repository falls back to ID mapping when bangumi ID absent
- PILG-012: SQLite schema migration is idempotent
- PILG-013 (E2E): Anime detail with `bangumi.id` → pilgrimage screen → spot list visible
- PILG-014: Official static catalog and page payloads decode into complete anime and point data
- PILG-015: A degraded runtime index cannot replace the bundled index
- PILG-016: Search folds Traditional/Simplified Chinese and reads official English titles
- PILG-017: Image URLs stay on the image CDN and invalid website-image cache values self-heal
- PILG-018: JSON uses the API first and requests official website data only after HTTP 403
- PILG-019: Bangumi fallback always unions with local index hits instead of being suppressed
- PILG-020: Street view resolver uses iOS Look Around first and Mapillary fallback
- PILG-021: Mapillary token missing silently disables street view metadata
- PILG-022: Street view resolver caches Look Around availability by coordinate
- PILG-023: Mapillary client falls back from 50m radius to bbox and orders parsed images
- PILG-024: Mapillary HTTP/rate-limit/network/decoding failures return `null`
- PILG-025: Loose Anitabi scene cuts with angle suffixes merge when within 60m
- PILG-026: Warm street view cache resolves synchronously so warm opens skip the skeleton
- PILG-027: Successful empty Mapillary answers are cached; errors are not
- PILG-028: Look Around scene-unavailable corrects the cached verdict and re-resolves to Mapillary
- PILG-029: trace.moe results are safely decoded and low-similarity results are rejected
- PILG-030: trace.moe requests are serialized and map 402/429 without automatic retry
- PILG-031: AniList results resolve to sorted Anitabi timestamp candidates
- PILG-032: ambiguous/non-numeric episodes cannot produce episode or scene matches
- PILG-033: an identified anime remains actionable without pilgrimage data
- PILG-034: complete Anitabi metadata bypasses trace and fallback rejects cross-anime results
- PILG-035: `focusSpotId` round-trips and is consumed once
- PILG-036: upload resize policy caps width and temporary cleanup continues after errors
- PILG-037: first-use disclosure acknowledgement persists under a versioned key
- PILG-038: same-episode points outside the scene window remain episode candidates

## 14. Future Extensions (out of MVP scope)

- Embedded `react-native-maps` view
- "Nearby" mode using `expo-location` to compute distances
- User check-ins to spots (gamification)
- Photo capture at location with EXIF geo verification
- Itinerary builder spanning multiple anime/spots
