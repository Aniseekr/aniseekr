# Pilgrimage Integration Spec

## 1. Goal

Allow users browsing an anime in aniseekr to discover and view real-world
filming/inspiration locations (聖地巡礼) when the anime has Anitabi data.

## 2. Data Source: Anitabi

`https://api.anitabi.cn` is a free public API maintained by the anitabi.cn community.
No authentication required. Linked to anime by Bangumi subject ID.

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

## 9. Anitabi API Behavior Notes

- `/bangumi/{id}/lite` returns 404 if anime has no pilgrimage entries → map to `null`,
  not an error.
- `litePoints` has at most ~10 entries; full set is in `/points/detail`.
- `geo` is sometimes `[0, 0]` for old/incomplete entries → treat as missing.
- `image` URLs are absolute and from `https://image.anitabi.cn`. They're CDN-cached
  but slow on first load.
- `cover` URLs may use `https://image.anitabi.cn/posters/...` — use `expo-image` with
  `placeholder` for graceful degradation.

## 10. Test Coverage

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

## 11. Future Extensions (out of MVP scope)

- Embedded `react-native-maps` view
- "Nearby" mode using `expo-location` to compute distances
- User check-ins to spots (gamification)
- Photo capture at location with EXIF geo verification
- Itinerary builder spanning multiple anime/spots
