# Data-source auth + aggregation fallback hardening — aligned fix plan

**Date:** 2026-07-24
**Status:** Plan ready; implementation blocked on Codex workspace credits (Codex implements, Claude reviews).
**Inputs:** 3 Codex audits (auth/login, aggregation fallback, Shikimori vertical — third assembled from a partial run + Claude line-level verification). Baseline before any change: typecheck ✅, 1683 unit tests ✅, spec 219/219 ✅.

User-reported symptoms this plan addresses:
1. 登入問題 (login problems across platforms)
2. Shikimori 整條壞掉
3. 非 Jikan 源靠 AniList 委派的資料「有時候」沒出現、沒有保底

Hard constraint: **existing happy-path chain stays byte-identical in behavior.** All fixes are additive fallback/hardening. Spec workflow enforced for `libs/services/data-sources/` + `libs/repositories/`: new case_id → failing test → minimal implement → traceability update → `bun run spec:check`.

---

## Phase 1 — Shikimori login (verified, smallest blast radius)

| # | Fix | Where | Verified |
|---|-----|-------|----------|
| 1.1 | OAuth endpoints use dead domain `shikimori.io` → change authorize/token/apiBaseUrl to `https://shikimori.one` | `libs/services/auth/types.ts:155,156,159` | ✅ Claude, by inspection (client/provider already use `.one`) |
| 1.2 | Token exchange + refresh send no `User-Agent`; Shikimori rejects such requests → add per-platform header support in AuthService (UA string must match registered OAuth app name; reuse the client's `USER_AGENT`) | `libs/services/auth/auth-service.ts:178,310` | ✅ Claude |
| 1.3 | Rate limiter has only `minIntervalMs: 200` (5 rps) — add the 90/min window for shikimori | `libs/services/rate-limiter.ts:34` | ✅ Claude |

## Phase 2 — Auth core (breaks-login trio from auth audit)

| # | Fix | Where |
|---|-----|-------|
| 2.1 | Single-flight refresh: `Map<PlatformType, Promise<…>>` in-flight guard; critical for Shikimori single-use refresh tokens | `auth-service.ts:285` (refreshTokenIfNeeded) |
| 2.2 | Refresh failure semantics: network/5xx → keep creds + temporary failure; `invalid_grant`/invalid client → mark `reauth_required`, stop returning expired creds from `getValidCredentials()` | `auth-service.ts:275,313` |
| 2.3 | 401 → single-flight refresh → retry once → else reauth_required. Preserve HTTP status in provider errors first | `multi-platform-sync-service.ts:60,145`, `offline-queue-service.ts:203`, providers |
| 2.4 | `performOAuth` typed errors (cancel vs provider error vs state mismatch vs locked); success haptic only on non-null creds | `auth-service.ts:443`, `app/(setting)/account.tsx:83` |
| 2.5 | Post-connect profile fetch (username/avatar) + wire stored AniList token into legacy profile client | `user-repository.ts:39`, `platform-sync-service.ts:92` |
| 2.6 | Rehydrate `expiresAt` as Date on load; single-flight `initialize()`; `syncAll()` awaits init | `auth-service.ts:534,574`, `multi-platform-sync-service.ts:51` |

Auth layer is outside spec-enforced dirs (no AUTH case IDs exist) — still add unit tests; UserRepository/AnimeRepository touches need new case IDs.

## Phase 3 — Aggregation 保底 (the "sometimes missing" cluster)

Ordered by the aggregation audit's severity ranking; proposed case IDs from that report:

| # | Fix | Case IDs |
|---|-----|----------|
| 3.1 | **Provenance through navigation**: carry `sourcePlatform` + `anilistId`/`malId`/provider id through `Anime` → nav params → detail; provenance guard before treating a numeric ID as AniList; fallback detail lookup on verified-AniList miss | REPO-063, E2E-005/006 |
| 3.2 | **Bangumi enrichment loss**: `cloneWithChineseTitle` must preserve `broadcastDay`, `nextAiringEpisode`, `displayStatus`, `sortDate`, `isAdult` + both IDs (this is the literal "sometimes": only enrichment-success rows break) | BGM-010 |
| 3.3 | **Jikan media fallback on primary throw**: staff/relations/streaming/themes — catch eligible NOT_FOUND/NETWORK/SERVER/DECODING from primary, run existing Jikan helper; both-fail keeps current contract | REPO-067 |
| 3.4 | **Empty-list fallback**: known-unsupported provider/kind combos (Annict stubs, 200-empty genre) fall back like thrown errors; "all CJK variants failed" branch rethrows instead of resolving `[]` | REPO-065/066, ANNICT-007 |
| 3.5 | **Mapping-miss safety**: never send untranslated foreign ID to another provider; use embedded MAL/AniList ids first; Shikimori↔MAL identity without DB row; note REPO-032 currently pins the opposite behavior — spec case must be amended, not silently violated | REPO-068, IDM-019 |
| 3.6 | **Empty-result caching**: failure-derived `[]` not cached; `forceRefresh` bypasses QueryClient key | REPO-069 |
| 3.7 | **UI absence states**: per-kind unavailable/error status on detail; distinguish "no data" from "failed" (edge_cases.md:92 already requires this) | E2E-007 |
| 3.8 | Kitsu/Simkl genre honesty (no unfiltered popular/trending masquerading as genre results — also a Rule 8 issue); Annict image total-miss → Jikan by known MAL id | KITSU-007, SIMKL-007/008, ANNICT-008 |

Pre-existing traceability debt to reconcile first: tests use unregistered IDs (REPO-014, REPO-040..042, REPO-050, IDM-007..018) absent from test_cases.csv.

## Deferred / needs decision

- Static facade (search/trending/detail ignore active source) — HIGH but large blast radius; do after 3.1–3.2 prove out.
- `EXPO_PUBLIC_*` client secrets in bundle (rotate + PKCE/proxy) — security follow-up, separate track.
- expo-auth-session Basic-vs-body token exchange quirks per provider — needs live API verification (Codex DNS-blocked; Claude to verify when implementation resumes).

## Verification gate (every phase)

`bun run typecheck && bun run test:unit && bun run spec:check` + scoped `bunx eslint`/`bunx prettier -c` on changed files (repo-wide lint has ~887 pre-existing errors — do not use it as the gate). Shikimori login + one non-Jikan detail flow must be device-tested (Hermes runtime differences; see hermes-intl-runtime memory).
