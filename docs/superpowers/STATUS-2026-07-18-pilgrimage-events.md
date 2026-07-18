# Status log — pilgrimage motion + events + locality re-design

Branch `feat/motion-unification` (base: main `b958da2`). Codex implements,
Claude aligns requirements + supplies web/geocoded data + reviews. Updated
2026-07-18.

## Overall stage

Foundation-first re-design in progress. **P1b is implemented but uncommitted**:
the canonical locality bundle now migrates every current source and existing
readers project through its loader/repository seam. The requested single batch
review remains deferred until the P1b → P2 → P3 → P5 chain is complete.
Repo-wide `bun run lint` stays broken with 887 pre-existing errors (not ours).

## COMMITTED (9 commits since main)

### Motion / animation unification

- `a2ad1bc` unify animation language, real bottom sheets, pilgrimage de-clutter
  — shared `libs/animations/presets.ts` (Springs + enter/exit presets),
  `components/themed/sheet/ThemedBottomSheet` (real drag-to-dismiss) replacing
  fake-grabber Modals, map FilterPills folded into the hub sheet header.
- `669b6fc` phase 3 — app-wide Skeleton loading, list stagger, real bottom
  sheets across bangumi/collection/profile/settings/rate.
- `ca1f1de` fix event rail explosion (image `height:'100%'` over an indefinite
  parent → pinned `height:112`) + added the collected ✓ badge on event cards.
- `0765b56` docs — recorded grilled ThemedBottomSheet Phase 4 decisions.

### News feed (parallel-session feature, then hardened)

- `9f61d0e` anime news feed + calendar rail redesign (built by a separate
  session; RSS sources, feed parser, news screen).
- `bfa98e6` Hermes-safe fixes — replaced `Intl.RelativeTimeFormat` (undefined in
  this Hermes → crash) with an i18n manual formatter; URL/image validation
  (block javascript:/relative); cache guard (empty parse no longer blanks a
  cached source for 30 min). See [[hermes-intl-runtime]].

### News hub tabs

- `acd2830` 活動 / 標籤 / 新聞 tabs (house ModeSelector); event tab reads
  `getHubRailEvents` (sync, rule 10); tag tab filters by anime; rule 8/10/11.

### Stamp rallies (real data)

- `301fe38` **7 real stamp-rally events, 201 geocoded spots.** StampSpot type +
  `LocalIntelEvent.stampSpots`. Rule 8: names/addresses from official sources,
  coords only from geocoding real addresses (GSI, prefecture-verified, 65/65) or
  an official Google My Maps. Rallies: Yuru Camp (26), Oarai GuP (8), JR Central
  LL Sunshine (9), Yohane (10), Jujutsu Nagoya (6), Watakon Chiyoda (6); the
  numazu-machiaruki (LL Sunshine) entry enriched with 136 My-Maps coords.

### anime88 poster fix

- `5922328` posters load direct `lain.bgm.tv` CDN (Claude resolved all 88 302s)
  instead of the rate-limited `api.bgm.tv` redirect that caused intermittent
  blanks; added an onError themed placeholder (rule 8). Also carries the
  re-design spec doc.

## IN PROGRESS — chained and uncommitted

- **P1a + P1b canonical locality model and migration** — 203 Places / 209
  bundled roles / 9 events / 124 coordinate-free Anime Tourism 88 area
  destinations / 1 guide / 17 news sources. All 11 original local-intel rows,
  7 rallies, and 201 stop memberships survive. Gamers Numazu is one reviewed
  Place with one shop + three stamp roles. Scenes project through the existing
  Anitabi detailed-points/grouping path and remain outside the bundle.
- **Reader cutover** — local-intel rails/hub/detail, Tourism88 rail/album/filter,
  news stream/follows/source screens, and 88 map-marker selection now read the
  canonical repository through compatibility projections. City centroids are
  not exact pins.
- Re-design spec: `docs/.../2026-07-18-locale-integrated-anime-events-redesign.md`
  (grilled decisions + gap-review findings → phase map).

## PLANNED (continue the uncommitted chain)

- **P2** event detail + integrated list (retire horizontal rail) + type-distinct
  map markers + **visible source attribution** + anime88 honest city areas (not
  fake precise pins).
- **P3** anime-styled month calendar tab in the 聖地資訊 hub.
- **P4** more JP anime events (Claude researches + geocodes; Codex integrates).
- **P5** anime-aesthetic polish pass.

## Key decisions on record

- Unified typed Spot/Place model; anime aesthetic = clean-JP + accents; calendar
  as a hub tab; JP-first source text OK; attribution required; foundation-first
  build order. Codex on `gpt-5.6-sol` + max effort. See
  [[codex-implements-claude-reviews]].
