# Pilgrimage Map Perf — Waves Status & Remaining Work

- **Date:** 2026-05-31
- **Status:** In progress — code on branch `perf/pilgrimage-map-cold-open` (not merged to main)
- **Goal:** faster pilgrimage map, primarily **cold-open** (`libs/services/pilgrimage/*`, `app/(tabs)/pilgrimage/*`)
- **Related:** [`2026-05-30-pilgrimage-map-native-switchable-design.md`](./2026-05-30-pilgrimage-map-native-switchable-design.md) — the proposed MapLibre+Leaflet native-switchable pivot (awaiting decision; may supersede the WebView-host direction for the online path).

> Root cause recap: each of the 3 map surfaces mounts its **own** WebView and cold-parses **~200 KB** of inlined Leaflet JS on every open (the stable origin caches *tiles*, not the inline script). Secondary: ~160 KB `*.data.json` eager-parsed at import; `map.tsx` 11-`useState` root (Rule 9); hub does full marker `replace` per filter/search.

---

## ✅ Done (on `perf/pilgrimage-map-cold-open`)

| Wave | Commit | What it did | Improved |
|------|--------|-------------|----------|
| **W1** | `7358bbe` | 4 bundled `*.data.json` (~160 KB) → lazy + memoized (parse on first use, not at module-eval). Runtime hydration still wins; APIs unchanged & sync. | App-startup JS-thread (~50 ms off the import path) |
| **W4** | `f445288` | Extracted `hooks/usePilgrimageHubData` (collection/featured/lazy-index/visited/captures) out of `map.tsx` (Rule 9). Capped cold-start featured `/lite` fetches to 6 concurrent. | `map.tsx` root state; cold-start request storm 29→6 |
| **W5-A** | `458d47f` | Extracted hub Leaflet WebView (`buildHubMapHtml` + component) → `components/pilgrimage/HubMapWebView.tsx`. Behavior byte-identical. | Reusable unit; `map.tsx` 1818→974 LOC (incl. W4) |
| **W5-B** | `cd307b5` | `MapHostProvider` keeps **one** `HubMapWebView` alive in `pilgrimage/_layout`; hub screen claims on focus / releases on blur (WebView not destroyed). Root transparent + `box-none`. | Cold-open: ~200 KB Leaflet parse paid **once per session**, not per navigation (online/Leaflet path) |
| **fix** | `5ff7bbc` | Memoize WebView `source` on `[html]` so `host.update` doesn't re-send `{html,baseUrl}` → Android `loadDataWithBaseURL` reload (which would defeat keep-alive). +regression test. | Keep-alive correctness on Android |

All commits passed `tsc --noEmit` + relevant `__tests__/unit/pilgrimage/*` suites. `map.tsx`: **1818 → 974 LOC**.

Note: W5-B's win is **amortize** (pay parse once at idle), not **eliminate**. Going native (the pivot spec) would eliminate it for the *online* path.

---

## ⏳ Remaining / unfinished

| Item | Status | Notes |
|------|--------|-------|
| **Device-verify B** | 🔴 **Gating** | Transparency / z-order / touch passthrough can't be unit-tested. 6-point on-device checklist below. **Most likely failure: `react-native-screens` opaque screen container hides the map.** |
| **C — pre-warm timing** | ⏳ blocked on B | Polish: warm the host on pilgrimage tab focus so the first open is also hot. Build on verified B. |
| **W3 — hub marker signature-diff** | ⏳ optional | Port `SpotMapView`'s diff so filter/search does additive/diff updates instead of full `replace` (kills marker flash). Not a user-stated pain. |
| **W6 — press-in thumbnail prefetch** | ⏳ low-risk | `Image.prefetch` initial-viewport marker thumbnails on list press-in (Rule 10 #6). Independent of the host. |

### B on-device checklist (run `bun start` / `bun run ios`; B is JS-only, no prebuild)
1. **Map visible** through the hub screen? (blank/black ⇒ transparency chain / `react-native-screens`)
2. **Pan/zoom on empty area** works? (no ⇒ `box-none`/z-order touch passthrough)
3. **Markers + filter + search** render/update?
4. **Cold-open win:** hub→detail→back ×N and tab-switch back ⇒ **instant, no skeleton/reload**? (core goal)
5. **Other routes** (index/album/plan/detail) stay opaque, no map bleed-through?
6. Locate FAB idle→following→compass; drag drops to idle.

---

## 🔀 Pending decision — native-switchable pivot

The companion spec proposes: **MapLibre Native** (online, eliminates the parse) + **Leaflet kept as the offline engine** (reuse the Cache-API tile cache) behind an engine-neutral `MapSurface`/`MapEngineContract`, with an Auto/MapLibre/Leaflet setting; plus GPX + 導覽.

**How it reframes the work above (nothing wasted):**
- W1 / W4 are engine-agnostic → stay.
- W5-A (`HubMapWebView`) → becomes the seed of the `LeafletEngine` adapter.
- W5-B + the reload fix → become the **Leaflet/offline-adapter keep-alive** — because on-location (poor signal → Leaflet) still cold-parses 200 KB, and MapLibre is online-only, so the keep-alive is exactly what the offline path needs.

**Gating risk for the pivot:** `@maplibre/maplibre-react-native` on **Expo 54 / RN 0.81 / React 19 / New Arch** (needs config plugin + dev-client/prebuild). Prove it renders with a minimal spike **before** building the abstraction around it.
