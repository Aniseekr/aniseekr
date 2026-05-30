# Pilgrimage Map — Native + Switchable Engine (Design)

- **Date:** 2026-05-30
- **Status:** Draft — awaiting user review
- **Owner:** kidneyweakx
- **Scope:** `app/(tabs)/pilgrimage/*`, `components/pilgrimage/*`, `libs/services/pilgrimage/*`
- **Supersedes:** the 2026-05-29 "stay on Leaflet + shared pre-warmed WebView host" direction (memory `pilgrimage-map-perf-direction`). Cold-start is now solved by going **native**, not by pre-warming a WebView. See [Decisions](#decisions).

---

## 1. Context & problem

The pilgrimage map is **Leaflet-in-WebView, hardcoded across three surfaces**, with **zero provider abstraction**:

| Surface | File | Role |
|---|---|---|
| Hub map | `app/(tabs)/pilgrimage/map.tsx` (~1819 LOC) | Full-screen browse: anime balloons, Tourism-88 pins, region filters, search, sheet, locate FAB |
| Reusable map | `components/pilgrimage/PilgrimageMapView.tsx` (~695 LOC) | Detail/album/plan: anime markers, cluster picker, popups |
| Spot detail | `components/pilgrimage/detail/SpotMapView.tsx` (~741 LOC) + `SpotMapViewHandle` | On-location scene map: bubble/dot markers, visited flips, heading cone, offline-only mode |

Shared infra: `libs/services/pilgrimage/leaflet-map.ts` (~922 LOC) builds the HTML, exposes the bridge (`__updateMarkers`, `__updateVisited`, `__updateUser`, `__updateHeading`, `__recenter`, `__focusSpot`, `__flyToBounds`, `__setTileStyle`, `__setOfflineOnly`, `clusterPress`/`userPanned`/`bounds` messages) and the offline tile cache (`CachedTileLayer` → Cache API `osm-tiles-v2` + IndexedDB `osm-tile-index`, LRU at ~1000 tiles / ~25 MB, stable origin `https://aniseekr.local/`, CARTO Voyager/Dark-Matter tiles). `leaflet-assets.ts` is a ~202 KB auto-generated inline of Leaflet + markercluster.

### Root cause of slow cold-start

Each of the three surfaces mounts its **own** WebView and **cold-parses ~200 KB of inlined Leaflet JS/CSS** on every open (the stable origin caches *tiles*, not the inline script). Secondary costs: ~160 KB of four `*.data.json` eager-parsed at import (~50 ms); `map.tsx` root holds ~11 `useState` (violates CLAUDE.md Rule 9) so search/GPS ticks fan out into marker recompute; the hub does a full `replace` redraw on every filter/search.

### Why Leaflet was chosen (the constraint we must preserve)

The **self-built offline tile cache** — pilgrimage happens on-location in Japan, often with poor signal. This is the *only* reason Leaflet-WebView was kept on 2026-05-29.

### Why "go native Apple Maps" alone doesn't work

- **No in-app offline.** MapKit (`react-native-maps`/`expo-maps`) exposes **no** programmatic offline-region API to third-party apps; iOS 17 offline maps live only in Apple's own Maps app. Google Maps SDK is the same.
- **No custom tile style.** `react-native-maps` custom tiles (`UrlTile`) work only on the **Google** provider; the **Apple** provider won't render the CARTO look.
- **iOS only**, and weak custom-polyline rendering — bad fit for cross-platform **GPX + 導覽**.

`react-native-maps@1.20.1` is in `package.json` but **imported nowhere** (orphan dep). `expo-maps` is not installed. Expo SDK 54, RN 0.81, React 19.

---

## 2. Goals & non-goals

### Goals

1. **Faster maps** — eliminate the per-surface 200 KB parse (cold-start) and get native-grade pan/zoom (runtime).
2. **Keep offline** working on-location — by **reusing the existing Leaflet tile cache** (no new offline system to build).
3. **Switchable engines** — both an internal abstraction *and* a user-facing setting.
4. **Cheapest-that-hits-quality** — no per-user billing; free tile/style source.
5. **GPX** — users can import, view, and export GPX tracks/routes.
6. **導覽** — Phase A (free, follow an existing route) now; Phase B (turn-by-turn) reserved.

### Non-goals (YAGNI)

- Permanent per-platform native engines (Apple-on-iOS / Google-on-Android) as primaries — most maintenance, can't offline, can't style. The abstraction *allows* them later; we don't build them now.
- Mapbox — ruled out by "cheapest" (per-MAU billing).
- **A new offline system** (MapLibre PMTiles / region download) — the existing Leaflet Cache-API cache already does offline; MapLibre stays online-only.
- Turn-by-turn routing implementation in this milestone (interface only).
- Rewriting warm-start (snapshot seed / MMKV sync read / SQLite TTL) — already tuned; keep.

---

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Primary engine = MapLibre Native** (`@maplibre/maplibre-react-native`) | Native speed; free OSS (no token, no per-user fee); programmatic offline; custom GL style can reproduce CARTO; native GeoJSON clustering; best line rendering for GPX/導覽; one cross-platform codebase. |
| D2 | **MapLibre online tiles = OpenFreeMap** (free, no token) | Zero setup, $0. PMTiles/R2 only if we ever want MapLibre-native offline — not now (offline = Leaflet). |
| D3 | **Introduce an engine-neutral abstraction** (`MapSurface` + `MapEngineContract`) that the three screens consume instead of Leaflet directly | This *is* the "可切換". Lets us swap renderers without touching screens. |
| D4 | **Keep Leaflet permanently as the offline engine** (existing Cache-API cache, untouched) | It already does offline well; reuse = $0 + zero risk to the crown jewel. |
| D5 | **Offline = the existing Leaflet cache**; MapLibre is online-only. **"Auto"** switches engine by connectivity (online→MapLibre, offline→Leaflet) | Right tool per job; no new offline to build or validate. |
| D6 | **GPX is app-layer** (`gpx.ts`) and renders through the engine contract's route API | Engine-agnostic; trivial; free. |
| D7 | **導覽 Phase A = "follow existing route"** (ordered spots / imported GPX, "you are here / next point Xm", leg distance + ETA), **no routing engine**. Phase B = pluggable `RoutingProvider` (Apple MKDirections iOS-free / OpenRouteService free tier / self-host OSRM·Valhalla), interface reserved | Phase A is free and covers the common case; Phase B stays optional and provider-swappable. |
| D8 | **Settings → Map 3-way: Auto / MapLibre / Leaflet** (extends `map-theme-prefs.ts`); default **Auto** | Fulfils "地圖是可以切換的"; Auto = fast online + reliable offline automatically. |

> Supersession note: D1 replaces the prior "shared pre-warmed WebView host" plan for the **online** path — going native removes the JS-parse cost entirely (which pre-warming only amortized). The Leaflet/offline path keeps its current cost; pre-warm could still be applied there later if needed (out of scope).

---

## 4. Architecture

### 4.1 Engine-neutral contract (the abstraction)

A single provider-agnostic surface the three screens use. Generalizes today's `SpotMapViewHandle` + the Leaflet bridge into engine-neutral terms.

```
components/pilgrimage/map/
  MapSurface.tsx          # <MapSurface engine=… {…props} ref={handle}/>
  engines/
    maplibre/MapLibreEngine.tsx
    leaflet/LeafletEngine.tsx   # wraps existing leaflet-map.ts + WebView
  index.ts
```

**`MapSurfaceProps` (engine-neutral):**
`markers: MapMarker[]`, `routes?: MapRoute[]`, `waypoints?: MapWaypoint[]`, `user?: UserPuck | null`, `center?`, `zoom?`, `markerMode?: 'bubble' | 'dot'`, `offlineOnly?: boolean`, `visitedIds?: string[]`, `onMarkerPress?`, `onClusterPress?`, `onPanned?`, `onBoundsChange?`, `controlsBottomOffset?`.

**`MapSurfaceHandle`:** `recenter(lat, lng, zoom?, opts?)`, `setHeading(deg | null)`, `focus(target)`, `fitBounds(box)`, `updateVisited(ids)`. (1:1 with the methods screens already call imperatively — no render-path churn, preserves Rule 9.)

**Data model** (`libs/services/pilgrimage/map-engine/types.ts`):
- `MapMarker` — `{ id, lat, lng, kind: 'anime'|'spot'|'city88', icon, badge?, color, visited? }`
- `MapRoute` — `{ id, coords: LatLng[], kind: 'gpx'|'tour', style? }`
- `MapWaypoint` — ordered point for 導覽
- `UserPuck` — `{ lat, lng, heading? }`
- `Viewport` / `BBox`
- `MapEngineContract` — the interface each adapter satisfies.

Existing `*.data.json` → normalized to `MapMarker[]` once, engine-independent.

### 4.2 Adapters

- **`MapLibreEngine`** (new, primary) — native MapLibre. Markers/clusters via a GeoJSON source with `cluster: true`; custom anime balloons via symbol layer images or view-annotations; user puck + heading via a styled layer; routes via line layers (width-by-zoom, arrows); `setData` for diff updates (no full re-inject).
- **`LeafletEngine`** (existing, wrapped) — refactor the three screens' WebView usage to call `leaflet-map.ts` *through* the contract. Pure refactor first (no behavior change), proving the abstraction. Remains the offline fallback until D4.
- **`AppleEngine` / `GoogleEngine`** — documented as possible adapters; **out of scope**.

### 4.3 Engine selection / switchability

`libs/services/pilgrimage/map-engine/resolve.ts`:
`resolveMapEngine({ pref, online, platform, capabilities }) → 'maplibre' | 'leaflet'`
- Default `pref = 'auto'` → `online ? 'maplibre' : 'leaflet'`.
- `pref = 'maplibre'` / `'leaflet'` force that engine.
- If MapLibre fails to init / unsupported → fall back to `'leaflet'` (logged, silent to user; map still renders).
- Connectivity from NetInfo + the WebView's existing `online/offline` events; **debounced** so a flapping signal doesn't thrash the engine (only swap on sustained offline).
- User override from Settings → Map (`map-engine-prefs`, alongside `map-theme-prefs.ts`), MMKV-backed, read synchronously on the render path (Rule 10).

---

## 5. Offline

Offline is owned by the **existing Leaflet engine** — unchanged. MapLibre is **online-only**.

- **Online:** MapLibre + OpenFreeMap (native vector, fast).
- **Offline / poor signal:** "Auto" swaps the surface to `LeafletEngine`, which serves CARTO tiles from the existing Cache-API (`osm-tiles-v2`) + IndexedDB LRU — exactly today's behavior, untouched.
- Tiles cache as the user browses online (current behavior); no regression. The on-location `offlineOnly` mode and "離線" banner stay on the Leaflet path.
- **Look differs slightly online vs offline** (OpenFreeMap vs CARTO). We tune the MapLibre style toward the Voyager/Dark-Matter feel to minimize the jump.
- Real states only (Rule 8): offline + un-cached area → existing Leaflet "離線" empty state; **never** fake tiles.

We do **not** build MapLibre-native offline (PMTiles / region download). It's reserved as a future option only if we ever decide to collapse to a single engine end-to-end.

---

## 6. GPX

`libs/services/pilgrimage/gpx.ts` — engine-agnostic:
- **Parse** GPX XML → `{ tracks, routes, waypoints }` → `MapRoute` + `MapWaypoint`.
- **Serialize** spots / a tour → GPX for export.
- **Import** via `expo-document-picker` / share sheet; **export** via share sheet.
- Render through the contract's `routes`/`waypoints` props (MapLibre line layer; Leaflet polyline).
- Errors are real (Rule 8): malformed GPX → error toast, no fake track.

---

## 7. 導覽 (navigation / guided tour)

**Phase A — follow an existing route (free, this milestone):**
`libs/services/pilgrimage/tour-guide.ts`
- Order spots (reuse `rankFeaturedSpotsByPriority` + nearest-neighbor, or imported GPX order, or manual).
- Draw the connecting route as a `MapRoute` (straight legs, or snapped to an imported GPX track).
- Compute per-leg distance + ETA (haversine × walking speed) — real numbers only.
- Live "你在這 · 下一點 200m · 剩 N 站" using existing `useUserLocationTracking` (no extra GPS owner).
- No external routing → zero cost.

**Phase B — turn-by-turn (later, optional):**
`libs/services/pilgrimage/routing/` — `RoutingProvider` interface `getWalkingRoute(from, to) → Route`:
- `AppleDirectionsProvider` (iOS `MKDirections`, free)
- `OpenRouteServiceProvider` (cross-platform, free tier ~2000/day)
- `OsrmProvider` / `ValhallaProvider` (self-host)
- On routing failure → fall back to Phase A straight-line. Interface reserved now; **not implemented** this milestone.

---

## 8. Cost model

| Engine | Library | Tiles/usage | Offline in-app | GPX/route | 導覽 routing | Platforms |
|---|---|---|---|---|---|---|
| Apple Maps | Free | Free | ❌ | ⚠️ basic | ✅ MKDirections (free, iOS) | iOS only |
| Google Maps | Free | Map free (needs key+billing) | ❌ | ✅ | Directions API = $ | iOS+Android |
| **MapLibre — online (chosen)** | **Free OSS** | **Free** (OpenFreeMap) | via Leaflet (existing) | ✅✅ GL lines | bring-your-own (Apple free iOS / ORS free tier / self-host) | iOS+Android |
| Mapbox | Free ≤25k MAU | **$ per MAU after** | ✅ | ✅✅ | $ | iOS+Android |
| Leaflet (current) | Free | Free (CARTO) | ✅ (Cache-API hack) | ✅ | bring-your-own | iOS+Android |

Net recurring cost target: **$0** (MapLibre + OpenFreeMap, or R2 free-tier egress for self-hosted PMTiles; Phase B routing only if/when enabled).

---

## 9. Performance rationale

- **Cold-start:** native MapLibre has **no 200 KB JS parse per surface** — the root cause is gone, not amortized.
- **Runtime:** native GL pan/zoom (60–120 fps); marker/cluster updates via GL source `setData` diff, not full re-inject.
- **Shared config:** one engine + style across all three surfaces (no 3× HTML builders).
- **Render path stays clean:** imperative handle (recenter/heading/focus) keeps GPS/gesture ticks off React state (Rule 9); warm-start seed (snapshot, MMKV sync) feeds the engine the same way (Rule 10).
- The hub `map.tsx` state sprawl (Rule 9) is reduced opportunistically as screens move to `MapSurface`, but is **not** the primary lever.
- **Caveat:** the cold-start win is on the **online** (common) path via MapLibre. The **Leaflet/offline** path keeps its current ~200 KB parse cost; if that bites on-location, the (superseded) shared pre-warmed WebView host can be applied to the Leaflet adapter later — out of scope here.

---

## 10. Migration plan (design-level; detailed plan via writing-plans)

| Phase | Deliverable | Risk |
|---|---|---|
| P0 | Define `MapEngineContract` + data model; refactor 3 surfaces onto `MapSurface` using the **Leaflet** adapter (pure refactor, no behavior change) | Low — proves abstraction with zero user-visible change |
| P1 | `MapLibreEngine` (online): markers, native clustering, user puck, heading, recenter, focus, bounds + OpenFreeMap style tuned toward Voyager/Dark-Matter. Behind setting; default still Leaflet | Med |
| P2 | Flip default → **Auto** (online MapLibre / offline Leaflet) + Settings 3-way (Auto/MapLibre/Leaflet) + debounced NetInfo wiring | Med |
| P3 | GPX import/export/render | Low |
| P4 | 導覽 Phase A (follow route) | Low |
| P5 | *(later/optional)* 導覽 Phase B behind `RoutingProvider` | — |
| — | Cleanup: remove orphan `react-native-maps` dep | Low |

---

## 11. Error handling & empty states (Rule 8)

- Engine init failure → silent fallback to Leaflet adapter; map still renders; log only.
- Offline → Auto swaps to Leaflet; un-cached area → existing Leaflet "離線" state; never fake tiles.
- GPX parse failure → real error toast; no placeholder track.
- Routing failure (Phase B) → fall back to Phase A straight-line; no fabricated path/ETA.
- All distances/ETAs computed from real coords (haversine), never seeded/hashed.

---

## 12. Testing

- **Unit:** data normalization → `MapMarker[]`; GPX parse/serialize round-trip; tour leg distance/ETA math; `resolveMapEngine` policy; existing locate-fab state machine.
- **Contract tests:** `MapLibreEngine` and `LeafletEngine` both satisfy `MapEngineContract` (same handle methods + semantics).
- **Existing:** contrast (`themed-*`) and i18n parity tests remain green.

---

## 13. CLAUDE.md compliance

- **Rule 8 (no fake data):** offline/empty/error states are real; ETAs/distances from real coords.
- **Rule 9 (state ownership):** imperative handle keeps sensor/gesture ticks off React state; opportunistic reduction of `map.tsx` `useState` sprawl.
- **Rule 10 (nav feel):** engine pref read via sync MMKV; warm-start seed preserved; no `await` on first paint.
- **Rule 11 (i18n):** all new UI strings (`離線：此區域尚未下載`, 導覽 labels, GPX import/export, Settings → Map) via `useT()`; new keys added to `en.json` first.
- **Themed primitives:** new controls (engine switch, GPX buttons, 導覽 HUD) use `ThemedButton` / `ThemedText` / `ThemedSurface`, colors from `useTheme()`.

---

## 14. Risks & validations (resolve during implementation)

1. **MapLibre RN ↔ Expo SDK 54 / RN 0.81 / New Architecture** — confirm exact compatible version + Expo config plugin; app must use dev client / prebuild (not Expo Go). *(P1)*
2. **Anime-balloon markers at scale** — symbol-layer images vs view-annotations performance with hundreds of markers; lean on native clustering. *(P1)*
3. **Online↔offline look jump** — tune MapLibre/OpenFreeMap style toward Voyager/Dark-Matter so the Auto swap isn't jarring. *(P1–P2)*
4. **Auto-switch thrash** — connectivity flaps must not remount the map; debounce, swap only on sustained offline. *(P2)*
5. **Binary size** — MapLibre native SDK adds a few MB; confirm acceptable. *(P1)*

---

## 15. Resolved decisions (from review)

- **Tile source:** MapLibre online = **OpenFreeMap** (free, no token). No PMTiles/R2 infra — offline is Leaflet's job.
- **Offline:** **reuse the existing Leaflet cache**; MapLibre stays online-only; **Auto** switches by connectivity.
- **Switch granularity:** Settings → Map **3-way: Auto / MapLibre / Leaflet**; style follows the current theme.
- **Leaflet end-state:** **kept permanently** as the offline engine / deep fallback (not retired).
