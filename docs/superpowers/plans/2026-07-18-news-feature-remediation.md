# Anime News Feature Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the anime-news feed render on Expo Router + React Native/Hermes without first-render crashes, then harden the whole feature against mobile runtime assumptions and repo rule regressions.

**Architecture:** Keep the existing news architecture: screen-level orchestration in `app/(tabs)/pilgrimage/news/`, feature rows in `components/news/`, feed fetch/parse/cache services under `libs/services/news/`, and `RssClient` as the only network client. Fix the crash with manual i18n-backed relative-time formatting, not an Intl polyfill. Preserve the current pilgrimage event rail calendar redesign and its fixed `height: 112`.

**Tech Stack:** Expo Router, React Native, Hermes, Bun unit tests, repo i18n catalogs (`libs/i18n/locales/*.json`), MMKV-backed app storage, `expo-image`.

---

## Scope And Non-Goals

Production files audited:

- `app/(tabs)/pilgrimage/news/index.tsx`
- `app/(tabs)/pilgrimage/news/sources.tsx`
- `components/news/NewsArticleRow.tsx`
- `components/news/NewsSourceRow.tsx`
- `hooks/useNewsStream.ts`
- `libs/clients/rss-client.ts`
- `libs/services/news/feed-parser.ts`
- `libs/services/news/news-follows.ts`
- `libs/services/news/news-image.ts`
- `libs/services/news/news-sources.data.json`
- `libs/services/news/news-sources.ts`
- `libs/services/news/news-stream.ts`
- `libs/services/news/types.ts`
- Cross-check only: `components/pilgrimage/IntelEventsRail.tsx`, `libs/i18n/engine.ts`, `libs/i18n/locales/en.json`, `libs/i18n/locales/zh-Hant.json`, existing `__tests__/unit/news/*`.

Non-goals:

- Do not add an `Intl.RelativeTimeFormat` polyfill.
- Do not revert `components/pilgrimage/IntelEventsRail.tsx`; keep `styles.card.height = 112` at lines 178-184.
- Do not replace the whole feed architecture unless a targeted mobile-runtime fix cannot make it reliable.

## Runtime-Assumption Audit Matrix

| File | Evidence | Runtime finding |
|---|---|---|
| `app/(tabs)/pilgrimage/news/index.tsx` | `Linking.openURL(article.link)` at line 101; `new Intl.RelativeTimeFormat(...)` at line 116 | P0 full-Intl crash; P1 unvalidated feed URL opening. No DOM/web globals found in this file. |
| `app/(tabs)/pilgrimage/news/sources.tsx` | sync MMKV read via `useState(loadFollowedSourceIdsSync)` at line 29; write at line 39 | RN-safe first paint, but write errors are unhandled. No browser-only globals found. |
| `components/news/NewsArticleRow.tsx` | `expo-image` import at line 3; raw image source at lines 31-37; source name fallback at line 44 | RN-safe image component, but remote feed image URLs are unvalidated and source-name localization is incomplete. |
| `components/news/NewsSourceRow.tsx` | source name fallback at line 28; homepage rendered as data at line 39 | No browser-only globals found. Localized source data is not selected by language. |
| `hooks/useNewsStream.ts` | sync snapshot at line 40; `setTimeout(..., 0)` refresh at lines 59-64 | No browser-only globals found. First paint is mostly rule-10 compliant, with immediate background refresh risk. |
| `libs/clients/rss-client.ts` | `globalThis.fetch` at line 17; `AbortController` guard at line 25; request headers at line 36; `Date.parse` at line 76 | RN has `fetch`; guarded abort is safe. Hypothesis: setting `User-Agent` at line 36 may be ignored or rejected by some RN/native stacks, so verify on device. `Retry-After` date parsing has the same deterministic-date concern as feed parsing. |
| `libs/services/news/feed-parser.ts` | regex feed dispatch at lines 5-17; regex block/text/attr/image extraction at lines 96-143; `Date.parse` at lines 160-164 | No `DOMParser`, so it avoids a missing RN global. Risk is correctness: regex XML and platform date parsing can silently drop data. |
| `libs/services/news/news-follows.ts` | storage read/fallback at lines 27-35; storage write/listener notify at lines 38-42 | No browser-only globals found. Persistence failures are not represented in the API. |
| `libs/services/news/news-image.ts` | returns `{ uri: url }` at lines 1-3 | RN-compatible shape, but no URL validation, base URL resolution, proxy/header strategy, or error classification. |
| `libs/services/news/news-sources.data.json` | feed URLs and homepage URLs across lines 7-214; Natalie note says some datacenter IPs get 403 at lines 199-200 | Data is real curated source data. Network fragility is documented for at least one source; no implementation should assume every feed always succeeds. |
| `libs/services/news/news-sources.ts` | JSON `require` at lines 33-37; runtime hydration gate at lines 52-60 | Metro-compatible bundled JSON load. No browser-only globals found. |
| `libs/services/news/news-stream.ts` | fetches all followed sources at lines 46-66; catches per-source errors at lines 55-63; sorts by `publishedAt` at lines 97-99 | RN-safe service flow. Main risks are parser-empty caching and date-sort quality, not missing globals. |
| `libs/services/news/types.ts` | `NewsText` includes `ja`, `en`, `zhHant` at lines 1-5; `NewsArticle.link`/`thumbnailUrl` at lines 24-31 | Types expose enough data for localization and URL validation, but current callers do not fully use that shape. |

## Severity-Ranked Findings

### P0: First-render crash from Hermes-missing `Intl.RelativeTimeFormat`

Evidence:

- `app/(tabs)/pilgrimage/news/index.tsx:93-103` renders every cached/loaded article row and calls `relativeTime(article.publishedAt)` during render.
- `app/(tabs)/pilgrimage/news/index.tsx:110-119` implements `formatRelativeTime`, and line 116 constructs `new Intl.RelativeTimeFormat(language, { numeric: 'auto' })`.
- In this app's Hermes runtime, `Intl.DateTimeFormat` exists but `Intl.RelativeTimeFormat` is undefined. That makes the news screen crash as soon as there is at least one article.
- `libs/i18n/engine.ts:73-80` already supports `{count}` interpolation.
- `libs/i18n/locales/en.json:298-303` and `libs/i18n/locales/zh-Hant.json:298-303` already use the exact `{count}` relative-time pattern for onboarding backup timestamps.

Fix:

- Add `news.relative.justNow`, `news.relative.minutes`, `news.relative.hours`, `news.relative.days`, `news.relative.inMinutes`, `news.relative.inHours`, and `news.relative.inDays`.
- Add the keys to `libs/i18n/locales/en.json` first, then `libs/i18n/locales/zh-Hant.json`, per rule 11. Do not touch `zh-Hans.json` unless vocabulary genuinely differs; it falls back from `zh-Hant`.
- Replace `Intl.RelativeTimeFormat` with a manual formatter that computes `diffMs = Date.now() - publishedAt`, buckets by absolute age, and calls `t(key, { count })`.
- Keep `publishedAt <= 0` returning `t('news.undated')`.
- Handle future timestamps by using `news.relative.in*` keys when `diffMs < 0`; future dates can happen from feed clock skew or stricter date parsing falling back incorrectly.

Exact formatter shape:

```ts
function formatRelativeTime(publishedAt: number, t: ReturnType<typeof useT>): string {
  if (publishedAt <= 0) return t('news.undated');

  const diffMs = Date.now() - publishedAt;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return t('news.relative.justNow');

  const future = diffMs < 0;
  if (absMs < hour) {
    const count = Math.max(1, Math.round(absMs / minute));
    return t(future ? 'news.relative.inMinutes' : 'news.relative.minutes', { count });
  }
  if (absMs < day) {
    const count = Math.max(1, Math.round(absMs / hour));
    return t(future ? 'news.relative.inHours' : 'news.relative.hours', { count });
  }
  const count = Math.max(1, Math.round(absMs / day));
  return t(future ? 'news.relative.inDays' : 'news.relative.days', { count });
}
```

Exact English keys:

```json
"relative": {
  "justNow": "just now",
  "minutes": "{count}m ago",
  "hours": "{count}h ago",
  "days": "{count}d ago",
  "inMinutes": "in {count}m",
  "inHours": "in {count}h",
  "inDays": "in {count}d"
}
```

Exact Traditional Chinese keys:

```json
"relative": {
  "justNow": "剛剛",
  "minutes": "{count} 分鐘前",
  "hours": "{count} 小時前",
  "days": "{count} 天前",
  "inMinutes": "{count} 分鐘後",
  "inHours": "{count} 小時後",
  "inDays": "{count} 天後"
}
```

### P1: Article opening trusts feed URLs without validation or failure handling

Evidence:

- `app/(tabs)/pilgrimage/news/index.tsx:101` calls `Linking.openURL(article.link)` directly from feed data.
- `libs/services/news/feed-parser.ts:65-67` only checks that `link` is non-empty; it does not validate scheme, absolute URL shape, or `Linking.canOpenURL` compatibility.
- `components/news/NewsArticleRow.tsx:60-67` exposes the action as a normal button, so a bad feed link becomes a user-visible command.

Failure scenario:

- A malformed feed item with a relative URL, unsupported scheme, `javascript:` URL, or platform-rejected URL can reject `openURL`, no-op, or attempt an unsafe scheme. Because the handler is not `async`/guarded, the UI has no localized error path.

Fix:

- Add a small URL guard close to the screen or service boundary. Accept only `http:` and `https:` absolute URLs.
- Use `Linking.canOpenURL(url)` before `Linking.openURL(url)` and catch failures.
- If invalid/unopenable, keep the row visible and surface a localized non-fake error affordance, such as a transient alert/toast using new `news.openArticleFailed` / `news.invalidArticleUrl` keys.
- Consider filtering invalid links in `toArticle` only if there is a clear product decision that unopenable articles should not appear at all. The safer first remediation is to prevent unsafe opening while preserving feed visibility.

### P1: Feed date parsing relies on platform `Date.parse`

Evidence:

- `libs/services/news/feed-parser.ts:20-29` reads RSS `pubDate`.
- `libs/services/news/feed-parser.ts:32-41` reads Atom `updated` / `published`.
- `libs/services/news/feed-parser.ts:44-53` reads RDF `dc:date`.
- `libs/services/news/feed-parser.ts:160-164` implements `parseDate` as `Date.parse(value)` with fallback to `0`.
- Existing parser tests assert against Bun/Node parsing, not Hermes: `__tests__/unit/news/feed-parser.test.ts:22`, `:35`, and `:48`.

Failure scenario:

- React Native/Hermes date parsing is stricter and not guaranteed to match Bun/Node for real-world RFC-822 variants, timezone abbreviations, missing seconds, or non-ISO feed strings. Misparsed dates become `publishedAt = 0`, which sorts articles to the bottom (`libs/services/news/news-stream.ts:97-99`) and renders `news.undated`, or future dates can render misleading future relative labels.

Fix:

- Add a deterministic `parseFeedDate` helper instead of direct `Date.parse`.
- Support at minimum:
  - ISO-8601 with offset, already used by Atom/RDF fixtures.
  - RFC-822 / RFC-1123 day-date strings used by RSS fixtures.
  - Common numeric offset form (`+0900`) and `GMT`/`UTC`.
- Return `0` for truly unparseable strings.
- Add unit cases that assert fixed epoch values without using `Date.parse` as the expected-value oracle.

### P1: Feed XML parsing is regex-based and silently loses valid feed shapes

Evidence:

- `libs/services/news/feed-parser.ts:5-17` catches all parser errors and returns `[]`.
- `libs/services/news/feed-parser.ts:84-90` requires counted `<item>`/`<entry>` opens and closes before parsing.
- `libs/services/news/feed-parser.ts:96-107` extracts blocks/text with regular expressions.
- `libs/services/news/feed-parser.ts:134-143` extracts attributes and images with regular expressions.
- No `DOMParser` appears in the production news files; parsing is RN-safe from a global-availability standpoint, but it is not a real XML parser.
- `bun.lock` includes transitive `sax` / `xml2js`, but there is no direct production dependency in `package.json` verified from search. Treat adding one as a scoped decision, not as already available.

Failure scenario:

- Namespaced tags, self-closing Atom link variants, attributes with whitespace around `=`, uppercase tags, escaped CDATA edge cases, or valid feeds with no items yet can degrade to empty source results. Because `parseFeed` returns `[]` both for "valid empty feed" and "parser failed", `libs/services/news/news-stream.ts:51-54` caches the empty array as fresh for 30 minutes.

Fix:

- Short-term: harden the existing regex parser where tests show known live-feed misses, and change `refreshStream` to avoid replacing a non-empty cached source with `[]` when parser confidence is low.
- Better bounded fix: add a RN/Hermes-compatible XML parsing utility behind `parseFeed` if bundle size and compatibility are acceptable. Do not use browser `DOMParser`.
- Add tests for RSS/Atom/RDF edge fixtures observed from the real catalog before changing parser behavior.

### P1: Remote feed images are passed through raw and only hidden after load failure

Evidence:

- `libs/services/news/news-image.ts:1-3` returns `{ uri: url }` with no normalization, proxying, or headers.
- `components/news/NewsArticleRow.tsx:31-37` renders `expo-image` directly when `article.thumbnailUrl` is present and hides it only in `onError`.
- `libs/services/news/feed-parser.ts:28`, `:40`, and `:52` derive image URLs from feed media/enclosures/HTML descriptions.
- The event rail uses a specialized image helper, `anitabiImageSource(row.cover)` at `components/pilgrimage/IntelEventsRail.tsx:105-107`, while news does not.

Failure scenario:

- Some feed images may be relative URLs, hotlink-protected, require headers/cookies, or be blocked by WAF/CDN rules. News rows avoid fake image placeholders by hiding failed images, but they may still issue doomed requests and visually jump when `imageHidden` flips.

Fix:

- Validate image URLs before passing them to `expo-image`; only render absolute `http:`/`https:` thumbnails.
- Resolve relative thumbnail URLs against the article link or source homepage only if the feed gives enough real base data.
- If the existing app has a generic remote-image/proxy/header path, reuse it. Do not route arbitrary news images through Anitabi-specific `anitabiImageSource` unless its contract explicitly covers non-Anitabi hosts.
- Keep rule 8 behavior: failed image means no image/error state, never a generic plausible thumbnail.

### P2: Initial refresh can become expensive on first paint path

Evidence:

- `hooks/useNewsStream.ts:40` initializes `snapshot` synchronously from `getStreamSync`.
- `hooks/useNewsStream.ts:41` initializes `loading` from `snapshot.articles.length === 0`, which is good for warm cache.
- `hooks/useNewsStream.ts:59-64` schedules `refresh()` with `setTimeout(..., 0)` on mount/version changes.
- `libs/services/news/news-stream.ts:46-66` refreshes all followed sources with `Promise.all`.
- `libs/services/news/news-follows.ts:27-35` defaults to every recommended source when no follow-set exists.
- `libs/services/news/news-sources.data.json:14`, `:26`, `:38`, `:50`, `:63`, and `:75` mark six sources as recommended by default.

Failure scenario:

- There is no literal `await` before render, so rule 10 is mostly respected. But on a cold news tab, `setTimeout(..., 0)` can start six network fetches immediately after mount while the initial skeleton is still rendering. On lower-end devices this can compete with first interactions and image decode.

Fix:

- Keep sync cache first-paint behavior.
- Consider delaying background refresh until after first frame with `requestAnimationFrame` or a short idle-style delay, while still allowing pull-to-refresh immediately.
- Do not clear cached articles when refreshing.
- Add a smoke checklist item for tap-to-news first frame and pull-to-refresh behavior.

### P2: Localized source names are not selected by current app language

Evidence:

- `components/news/NewsArticleRow.tsx:41-45` displays `source.name.en ?? source.name.ja`.
- `components/news/NewsSourceRow.tsx:27-29` displays `source.name.en ?? source.name.ja`.
- `libs/services/news/types.ts:1-5` models source names as `{ ja, en?, zhHant? }`.
- `libs/services/news/news-sources.data.json:7-8`, `:19-20`, and many later entries include `zhHant` values.

Failure scenario:

- Traditional Chinese users see English source names even when curated `zhHant` names exist. This is not a crash, and source names are data rather than fixed UI chrome, but it is a rule 11/localization quality miss because the feature already has localized data.

Fix:

- Add a small `resolveNewsText(text, language)` helper mirroring existing project localization patterns.
- Use `zhHant` for `zh-Hant` / `zh-Hans` when present, `en` for English when present, otherwise `ja`.
- Keep article titles/excerpts as original feed data. Do not machine-translate or pretend article content has localized source translations.

### P2: Source follow persistence is fire-and-forget

Evidence:

- `app/(tabs)/pilgrimage/news/sources.tsx:33-40` optimistically updates React state and calls `saveFollowedSourceIds(next)` without try/catch.
- `libs/services/news/news-follows.ts:38-42` writes to storage via `kvSet` and notifies listeners.

Failure scenario:

- If MMKV/storage write throws, the sources screen can show a followed state that was not persisted, or crash the press handler.

Fix:

- Wrap `saveFollowedSourceIds` at the UI boundary or make the service return a success/failure result.
- On failure, restore the previous followed state and show a localized error.

### P3: Rule 1-4 style cleanup opportunities

Evidence:

- News UI correctly uses `ThemedButton`, `ThemedIconButton`, `ThemedText`, and `ThemedSurface` in `app/(tabs)/pilgrimage/news/index.tsx:35-54`, `:67-73`, `:80-89`, `components/news/NewsArticleRow.tsx:30`, `:42-67`, and `components/news/NewsSourceRow.tsx:24-47`.
- Theme colors are passed from `useTheme` instead of raw hex in `app/(tabs)/pilgrimage/news/index.tsx:32`, `:65-66`, `:78-79`; `components/news/NewsArticleRow.tsx:24`, `:42`, `:65`; and `components/news/NewsSourceRow.tsx:19`, `:31`.
- Raw numeric sizes exist in news rows: `components/news/NewsArticleRow.tsx:80-81`, `:99`; `components/news/NewsSourceRow.tsx:62`, `:73`.
- No raw hex literals were found in production news files.

Fix:

- Leave fixed image dimensions alone unless UI review says they are unstable; fixed thumbnail dimensions are legitimate layout constraints.
- Replace spacing literals like `gap: 4`, `paddingVertical: 3/4` with `Spacing` tokens if nearby components already have an equivalent token. This is low-priority because it does not cause the current crash.

## Rule Compliance Sweep

Rule 8: no fake data.

- Pass: article rows render `article.title`, `article.excerpt`, and `article.thumbnailUrl` from parsed feed data at `components/news/NewsArticleRow.tsx:31-37`, `:52-58`.
- Pass: error state shows real load failure copy and retry at `app/(tabs)/pilgrimage/news/index.tsx:64-74`.
- Pass: empty state says no articles and asks the user to follow sources at `app/(tabs)/pilgrimage/news/index.tsx:77-90`.
- Risk: failed image requests disappear after `onError` at `components/news/NewsArticleRow.tsx:36`; this is not fake data, but URL validation should prevent avoidable broken image requests.

Rule 10: first paint.

- Pass: `useNewsStream` initializes from sync cache at `hooks/useNewsStream.ts:40-41`.
- Pass: there is no `await` in the news screen render path at `app/(tabs)/pilgrimage/news/index.tsx:17-31`.
- Risk: immediate mount refresh via `setTimeout(..., 0)` at `hooks/useNewsStream.ts:59-64` starts multi-source network work (`news-stream.ts:46-66`) right after mount. Keep skeleton for cold load, but consider deferring refresh one frame.

Rule 11: strings via `t()`.

- Pass: fixed UI strings use `t()` in the news screens and rows: `app/(tabs)/pilgrimage/news/index.tsx:36`, `:43`, `:46`, `:50`, `:68`, `:71`, `:73`, `:81`, `:84`, `:87`; `app/(tabs)/pilgrimage/news/sources.tsx:49`, `:56`, `:59`, `:74`; `components/news/NewsArticleRow.tsx:61`; `components/news/NewsSourceRow.tsx:33`, `:43`.
- Fix needed: add relative-time keys to `en.json` first (`libs/i18n/locales/en.json:63-87` currently has `news` keys but no `news.relative`), then `zh-Hant.json` (`libs/i18n/locales/zh-Hant.json:63-87`).
- Data localization risk: source names ignore `zhHant` despite data support (`components/news/NewsArticleRow.tsx:44`, `components/news/NewsSourceRow.tsx:28`, `libs/services/news/types.ts:1-5`).

Rules 1-4: themed primitives, text, surfaces, colors.

- Pass overall: the feature uses themed buttons/text/surfaces and theme colors, with no raw hex literals found in production news files.
- Low-priority cleanup: replace raw spacing literals where easy (`components/news/NewsArticleRow.tsx:99`, `components/news/NewsSourceRow.tsx:62`, `:73`).

## Phased Remediation

### Phase 1: Stop The Crash

- [ ] Add `news.relative.*` keys to `libs/i18n/locales/en.json` first, immediately under the existing `news.undated` key at lines 63-87.
- [ ] Add the matching `news.relative.*` keys to `libs/i18n/locales/zh-Hant.json` at lines 63-87.
- [ ] Replace `formatRelativeTime` in `app/(tabs)/pilgrimage/news/index.tsx:110-119` with the manual bucket formatter above.
- [ ] Remove `language` from the relative formatter inputs if unused after the change; keep `useI18n()` only if another planned localization change in the same implementation phase needs it.
- [ ] Add unit coverage for the formatter. If the formatter remains local to the screen, extract it to a tiny testable module such as `libs/services/news/news-relative-time.ts` rather than testing React rendering for pure date math.
- [ ] Test cases:
  - `publishedAt <= 0` returns `news.undated`.
  - `< 60s` returns `news.relative.justNow`.
  - 2 minutes / 3 hours / 4 days in the past use `{count}` interpolation.
  - 2 minutes / 3 hours / 4 days in the future use `in*` keys.

### Phase 2: Harden Article Opening And Image Inputs

- [ ] Add a URL validator for feed-owned URLs, accepting only absolute `http:` and `https:` URLs.
- [ ] Use it before `Linking.openURL` at `app/(tabs)/pilgrimage/news/index.tsx:101`.
- [ ] Catch and localize open failures. Add `news.openArticleFailed` / `news.invalidArticleUrl` to `en.json` first and `zh-Hant.json` second if a visible message is used.
- [ ] Validate `article.thumbnailUrl` before `components/news/NewsArticleRow.tsx:31-37` renders `expo-image`.
- [ ] Update `newsImageSource` at `libs/services/news/news-image.ts:1-3` to return `null` for invalid images, or move validation into a helper with the same behavior.
- [ ] Add tests for valid `https`, valid `http`, relative URL, empty string, `javascript:`, and unsupported custom scheme.

### Phase 3: Make Feed Parsing Deterministic On RN

- [ ] Replace `Date.parse` at `libs/services/news/feed-parser.ts:160-164` with deterministic parsing for the supported feed date shapes.
- [ ] Update tests so expected epochs are numeric constants, not `Date.parse(...)` calls (`__tests__/unit/news/feed-parser.test.ts:22`, `:35`, `:48`).
- [ ] Add date fixtures for RFC-822 numeric offsets and common timezone names that live feeds actually emit.
- [ ] Add parser confidence semantics, or at least avoid caching parser-produced `[]` as a fresh success when the source had a stale non-empty cache and the feed body looked non-empty but unparsable.
- [ ] Keep the parser RN-safe: do not use browser `DOMParser`.

### Phase 4: Improve Localization And Persistence Resilience

- [ ] Add `resolveNewsText(text, language)` for `NewsText`.
- [ ] Use it in `components/news/NewsArticleRow.tsx:44` and `components/news/NewsSourceRow.tsx:28`.
- [ ] Keep article titles/excerpts unchanged because `components/news/NewsArticleRow.tsx:53` and `:57` are original feed data.
- [ ] Wrap follow persistence from `app/(tabs)/pilgrimage/news/sources.tsx:33-40` so `kvSet` failures do not leave false UI state.
- [ ] Add localized failure copy only if the UI surfaces persistence failure to the user.

### Phase 5: Verify Mobile Behavior And Preserve Event Rail

- [ ] Confirm `components/pilgrimage/IntelEventsRail.tsx:178-184` still uses definite `height: 112`, not `minHeight`.
- [ ] Add or update unit tests:
  - `news-relative-time.test.ts` for the manual formatter.
  - `feed-parser.test.ts` for deterministic feed date parsing and parser edge cases.
  - `news-image.test.ts` / URL helper tests for feed URL validation.
  - `news-stream.test.ts` for "source parser returns suspicious empty result with stale cache" if Phase 3 changes caching semantics.
- [ ] Run repo verification:

```bash
bun run typecheck
bun run lint
bun run test:unit
```

- [ ] Device/simulator smoke checklist:
  - Cold launch the app on iOS simulator/device with Hermes enabled.
  - Navigate to pilgrimage hub, then anime news.
  - Confirm the news screen first paint shows header and either cached rows, skeleton, empty, or error; no crash from relative time.
  - Pull to refresh; verify one failed source does not block other sources.
  - Tap "Manage sources"; follow/unfollow a source; return to news; verify the stream re-derives.
  - Tap an article with a valid URL; verify browser opens.
  - Inject or test a bad article URL; verify no crash and localized failure.
  - Confirm feed images either render real remote images or disappear/error gracefully without fake thumbnails.
  - Return to pilgrimage hub; verify the event rail cards remain 112px tall and the DateBlock calendar layout does not explode vertically.

## Implementation Touch Set

Exact files the implementation should touch:

- `app/(tabs)/pilgrimage/news/index.tsx`
- `app/(tabs)/pilgrimage/news/sources.tsx`
- `components/news/NewsArticleRow.tsx`
- `components/news/NewsSourceRow.tsx`
- `libs/clients/rss-client.ts` only if URL/date helper placement requires retry-date parsing cleanup
- `libs/services/news/feed-parser.ts`
- `libs/services/news/news-image.ts`
- `libs/services/news/news-stream.ts` only if parser-empty caching semantics change
- `libs/services/news/types.ts` only if adding parser confidence/result types
- `libs/services/news/news-relative-time.ts` if extracting the formatter for tests
- `libs/services/news/news-url.ts` if extracting URL validation for tests
- `libs/services/news/news-text.ts` if extracting localized `NewsText` resolution
- `libs/i18n/locales/en.json`
- `libs/i18n/locales/zh-Hant.json`
- `__tests__/unit/news/feed-parser.test.ts`
- `__tests__/unit/news/rss-client.test.ts` only if `Retry-After` date parsing changes
- `__tests__/unit/news/news-stream.test.ts` only if parser-empty caching semantics change
- `__tests__/unit/news/news-relative-time.test.ts`
- `__tests__/unit/news/news-url.test.ts`
- `__tests__/unit/news/news-image.test.ts` if image validation is separate from URL validation

Files explicitly not to touch for this remediation unless a regression is discovered during implementation:

- `components/pilgrimage/IntelEventsRail.tsx` except to verify `height: 112` remains present.
- `libs/i18n/locales/zh-Hans.json`, `ja.json`, `ko.json` unless a new key truly needs a non-fallback translation.
- `libs/services/news/news-sources.data.json` unless live-feed verification proves a catalog URL is wrong.
