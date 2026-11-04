# Remove anitabi from the app → Atlas, restore the paywall, two-way web funnel

## Context

Anitabi data is CC BY-NC-SA (no commercial use), its API and image host return 403 inside Japan, and we have decided to be clearly **unaffiliated** with it. Because of that NC licence, `constants/FeatureFlags.ts` has had `PREMIUM_ENABLED: false` since May. Our own Atlas (private repo `aniseekr-atlas`) now has 779 works, 12,536 spots and 871 cities. It is live as versioned static JSON at `https://atlas.aniseekr.moe` (`/meta.json` → `/v/<ver>/…`). The goal:

1. The app reads **only** Atlas for pilgrimage data. Every anitabi code path, bundled file, image URL and credit is removed.
2. The paywall comes back **unchanged from before** (premium themes, no ads, sync), in the **same build** as step 1.
3. **Two-way funnel.** App work pages link to `aniseekr.moe/works/<key>`. Every web Download button goes to `aniseekr.moe/get`, which picks App Store or Play by device.

Decisions you've already made (2026-11-04):
- Reference images: users import their own screenshot. Atlas only gives "Episode N + timestamp", and we show no third-party images.
- Paywall: restored as it was.
- Funnel: both directions, plus the iOS Smart App Banner.
- Migration of old records: match each one by distance to an Atlas spot of the same work within 50 m. Records that can't be matched are kept and shown as "old spot". Photos are never deleted.

Size **L**. Division of work (standing rules): **Codex implements the app**, and Claude aligns the spec and reviews. **Claude writes the web frontend itself.**

## Facts this plan relies on (checked today)

- Atlas `works.json` (55 KB gz): `{key, ja, en, zh{hans,hant}, mal[], n, conf{c,s,u}, cities[]}`. Only **125/779** works have `mal`. **710/779** have a Bangumi subject id, but it's buried in `titleZh.source.url` (`bgm.tv/subject/<id>`) and missing from `works.json`. Together that's 720/779 linkable.
- `works/<key>.json`: a spot is `{id, name_ja, address_ja, note_ja, confidence, location{lat,lon,precision,muniCd}, scenes[{episode, time?, episodeBasis?}], sources[]}`. It has **no images**. A work is one **franchise** (it covers several seasons).
- `spots-lite.json` (400 KB gz): `[id, work, name, lat, lon, conf, eps]` → for nearby. `tiles/{9,12}` also exist.
- In the app, anitabi is imported at **44 call sites**. There are 3 bundled files: `anitabi-index.data.json` 515 KB and `anitabi-cross-index.data.json` 365 KB (`anime-tourism-88.data.json` is official data and stays). The domain types are `AnitabiBangumi` / `AnitabiPoint` (`libs/services/pilgrimage/types.ts`).
- `PilgrimageCapture` already stores `animeId` (bgm), `spotGeo`, `spotEp`, `spotSecond` and `spotImage` (an anitabi URL) → **migration doesn't need anitabi data**.
- `compare/[spotId].tsx` already supports importing a reference image from the photo library (`ImagePicker`, `referenceUri`).
- `libs/services/pilgrimage/` is spec-mapped: `docs/spec/agent.md` → `test_cases.csv` / `test_traceability.csv`, enforced by `bun run spec:check`.
- Web: `aniseekr-landpage-atlas` (SvelteKit static + Elysia Worker, `run_worker_first` list in `wrangler.jsonc`). `SiteHeader.svelte:17` hard-codes the App Store link. `StoreButtons.svelte` shows both stores. `/works/[key]` uses the Atlas key, so the app can link to it directly.

## Phase 0: data contract (`aniseekr-atlas-api`, small, Claude)

- `scripts/build-data.ts`: add `bgm: number[]` to every row of `works.json`, taken from the `bgm.tv/subject/<id>` in `titleZh.source.url` (an id is a fact, not a name). Don't publish anything else from `titleZh.source`.
- Rebuild, deploy and confirm that `/meta.json` has a new `dataVersion` and that `works.json` rows include `bgm`.
- Out of scope: per-season Bangumi id expansion (record it as a data follow-up).

## Phase 1: Atlas data layer inside the app (Codex, spec-first)

New `libs/services/pilgrimage/atlas/`:
- `atlas-client.ts`: `meta()` (60 s), `works()`, `work(key)`, `spotsLite()` against `/v/<ver>/…`. A 404 → reread meta once. Uses the existing `CacheService` (`getSync` mirror, `getWithMeta` for SWR, see rule 10), keyed by `dataVersion`.
- `atlas-resolver.ts` (pure logic, gets **tdd** treatment as a parsing/matching seam): anime context → Atlas work key. Order: bgm id → MAL id → **exact** normalized ja/en title match (normalization ported from the atlas-api `src/text.ts`). No fuzzy matching; a miss = null. A wrong match is worse than no data.
- Types: `PilgrimageWork` / `PilgrimageSpot` replace `AnitabiBangumi` / `AnitabiPoint` in `types.ts`. Spot fields: `id, name, address, lat, lon, precision, confidence, scenes[{ep, time?}], sources[]`. **No image field.**
- `pilgrimage-repository.ts` keeps its public API (`getSpotsForAnime`, `getNearbyAnime`, …) and switches its backing to Atlas. Callers only change type names. `IDMappingService` stays (it supplies the bgm/MAL ids).
- Nearby: `spotsLite()` cached + the existing distance sort (`nearby-spots.ts` / `home-nearby-spots.ts`).
- Spec: add case_ids to `docs/spec/pilgrimage_spec.md` + `test_cases.csv` (resolver order, a miss returns null, 404 rereads meta, an unmapped work has no fallback). Remove the obsolete anitabi cases and their traceability rows.

## Phase 2: remove anitabi from the UI (Codex)

- Delete: `anitabi-*.ts` (service, data-service, static-data, points, index, cross-index, image, runtime-coverage), `locality/anitabi-scene-projector.ts`, `libs/clients/anitabi-client.ts`, the two bundled anitabi JSON files, `components/pilgrimage/common/Anitabi{AttributionFooter,OriginCredit}.tsx`, `__tests__/integration/anitabi-live.test.ts`, and the `anitabi-*` unit tests. Update the other tests that mention anitabi to use Atlas fixtures, or delete them (don't bend product code to fit an old test).
- Images (rule 8, no fake data):
  - Work cover: Bangumi `api.bgm.tv/v0/subjects/<bgm>/image?type=common`, falling back to the anime's own AniList cover.
  - Spot rows **show no image**: the layout becomes episode badge + name + address + confidence.
  - `SpotImage` / `ReferenceThumbnail` / `OverlayLayer` no longer receive a remote scene image.
- Camera / compare: with no reference loaded, the main CTA becomes "Import a screenshot of this scene" (the existing `ImagePicker` flow). The spot card shows `Episode N · mm:ss` as a hint for which frame to grab. `compare/tips.tsx` / `align.tsx` / `preview.tsx` work from `referenceUri`.
- `identify.tsx` (trace.moe): the result's AniList/MAL id → resolver → spots with the same episode in that work. If none match, show only the trace.moe result.
- Credit pages: remove anitabi from `app/(setting)/attribution.tsx`, `NOTICE`, `README.md` and `CONTRIBUTING.md`. Add one line: "Pilgrimage data: Aniseekr Atlas."
- Confidence shown honestly: `unverified` gets a light label, and `scenes[].episodeBasis === 'reference'` is shown as "reference".
- All new strings go through `useT()` (en + zh-Hant).
- Final grep gate: `git grep -i anitabi -- app components hooks libs constants` = 0 hits (apart from the migration's comments/constants).

## Phase 3: migrating old records (Codex, **tdd**: user data)

`libs/services/pilgrimage/atlas/legacy-migration.ts`, run once (versioned flag in MMKV) on the first launch after the update:
- Scope: captures index v2, `visited-prefs`, `spot-intents`, `planned-trips`, check-ins (proximity).
- Each old spotId that has `animeId` + `spotGeo`: resolve the Atlas work for `animeId`, take that work's nearest spot within **≤50 m**, and **re-key** the record onto it.
- When there's no geo, no work, or nothing within 50 m: keep the record as is, mark it `legacy: true`, and show it in the album as "old spot".
- Clear `spotImage`, the anitabi URL. **Never delete a local photo file.**
- It must be idempotent and restartable halfway through. When two old spots map to the same new spot, merge them (captures stay newest-first).
- Failure modes listed first (red tests): no network (postpone, don't mark as done) / the work doesn't exist / 50 m boundary / merge conflict / crash halfway and rerun / photo file missing.

## Phase 4: restore the paywall (Codex, same build as phase 2)

- `FeatureFlags.PREMIUM_ENABLED = true`. Update the comment explaining why (anitabi is gone).
- Move raw English to `t()`: `settings.tsx:189` `'Premium only'` and `:423-424` `'Aniseekr Premium' / 'Unlock all themes, sync, no ads'`, plus the paywall sheet text (rule 11).
- Check that every flag-gated spot returns: `settings.tsx`, `profile.tsx`, `appearance.tsx`, `SubscriptionContext.tsx`, `PaywallSheet.tsx`, ads `adFree`.
- Before release, the product page must have **no anitabi traces** (gated by the phase 2 grep).

## Phase 5: app → web (Codex, small)

- Work detail (`app/(tabs)/pilgrimage/[animeId].tsx`) and trip page: add a secondary `ThemedButton`, "Open map & trip planner on the web" → `https://aniseekr.moe/{locale-prefix}/works/<key>?utm_source=app&utm_medium=work`. Locale prefix map: zh-Hant→`zh-tw`, zh-Hans→`zh-cn`, ja, ko, en=none. Opens with `expo-web-browser`.
- Only shown when the resolver found a key (an unmapped work never gets a dead link).

## Phase 6: web → app (Claude writes it, `aniseekr-landpage-atlas`)

- `/get` route: add `"/get"` to `run_worker_first`. The Worker reads the UA:
  - iPhone/iPod/iPad (UA) → 302 App Store
  - Android → 302 `play.google.com/store/apps/details?id=com.kidneyweakx.aniseekr`
  - Everything else → serve the static `/get` page
- Static `/get` page: client-side recheck for iPadOS (it reports a Mac UA, so detect `navigator.maxTouchPoints > 1`) → App Store. Desktop sees `StoreButtons` (both) + a QR code pointing at `aniseekr.moe/get`. Copy goes through the site's i18n, with locale-prefixed variants.
- `utm_*` / `ref` on `/get` are passed through to the store URL (App Store `ct`/`pt` campaign params; Play `referrer`).
- `SiteHeader.svelte` Download button → `/get`. `StoreButtons` stays both-stores on desktop; on mobile it shows only the device's store first.
- iOS Smart App Banner: `<meta name="apple-itunes-app" content="app-id=6755444960">` in `app.html`.
- Universal links / App Links are **not** in this round (they need entitlement + AASA + a new build; record as a follow-up).

## Grill (holes found before approval, folded into the plan)

1. **Seasons vs franchise.** For S2/S3, the anime's bgm/MAL id isn't in `works.bgm`, and an exact title match fails ("ゆるキャン△ SEASON2"). → The resolver adds one more step: walk the AniList `relations` PREQUEL chain (max 3 hops, cached) to the first season's id, then match again. Acceptance: in E2E, check 3 sequels (Yuru Camp S2, Bocchi, Love Live Sunshine S2). Record coverage numbers in result.md; don't fake a match.
2. **Spot id stability.** If Atlas changes ids between versions, users' records break. → Phase 0's build-data compares against the previous version and **fails the build** if an id disappears and has no entry in `moved.json`. As a safety net in the app, any record whose spotId can't be found goes through the same "nearest spot by geo" routine as phase 3 (reused, not written twice).
3. **Offline / first frame (rule 10).** Anitabi used to have a bundled index; Atlas is network-only. → Bundle a **snapshot of `works.json`** (~300 KB raw) as the frame-1 seed, then revalidate with SWR. Work files and spots-lite are network + cache. With no network and no cache → a real error state.
4. **392 spots have no location.** They don't appear on the map or in nearby; the list labels them "location unconfirmed". The migration's distance match skips them.
5. **Release order.** Paywall on + anitabi gone must ship in the **same build**. Phase 4 doesn't merge on its own.

## Order and gates

0 → 1 → 2 → 3 → 4 → (5 can run alongside 4) → release. Phase 6 doesn't depend on the app and can start right after phase 0. Every phase ends with a real run + `docs/e2e/2026-11-xx-<slug>/result.md` (`e2e-protocol`).

## Verification

- App (iPhone 18 Pro simulator, one only, shut down when finished):
  1. Hyouka work page shows Atlas spots, episode labels, no images, no "anitabi" text.
  2. Nearby (simulated location Takayama) lists spots.
  3. Camera: import a screenshot → overlay → capture → album.
  4. Install the old build first and create 2 captures + visited on anitabi spots → upgrade → migration matches them onto Atlas spots, photos intact, and an unmatched one shows "old spot".
  5. Settings/Profile show Premium, the paywall loads RevenueCat products (completing a sandbox purchase = UNVERIFIED unless there's a local StoreKit config).
  6. "Open on the web" goes to the right locale's `/works/hyouka`.
- `git grep -i anitabi` gate; `bun run typecheck && bun run lint && bun run test:unit && bun run spec:check` (lint is known to have pre-existing errors → scoped eslint on changed files).
- Web: `bun run verify`; under `wrangler dev`, `curl -A` with iPhone / Android / desktop UAs against `/get` → 302 / 302 / 200. Browser pane mobile preset screenshot. iPad desktop UA + touch → App Store.
- Review: `/code-review` the whole diff (migration = user data, so high).

## Follow-ups (outside this round)

- Expand Atlas per-season Bangumi/MAL ids (data side).
- Universal links / Android App Links (AASA + `assetlinks.json` + `associatedDomains`).
- Remove the anitabi pipeline and those 26 local atlas commits from Aniseekr-source (you said to do that with the app revamp).
