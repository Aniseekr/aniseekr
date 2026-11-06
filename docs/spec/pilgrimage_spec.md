# Pilgrimage Integration Spec

## 1. Goal

Pilgrimage discovery uses Aniseekr Atlas as its sole anime location data source.
The app resolves an anime to an Atlas franchise key, loads that work's spots,
and uses Atlas spot coordinates for maps and nearby discovery. Reference images
are imported by the user; Atlas does not provide scene images.

## 2. Atlas contract

The client reads `https://atlas.aniseekr.moe/meta.json`, then resolves assets
from its versioned `/v/<dataVersion>/` paths. The works index has rows with
`key`, `ja`, `en`, localized `zh`, `mal`, optional `bgm`, `n`, `conf`, and
`cities`. A work document has `spots`; each spot carries Japanese name and
address, confidence, optional coordinates, scenes, and source records. The
spots-lite document uses column names plus positional rows. `moved.json` maps
old spot ids to a replacement id or `null` when the spot was removed.

The bundled works snapshot seeds the first frame. All network-backed payloads
use `CacheService`, with synchronous cache reads for first paint and
stale-while-revalidate for expired entries. A 404 for a versioned asset causes
one meta refresh and one retry. Missing network and cache data is an error.

## 3. Domain types

`PilgrimageWork` represents one Atlas franchise document. `PilgrimageSpot`
contains `id`, `name`, `address`, nullable latitude and longitude, precision,
confidence, scenes, and sources. It has no image field. Spots without a
location remain visible in the list with an explicit unconfirmed-location
label and are omitted from maps and nearby results.

## 4. Anime resolution

Resolution order is Bangumi id, MAL id, exact normalized Japanese or English
title, then AniList PREQUEL relations for at most three hops. Title
normalization uses the Atlas API normalization contract (NFKC, lowercase, and
removal of listed punctuation and whitespace). Relation results are cached.
No fuzzy match or fallback franchise is allowed; unresolved anime return null.

## 5. UI behavior

Work covers use the Bangumi common image when an Atlas row has a Bangumi id,
then the anime's own cover. Spot rows show episode badge, name, address, and
confidence without scene imagery. Reference comparison uses a user-imported
screenshot. Unverified confidence and reference-based episode/time metadata
must be labelled honestly. User-facing fixed strings use `useT()`.

## 6. Non-Atlas sources

Anime Tourism 88 and canonical locality/event data remain separate products;
they do not provide anime pilgrimage spots or scene imagery.

## 7. Legacy record migration

On the first launch after the Atlas migration, the app migrates capture-index,
visited, and saved/planned intent records off retired spot ids. It resolves the
record's Bangumi id through the Atlas work resolver, then selects the nearest
located spot in that work at a haversine distance of at most 50 metres. Captures
receive Atlas name, coordinates, and scene timing; old remote image URLs are
cleared. Colliding captures remain newest-first, visited timestamps keep the
earliest value, and intent flags are combined.

If an Atlas match is unavailable, the original id and user record are retained
and marked legacy. Visited records recover coordinates and Bangumi id only from
the old on-device detail cache. Missing network-backed work files postpone the
migration without setting its versioned done flag. Each store is replaced
atomically, so a later launch can safely resume after interruption. Local photo
files are never inspected, moved, or deleted.
An in-progress journal distinguishes already rehomed ids if a later store write
fails and the migration retries.

When a stored capture id is absent from the loaded Atlas work, album hydration
uses the same 50 metre matcher as a display-only safety net. Explicitly legacy
records stay unpaired and are labelled "Old spot".

## 8. Offline trip pack (Pro)

A Pro user can download one work for offline use. Viewing stays free; only the
download action is gated (`useSubscription().isPro`, else `PaywallSheet`).
A pack stores the work's Atlas index row and work document (spots, scenes,
addresses, confidence, sources) plus OpenFreeMap vector tiles around the
located spots, under `Documents/offline-packs` so clearing caches keeps it.
User-imported reference screenshots already live in Documents and are never
touched by packs.

Tiles follow the OpenFreeMap Terms of Service for offline downloads: at most
3,000 tiles and 50 MB per download, at most 4 parallel requests, and a
User-Agent naming the app. The plan keeps an overview of the spots' bounding
box at z5–z8 and walking radii around each spot up to z14, shrinking radii
until it fits; the z14 tile under each spot is never dropped. Packs download
one at a time. If the byte cap stops the download the pack is kept and labelled
as a partial map. The size estimate shown before downloading is the planned
tile count times a measured mean tile size plus the work data size.

Reads use live Atlas first. Only when the network and `CacheService` both fail
does the stored pack answer, and the work carries `offlineCopy.downloadedAt`
so the UI says "offline copy · date". Without a pack this remains an error.
When the Atlas `dataVersion` differs from the pack's, the pack offers an
update; when the latest version is unknown it claims neither. The map engine
loads the pack's on-device style (local tiles, glyphs, sprite) while a probe of
the Atlas host fails or when the user forces cached tiles. Size, update and
delete are listed in Settings → Cache.
