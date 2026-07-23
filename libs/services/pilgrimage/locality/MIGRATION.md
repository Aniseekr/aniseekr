# Canonical locality migration map

Status: **P1b implemented (uncommitted)**. The schema-v1 bundled migration,
validator, repository, Anitabi projection adapter, and compatibility reader
cutover described below now live in this directory. The legacy source files and
types remain as reviewed ingestion/catalog inputs until the chained P1b → P2 →
P3 → P5 build receives its single batch review.

## P1b implementation record (2026-07-18)

The deterministic bundled migration currently validates and exposes:

| Canonical collection | Count | Conservation note                                                                               |
| -------------------- | ----: | ----------------------------------------------------------------------------------------------- |
| Places               |   203 | 195 stamp-linked identities + 7 shops (Gamers overlaps) + 1 festival venue + 1 guide-only Place |
| PlaceRoles           |   209 | 201 `stamp_stop` + 7 `shop` + 1 `festival_venue`; scenes remain an overlay                      |
| Events               |     9 | 7 stamp rallies + 2 festival records                                                            |
| AreaDestinations     |   124 | Every Anime Tourism 88 row; all current `placeRefs` empty and no `geo` field                    |
| PlaceGuides          |     1 | `bentenjima-torii-sunset`                                                                       |
| NewsSources          |    17 | All curated feed definitions; live articles stay outside the envelope                           |

All 11 records that predate the six added rally rows survive across their
canonical entity kinds. The 201 stop count is role membership, so it is
unchanged even though reviewed identity resolution reduces those memberships
to 195 stamp-linked Places.

Implementation details:

- `BundledLocalityDataLoader` lazily migrates the three retained source files,
  validates the complete envelope, and supplies the synchronous initial
  snapshot. `LocalityRepositoryImpl` accepts any `LocalityDataLoader`; invalid
  initial data is rejected and an invalid/failed refresh cannot replace the
  last-known-good snapshot or notify readers.
- The validator checks table key/id parity, non-empty display provenance,
  coordinate bounds, unique refs, foreign keys, stamp campaign consistency,
  and `role.animeIds ⊆ place.animeIds`.
- The reviewed stop registry records only evidence-backed merges. Five pairs
  with identical full addresses share Places; the separately reviewed Gamers
  merge also joins its address-less Numazu membership and shop record. Other
  same-name/nearby candidates remain separate.
- `gamers-numazu` is one Place at `[35.101505, 138.856827]` with the full
  添地町 address, one shop role, three campaign-specific stamp roles, and four
  distinct provenance credits. The divergent legacy shop coordinate is not
  emitted as another Place.
- Anime Tourism row 31 is officially Tokyo-wide and has an empty city field;
  it honestly falls back to the sourced prefecture name `東京都` as an
  administrative area. No city/prefecture centroid enters `Place.geo` or the
  exact-pin marker path.
- `AnitabiPipelineSceneProjector` delegates to the existing detailed-points
  fetch/cache and `groupPointsIntoSpots` implementation. Projected Places and
  `scene` roles are query-time overlays and never enter the bundled snapshot.
- The local-intel, Anime Tourism 88, and news-source modules now act as legacy
  shape projections over the canonical repository. Existing rails, hub tabs,
  detail intel, album/filter readers, stream/follow readers, and map wiring keep
  their public contracts; the map's 88 exact-pin path reads only promoted
  `AreaDestination.placeRefs` (currently none).

## Canonical invariants

1. A `Place` is one physical location. Why that location matters is expressed
   by separate `PlaceRole` entities (`scene`, `stamp_stop`, `shop`, or
   `festival_venue`). Co-located roles never create duplicate Places.
2. Runtime ids remain plain strings. The branded TypeScript ids prevent mixing
   collections in code; existing stable slugs are preserved where possible.
   A Place id is never derived from coordinates because corrected coordinates
   must not change identity.
3. All entity collections are keyed by id. Foreign keys must resolve, ids and
   array references must be unique, and every entity has non-empty,
   display-ready provenance.
4. `Place.geo` is an exact, source-backed WGS84 coordinate or `null`. City
   centroids and other administrative approximations never become Place pins.
5. `Place.animeIds` is the validated union of evidence-backed role links and
   exact-site links from `AreaDestination.placeRefs`. Event-only relationships
   stay on `LocalityEvent.animeIds` and do not imply per-stop anime specificity.
6. `LocalityEvent` represents both events and campaigns. A stamp rally is a
   `stamp_rally` event referenced by each `StampStopRole.campaignId`.
7. The current `EventSchedule` union remains the single recurrence/state-machine
   input. The locality schema aliases it rather than forking it.
8. Every `StampStopRole.campaignId` resolves to a `stamp_rally` event, and that
   event's `placeRefs` contains the role's `placeId`.

## Identity resolution before entity creation

P1b should build a reviewed legacy-ref-to-`PlaceId` registry before emitting
the envelope. Candidate matches are evaluated in this order:

1. a qualified Anitabi `bangumiId + pointId` already assigned to a Place;
2. the same upstream stable id or the same verified full street address;
3. a reviewed business/landmark name plus corroborating address;
4. a reviewed name plus close exact coordinates from independent sources.

Name or proximity alone must never auto-merge a Place or infer an anime link.
Coordinate conflicts stay in the migration audit until a source-backed winner
is selected. Stop-only Places receive a durable slug recorded in the registry;
rerunning ingestion reuses that slug.

## Source summary

| Current source                                    |                           Current records | Canonical target                                            |
| ------------------------------------------------- | ----------------------------------------: | ----------------------------------------------------------- |
| `local-intel/local-intel.data.json` shops         |                                         7 | Place + `ShopRole`                                          |
| `local-intel/local-intel.data.json` events        | 9 (7 stamp campaigns, 2 festival records) | `LocalityEvent`; exact venues become Place refs             |
| nested `stampSpots`                               |                      201 stop memberships | deduped Places + **201 campaign-specific `StampStopRole`s** |
| `local-intel/local-intel.data.json` viewing hints |                                         1 | Place + `PlaceGuide`                                        |
| `anime-tourism-88.data.json`                      |                    124 anime-by-city rows | 124 coordinate-free `AreaDestination`s                      |
| `news/news-sources.data.json`                     |                                  17 feeds | 17 `LocalityNewsSource`s in the same envelope               |
| existing Anitabi point pipeline                   |                     dynamic grouped spots | projected Place + `SceneRole`; no copied/forked dataset     |

The 201 stamp memberships are intentionally not reduced: deduplication reduces
physical Places, not a Place's participation in separate campaigns. The current
file has 196 unique `(name, address)` keys and 186 unique names, but neither
count is a safe physical-identity count without the reviewed registry.

## `local-intel.data.json`

### Shop entry -> Place + ShopRole

| Legacy field                             | Target                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`                                     | preserved as the preferred Place slug when it is the first canonical identity; role id becomes `shop:<id>`             |
| `name`, `geo`                            | `Place.name`, `Place.geo` after identity/conflict review                                                               |
| `hours`, `timezone`                      | JP hours are wrapped as `{ ja: hours }`; timezone maps to `Place.timezone`                                             |
| `sourceUrl`, `officialUrl`, `verifiedAt` | one display-ready Place/role provenance credit; P1b supplies the reviewed `sourceName` and any known license/copyright |
| `bangumiIds`                             | `ShopRole.animeIds` and the validated `Place.animeIds` aggregate                                                       |
| `category`                               | `ShopRole.shopCategory`                                                                                                |
| `animeConnection`, `description`         | `ShopRole.animeConnection`, `ShopRole.description`                                                                     |
| `spotRefs`                               | strongest Place-identity match to the existing Anitabi projection; not retained as duplicated nested spot data         |

### Event entry -> LocalityEvent (+ venue entities)

The event `id`, `category`, `name`, `description`, `schedule`, `bangumiIds`,
timezone, and provenance map directly to `LocalityEvent`. Existing ids remain
stable. `placeRefs` and `areaRefs` are always explicit arrays.

- A single exact `geo`/`venue` is resolved to a canonical Place. Festival
  venues also receive a `festival_venue` role, and the event references the
  Place by id.
- `geo: null` creates no fake Place. An area-wide event may use an
  `AreaDestination` only when the source actually identifies that area.
- Legacy `spotRefs` resolve the referenced projected Anitabi Place and then
  become normal `placeRefs`.

### Nested stampSpots -> Places + StampStopRoles

For every one of the 201 nested stop memberships:

1. Resolve or create exactly one Place from the sourced name/address/geo,
   wrapping a JP address as `{ ja: address }` when present.
2. Create a role id stable on `(campaignId, placeId)`, for example
   `stamp-stop:numazu-machiaruki-stamp:gamers-numazu`.
3. Set `campaignId` to the parent event id.
4. Copy the exact published stop name/address to `sourceLabel`/`sourceAddress`
   so canonical Place normalization does not erase campaign-specific wording.
5. Use a future explicit per-stop anime list when present. Today's shape has no
   stop-level evidence, so migrate `animeIds: []`; never inherit the parent
   event's list as if it were a verified per-stop fact.
6. Today's stops also migrate with `availability: { kind: 'unconfirmed' }`.
   Use `campaign_schedule`, an override, or a closure only when the official
   stop source explicitly establishes it.
7. Build role provenance from the stop `sourceUrl` plus the parent event's
   verification date. P1b adds a reviewed display source name. Place
   provenance contains every source used to choose its identity fields.
8. Add the Place id once to the campaign's `placeRefs`; never nest the Place in
   the event.

### Viewing hint -> Place + PlaceGuide

`bentenjima-torii-sunset` currently has no `spotRef`, so P1b creates/resolves a
Place at its exact sourced coordinate and preserves the legacy id for the
`PlaceGuide`. `bangumiIds`, `name`, `description`, `hint`, `bestMonths`, `note`,
`radiusM`, and the source fields map to `animeIds`, `name`, `description`,
`guidanceKind`, `bestMonths`, `note`, `appliesWithinMeters`, and provenance.
If a future qualified Anitabi match is verified, the guide points to that same
Place; a fifth role kind is not introduced.

## Worked dedupe: Gamers Numazu

The current file represents the same store as one shop and three campaign stop
memberships:

- shop `gamers-numazu`: `[35.0937, 138.8628]`;
- `numazu-machiaruki-stamp`: `[35.10157, 138.856807]`;
- `ll-sunshine-jr-central-stamp`: full address
  `静岡県沼津市添地町72 青秀ビル1階`, `[35.101505, 138.856827]`;
- `yohane-jr-central-numazu-stamp`: the same full address and coordinate.

P1b emits one Place with id `gamers-numazu`, the multilingual shop name, the
full sourced address, and canonical geo `[35.101505, 138.856827]`. The two
address-bearing campaign records agree, and the first campaign coordinate
corroborates them closely; the divergent legacy shop coordinate is rejected in
the migration audit rather than copied into another Place. The Place keeps the
official Gamers and campaign evidence as displayable provenance.

Four roles reference that one Place:

1. `shop:gamers-numazu` (`shopCategory: goods`);
2. `stamp-stop:numazu-machiaruki-stamp:gamers-numazu`;
3. `stamp-stop:ll-sunshine-jr-central-stamp:gamers-numazu`;
4. `stamp-stop:yohane-jr-central-numazu-stamp:gamers-numazu`.

Each stamp role has its own `campaignId`, source-exact label/address, and source
credit. Its anime list is empty and availability is `unconfirmed` until those
stop-level facts are verified. The Place's anime links come from its sourced
shop role, not from campaign inheritance. Each of the three campaign events
contains the same Place id in `placeRefs`. No event contains a duplicate name,
address, or coordinate.

## Anitabi projection (adapt, do not fork)

The canonical locality bundle does **not** copy `anitabi-index.data.json` or
Anitabi point payloads. P1b composes the existing pipeline:

1. existing `normalizeRawPoints` and `groupPointsIntoSpots` continue to own
   point normalization and physical grouping;
2. each resulting `AnitabiSpot` projects to a Place whose `animeIds` contains
   the qualified Bangumi id (or resolves through the reviewed identity registry
   to an existing Place);
3. one `SceneRole` stores the qualified representative
   `{ bangumiId, pointId: AnitabiSpot.id }`;
4. screenshots, episode/second metadata, and contributor origins remain in the
   Anitabi pipeline and are joined by that qualified reference;
5. role provenance carries Anitabi's source/license and any per-point origin
   credit. `[0, 0]` or otherwise unverified coordinates project as `geo: null`.

An `AnitabiSceneProjector` adapter owns this async delegation. This makes
`getPlacesForAnime` an async repository projection over canonical entities plus
the existing Anitabi adapter, returning each Place with all matching roles
(including projected `SceneRole`s). The projection is a read overlay rather
than a second scene ingestion path or a false member of the envelope snapshot.

## `anime-tourism-88.data.json`

Each of the 124 rows becomes one `AreaDestination`, keyed stably from program,
edition, and upstream row id (for example `anime-tourism-88:2025:1`). Mapping:

- `externalIds.bangumi` -> the sole `animeIds` value;
- `city` -> `name: { ja: city }`; a reviewed source-supplied translation may be
  added, but none is synthesized from `regionEn`;
- `prefecture`, `city`, `region` -> `prefecture`, `locality`, `region`;
- `year`, `id` -> `edition`, `sourceEntryId`;
- current city-only rows -> `placeRefs: []`;
- top-level official `source` plus a verified migration date -> entity
  provenance with a display name such as Anime Tourism 88.

No row gets `Place.geo`, and the existing city-centroid join is viewport-only;
it must never feed a marker. When an official exact site is researched, P1b/P4
creates or resolves a Place, adds the Bangumi id to `Place.animeIds`, and adds
that Place id to `AreaDestination.placeRefs`. A `stamp_stop` or other role is
added only when the official source verifies that specific meaning; promotion
alone never invents a role. The area record remains as the program's city-level
destination.

Poster URLs, AniList popularity/score, and non-Bangumi external ids are anime
catalog concerns and must be joined from the anime repository rather than
duplicated across locality destinations. A compatibility adapter retains the
legacy reader shape until that reader is intentionally migrated.

## `news-sources.data.json`

Each of the 17 entries becomes a `LocalityNewsSource` in
`entities.newsSources`. Existing ids are preserved so the stored follow set
does not need an identity rewrite.

| Legacy field                                                 | Target                                                |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `name`, `feedUrl`, `homepageUrl`                             | same canonical fields                                 |
| `category`, `language`, `format`, `recommended`, `frequency` | same canonical fields                                 |
| `verifiedAt`                                                 | provenance verification date                          |
| source name / `feedUrl` / `homepageUrl`                      | provenance display name / evidence URL / official URL |
| `notes`                                                      | `operationalNotes`                                    |

`animeIds`, `placeRefs`, and `eventRefs` start empty because the current file
contains no evidence for those relations. Later article/tag cross-links must be
source-backed. Feed articles remain live/cache data; only their curated source
definitions belong in this envelope.

## P1b loader/repository cutover

1. Build and validate a schema-v1 envelope plus the reviewed Place identity
   registry; reject wrong versions, unresolved refs, key/id mismatches, empty
   provenance, invalid coordinates, duplicate refs, inconsistent Place anime
   aggregates, and stamp-role/campaign mismatches.
2. Implement a bundled `LocalityDataLoader`. A future remote adapter provides a
   persisted/bundled synchronous snapshot from `loadInitial()` and fetches a
   candidate through `loadLatest()`.
3. Construct one `LocalityRepository` over the chosen loader and an
   `AnitabiSceneProjector` over the existing Anitabi pipeline. Envelope queries
   remain synchronous; `getPlacesForAnime` is async because it may load/project
   Anitabi scenes. Failed/degraded refreshes retain the last good snapshot and
   notify only after a valid replacement.
4. Compatibility projections now keep legacy reader shapes stable. Legacy
   files/types remain intentionally retained for proof and catalog metadata;
   removal is deferred until the chained build's batch review.
