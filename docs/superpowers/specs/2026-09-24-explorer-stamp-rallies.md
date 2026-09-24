# Explorer stamp rallies — Discover rail, ticket-style rally page, stamp book

Owner: **Codex implements, Claude reviews.** *(2026-09-24: Codex ran out of credits after the
PILG-061–063 tests; with the user's approval Claude finished the implementation and an
independent reviewer checked it. Deviations: `spec/` CSVs live under `docs/spec/`; leg distances
show metres below 1 km; the Maps action is an icon button; per-stop credits are hidden when they
repeat the rally's own source. The Journal
book shows at most 12 cells (stamped first) plus "+N"; rail cards omit the period (the state chip
carries it); the rally page keeps its hero and adds a ticket *stub* under it rather than a new
ticket header, so the organiser credit stays in the hero's attribution; components are
`RallyTicketStub`/`RallyRouteStopRow`/`PerforatedDivider`/`useStampRallyRows`.)* Branch `feat/explorer-stamp-rallies`
(already created in this checkout). Codex's sandbox cannot write `.git`: leave
all changes in the working tree and propose a commit breakdown; Claude commits.

## Why / decisions (user, 2026-09-24)

Stamp rallies (集章活動) already exist in the canonical locality model: 7 rallies
and 201 stops with verified coordinates. The rally detail screen already supports
manual check-in. But in Explorer mode they can only be reached through
Discover → tools menu → News → Events. The user wants them in the Explorer loop:

- **Look & feel**: a combination of two references.
  - The rally page reads like a **えきねっと (eki-net) ticket plus route
    diagram**: stops strung along a line like stations, and collected stops
    light up.
  - The Journal gets an **エキタグ-style stamp book** (one booklet per rally,
    stamps inked in as you collect them).
- **Placement**:
  - Explorer **Discover** gets a rally rail. Discover is the pilgrimage hub root;
    Explorer has no fixed Map tab, per
    `docs/superpowers/plans/2026-09-22-explorer-collector-ia.md`.
  - **Journal** gets the stamp book.
  - The **Map** already renders event markers that open the rally page, so the
    map is unchanged.
- **Timing**: build now on the existing bundled locality data. When the Atlas
  remote loader lands (P2), new rallies appear with no UI rework. So read only
  through the locality repository and event-detail helpers, never from bundled
  JSON directly.

## Mandatory rules (read before writing UI)

- Read `.claude/skills/ui-polish/SKILL.md` and CLAUDE.md UI rules 1–11 first.
  - `ThemedButton`, `ThemedText`, `ThemedSurface`, theme colours only.
  - Use `readableTextOn(theme.accent)` for any glyph drawn on an accent fill.
  - 44 pt touch targets, `hapticsBridge`, `useT()` for every string.
- Motion: use only `libs/animations/presets.ts` (e.g. `listItemEnter`,
  `Springs`); no ad-hoc durations.
- **Rule 8, no fake data**:
  - Distances between stops are **straight-line only**, labelled as such
    (`直線 1.2 km`). **No walking minutes, no routing, no transit times.** We
    have no routing data.
  - No placeholder rallies or stamps.
  - A rally with 0 stops renders an honest "stops not published" line.
- **Rule 9/10**:
  - Discover and Journal roots gain at most one new `useState` each (prefer
    zero); put the UI in child components.
  - Frame 1 is synchronous: repository reads plus `loadVisitedStampStopsSync()`,
    with no `await` before first paint.
  - Journal refreshes stamps on focus via the sync read; never show a skeleton
    for it.
- Hermes has **no `Intl.RelativeTimeFormat`**. Format dates with the existing
  helpers (`formatCalendarDate` in `components/pilgrimage/LocalityEventCalendar.tsx`
  or the i18n date utilities); don't add Intl-dependent code.
- Changes under `libs/services/pilgrimage/` fall under `docs/spec/agent.md`:
  - Add case_ids to `spec/test_cases.csv`.
  - Write failing tests first, then implement.
  - Update `spec/test_traceability.csv` to covered.
  - `bun run spec:check` must pass.

## 1. Pure derivations — `libs/services/pilgrimage/locality/stamp-rally.ts` (TDD)

Reuse the existing pieces:

- `getLocalityEventListRows(now)` (already sorts: active → upcoming →
  unannounced → ended)
- `getLocalityEventDetail(id)`
- `resolveEventDateState`
- `haversineKm` from `libs/services/pilgrimage/route-order.ts` (do **not** add
  another haversine)
- `StampStopVisitedMap` / `stampStopVisitedAtSync` from `visited-prefs.ts`

Functions:

- `buildRallyRoute(detail: LocalityEventDetail): RallyRouteStop[]`
  - Keep only `stamp_stop` stops, in the **order the repository returns them**
    (the published campaign order). Never reorder.
  - Each stop carries `legToNext: { straightLineKm: number } | null`, which is
    `null` for the last stop or when either `place.geo` is null.
- `summarizeRallyProgress(route, visited): { collected, total, complete }`.
- `selectDiscoverRallies(rows, limit = 10)`:
  - Include `category === 'stamp_rally'` rows whose state is `active` or
    `upcoming`.
  - Keep the incoming order and cap at `limit`.
  - Ended and unannounced rows are excluded.
- `buildStampBooks(rows, visitedAtFor: (roleId) => number | null)`:
  - Build one book per stamp rally with **≥1 collected stamp**.
  - Each stamp is `{ roleId, label (sourceLabel), collectedAt: number | null }`,
    in route order.
  - Books are sorted as follows:
    1. In progress (not complete) first; ties by most recent `collectedAt`.
    2. Complete next; ties by most recent `collectedAt`.
    3. Ended-and-incomplete last.
- `countJoinableRallies(rows)`: the number of active or upcoming stamp rallies,
  used for the Journal empty-state CTA.

Tests go in `__tests__/unit/pilgrimage/stamp-rally.test.ts`. Build fixtures on
the existing locality test helpers (see
`__tests__/unit/pilgrimage/locality-event-detail.test.ts`). Cover:

- Order is preserved.
- Legs are null at the end and when geo is missing.
- Distances are correct for two known coordinates (±0.05 km).
- Progress counting.
- Discover selection excludes ended and unannounced rows, keeps order and
  respects the cap.
- Book filter and sort rules.
- `collectedAt` passes through.

## 2. Discover rail — `components/pilgrimage/StampRallyRail.tsx`

Insert the rail in `app/(tabs)/pilgrimage/index.tsx`, after the nearby section
and before the 探索 (explore) section. It shows in Explorer and Seeker because
both use this hub.

- Header uses the same `SectionHeader` pattern: title `集章活動` and a
  "See all" CTA that opens `/pilgrimage/news` (it defaults to the Events tab).
- The rail is a horizontal list of **mini ticket cards** built on
  `ThemedSurface`:
  - Rally name (2 lines max).
  - `EventStateChip` (reuse `components/pilgrimage/detail/IntelEventBanner`).
  - Period.
  - Area (`primaryLocation`) and stop count.
  - When the user has ≥1 stamp: `3 / 8` plus a thin progress bar in accent.
  - A perforation detail (dashed divider with two notches, cut out in the page
    background colour) sells the ticket feel. Keep it subtle.
- Card press sends haptic `tap` and opens
  `buildPilgrimageEventDetailRoute(eventId, { name })`, so frame 1 has the
  title.
- When there are zero selectable rallies the rail **renders nothing** (no filler).
- `listItemEnter(index)` for card entry; FlatList/ScrollView horizontal with
  snap is fine.

## 3. Rally page restyle — `app/(tabs)/pilgrimage/event/[eventId].tsx`

Only for `category === 'stamp_rally'`. Festival and other layouts stay exactly
as they are. Extract new pieces into
`components/pilgrimage/rally/{RallyTicketHeader,RallyRouteList}.tsx`.

- **Ticket header** (`ThemedSurface variant="elevated"`):
  - Rally name.
  - Organiser (from provenance `sourceName`) and period with `EventStateChip`.
  - Large progress `3 / 8`, localized, e.g. `3 / 8 個集めた`.
  - A perforated divider (dashed line plus notches), then the existing primary
    actions (map / official link).
- **Route list** (the えきねっと-style diagram):
  - A vertical line (2 pt, `theme.glassBorder`). Segments between two collected
    stops are tinted `theme.accent`.
  - Node for a collected stop: accent-filled circle with a check glyph in
    `readableTextOn(accent)`, plus `LocalityMiniStamp` and the collected date.
  - Node for a stop not yet collected: hollow ring.
  - Each row has the exact published `sourceLabel`, the address if present, and
    the existing Google Maps action. The check-in toggle is a `ThemedButton
    size="sm"`: primary「スタンプを押した」when not collected, ghost「取り消す」
    when collected. Haptic `success` on collect and `selection` on undo. Keep
    the existing `checkInStampStop` / `checkOutStampStop` wiring.
  - Between nodes, when `legToNext` is non-null, show a caption `直線 {km} km`
    (one decimal). Otherwise show nothing.
- Keep the provenance/source credits block, the not-found state, and the map
  preview/markers.
- Accessibility:
  - Each node row has an accessibilityLabel of the form "{label}, collected on
    {date}" or "{label}, not collected".
  - The toggle's label states the action.

## 4. Journal stamp book — `components/pilgrimage/journal/StampBookSection.tsx`

Render it in `components/pilgrimage/screens/PilgrimageJournalScreen.tsx` after
the summary and before the capture folders.

- Section title `スタンプ帳`. One `ThemedSurface` card per book:
  - Header: name, `x / y`, and the state chip.
  - A grid of stamps, 4 per row on phones:
    - A collected stamp is an accent-filled circle with a slight **deterministic**
      tilt (`((index % 3) - 1) * 6deg`; never random), the label (1 line,
      truncated), and the date `M/D`.
    - An uncollected stamp is a dashed outline circle with its label in tone
      `tertiary`.
  - Tapping a book opens the rally page.
- Empty state (no books):
  - If `countJoinableRallies > 0`, show one compact row「まだスタンプがありません
    ・{n} 件の集章活動が開催中」with a CTA to `/pilgrimage/news`.
  - Otherwise render nothing.
- Data: sync read on mount, then re-read on focus (`useFocusEffect`, no await,
  guard against redundant `setState` when nothing changed).

## 5. i18n

- Add keys under `explorer.rally.*` and `explorer.stampBook.*` to
  `libs/i18n/locales/en.json` first, then `zh-Hant.json`. Add `ja.json` too if
  it already has the `news.events` keys.
- `__tests__/unit/i18n.test.ts` parity must pass.
- The Japanese examples above are copy intent. Write real en and zh-Hant
  strings; no raw literals in JSX.

## 6. Out of scope

- Map screen changes.
- Anything touching the Atlas backend.
- GPS-verified check-in (stays a manual self-report).
- New rallies/data.
- Route optimisation.

## Verify (Definition of done)

- `bun run typecheck && bun run test:unit && bun run spec:check` all green.
- Repo-wide lint is known-broken (pre-existing errors). Run **scoped**
  `bunx eslint <every touched/new file>` and `bunx prettier --check <same files>`
  and make both clean.
- Report back:
  1. Proposed commits: ordered, conventional message, exact paths; tests
     before implementation where it's logic.
  2. Output tails of the commands above.
  3. Deviations from this spec, with reasons.
  4. Anything you couldn't verify. Claude will run the simulator smoke test.
