# Codex task brief — Anime News Feed + Calendar Rail redesign

You are implementing a new feature in the aniseekr Expo/React Native repo. The
behavioral contract is already written — **`docs/spec/news_feed_spec.md` is
authoritative**; this brief orchestrates the work and pins the repo
conventions. Claude authored the spec, the source dataset, and the test-case
rows; you implement steps 1–4 below and leave the tree green. Claude will
review your output afterward.

## Non-negotiable repo rules

- **Read `CLAUDE.md` first.** UI rules 1–11 are mandatory: use `ThemedButton`/
  `ThemedIconButton`/`ThemedText`/`ThemedSurface`; colors only from
  `useTheme()` (zero raw hex), spacing/type from `constants/DesignSystem`
  tokens (zero raw `fontSize`); **Rule 8 no fake data**; **Rule 10** no
  `await` before first paint (seed `useState` from sync cache); **Rule 11**
  every UI string via `useT()` (`news.*` keys added to
  `libs/i18n/locales/en.json` FIRST, then `zh-Hant.json`), source/article
  text via the feed values.
- **Read `docs/spec/agent.md`.** Any change under `libs/services/**` follows
  spec → failing test (RED) → implement (GREEN) → update
  `docs/spec/test_traceability.csv` (`pending` → `covered`). Test names start
  with the case id (e.g. `it('NEWS-001 ...')`). No `any` (use `unknown` +
  narrow). No module-level mutable state EXCEPT the sanctioned lazy-loader
  pattern used by `libs/services/pilgrimage/local-intel/local-intel-repository.ts`
  (mirror it). Files kebab-case, types PascalCase.
- **Read `.claude/skills/ui-polish/SKILL.md`** before writing any screen/
  component. Skeletons are cold-load only; list-entry stagger
  `FadeInDown.delay(index*50).springify()`; touch targets ≥44.
- **Tests run via** `bun test --preload ./test-setup.ts <file>` (never raw
  `bun test`). The full gate is
  `bun run typecheck && bun run lint && bun run test:unit && bun run spec:check`.
- **Lint baseline:** the branch already has ~893 pre-existing lint errors
  unrelated to this work. Your bar is **do not add new ones** in files you
  touch (`bunx eslint <your files>` must be clean), not zero repo-wide.
- Never read/commit `secrets/`, `.env*`. Ignore root `build-*.aab`/`.ipa`.

## Already in place (do not recreate)

- `docs/spec/news_feed_spec.md` — the contract (§2 data model, §3 parser, §4
  sources, §5 follows, §6 rss-client, §7 stream, §8 UI, §9 rail, §10 cases).
- `libs/services/news/news-sources.data.json` — 17 live-verified sources
  (standard envelope). Do not edit the entries; consume it.
- `docs/spec/test_cases.csv` — NEWS-001..009 + PILG-052 rows.
- `docs/spec/test_traceability.csv` — NEWS-001..009 + PILG-052 as `pending`,
  pointing at the test files you will create (`__tests__/unit/news/*.test.ts`,
  `__tests__/unit/pilgrimage/event-date-block.test.ts`). Flip each to
  `covered` when its test is green.

## Patterns to mirror (read these before writing the parallel file)

| New file | Mirror |
|---|---|
| `libs/clients/rss-client.ts` | `libs/clients/anitabi-client.ts` (`static request<T>`: injectable `fetchImpl`, AbortController+30s, UA header, `rateLimiter.waitForAvailability`, `DataSourceError` normalization) |
| `libs/services/news/news-sources.ts` | `libs/services/pilgrimage/local-intel/local-intel-repository.ts` (lazy `require()` of `mod?.default ?? mod`, memoized build, `hydrateFromRuntime` + `hasSufficientRuntimeCoverage` guard + version counter + `subscribe`) |
| `libs/services/news/news-follows.ts` | `libs/services/pilgrimage/spot-intents.ts` (MMKV Record, `loadSync`, pure reducers, sanitize/migrate on read) |
| `libs/services/news/news-stream.ts` cache | `libs/services/cache-service.ts` (`getWithMeta`/`getSyncWithMeta`), pattern like `libs/services/pilgrimage/pilgrimage-hub-cache.ts` |
| `hooks/useNewsStream.ts` | `hooks/usePilgrimageDetailIntel.ts` (`useSyncExternalStore` over the version counter + sync cache seed) |
| news screens | `app/(tabs)/pilgrimage/plan.tsx` structure; `components/themed/Skeleton.tsx` `ListRow`; thumbnails via an `newsImageSource(url)` helper shaped like `libs/services/pilgrimage/anitabi-image.ts` `anitabiImageSource` |
| rail `deriveEventDateBlock` | `components/pilgrimage/detail/intel-format.ts` (`formatMonthLabel`); state type from `libs/services/pilgrimage/local-intel/event-schedule.ts` `EventDateState` |

`RateLimiterChannel` union + `DEFAULT_CHANNELS` live in
`libs/services/rate-limiter.ts` — add `'rss'` (minIntervalMs 250). Storage key
`NEWS_FOLLOWS_STORAGE_KEY = 'aniseekr.news.follows.v1'` goes in
`libs/services/storage/keys.ts`. `DataSourceError` codes are in
`libs/services/data-sources/data-source-error.ts`.

## Execution steps (each ends on a green gate)

1. **Parser (RED→GREEN, NEWS-001..004).** Create real XML fixtures under
   `__tests__/fixtures/news/` (short, truncated snippets — you may fabricate
   representative RSS2/Atom/RDF fixtures that exercise the spec §3 rules;
   they are test inputs, not shipped data). Write
   `__tests__/unit/news/feed-parser.test.ts` failing, then implement
   `libs/services/news/feed-parser.ts` (pure, no deps, never throws).
2. **Data + transport (RED→GREEN, NEWS-005..009).** `libs/services/news/types.ts`;
   failing tests → implement `news-sources.ts`, `news-follows.ts`,
   `news-stream.ts`, `libs/clients/rss-client.ts`, and the `'rss'` rate-limit
   channel. Follow-set default = recommended (spec §5); single-source failure
   isolation (spec §7) is load-bearing — test it.
3. **UI (behavior-check, not full TDD — UI glue).** `hooks/useNewsStream.ts`;
   `app/(tabs)/pilgrimage/news/index.tsx` (stream) +
   `app/(tabs)/pilgrimage/news/sources.tsx` (manage); a hub 探索-section entry
   point in `app/(tabs)/pilgrimage/index.tsx`; `components/news/*` rows/chips;
   `news.*` i18n keys en→zh-Hant. Rule 10 frame-1, Rule 11 strings,
   `Linking.openURL(article.link)` for articles.
4. **Calendar rail redesign (RED→GREEN for the helper, PILG-052).** Add pure
   `deriveEventDateBlock(state, language): EventDateBlock` (spec §9) with a
   failing `__tests__/unit/pilgrimage/event-date-block.test.ts`, then rebuild
   `components/pilgrimage/IntelEventsRail.tsx` around the date-block layout
   (left fixed date block: active=accent-filled, upcoming=tertiary bg +
   accent day, ongoing=常設, unannounced=muted 未定 + N月). Data layer
   (`getHubRailEvents`) unchanged. Add a `news.*`/`pilgrimageUi.*` "tomorrow"
   (明天) key if you introduce a day-before label. Run the `ui-polish`
   silkiness checklist.

## Definition of done (report this back)

- New/changed files list; which NEWS-/PILG-052 cases are green.
- `bun run typecheck` clean; `bunx eslint <touched files>` clean (no new
  errors); `bun run test:unit` all pass; `bun run spec:check` 100%.
- traceability rows flipped to `covered`.
- Do NOT commit — Claude reviews first. Leave the working tree with the
  changes staged-or-unstaged as-is.
