# Aniseekr Expo — API Aggregation & Pilgrimage Spec (Sentrux)

## 0. Purpose

This spec defines the behavioral contract and quality gates for porting the iOS aniseeker
multi-platform anime aggregation layer to the React Native Expo app, plus integrating the
japanwalker anime pilgrimage (聖地巡礼) feature.

The **source of truth** for behavior is the iOS implementation at
`/Users/kidney/Workspace/Work/ani/aniseeker`. The spec is parity-driven: every TypeScript
data source must produce a `UnifiedAnimeItem` shaped identically (modulo language idioms)
to its Swift counterpart.

## 1. Scope

In-scope:

- 7 read-capable providers (AniList, MAL/Jikan, Bangumi, Annict, Kitsu, Shikimori, Simkl)
- Unified `AnimeDataSource` protocol covering search, detail, top, seasonal, by-genre, genres,
  staff, relations, streaming, themes, statistics
- `AnimeRepository` orchestrator: source resolution, query deduplication, disk caching,
  fallback to Jikan for media data, ID translation across platforms
- `UnifiedAnimeItem` model: merge logic, normalized score, image fallback chain, search keywords
- `DataSourceConfiguration` (browse source) + `DataSourceSwitchingCoordinator`
- `IDMappingService` cross-platform ID resolution
- Pilgrimage feature: Anitabi data fetcher, `AnimePilgrimageCard`, anime→spot linkage,
  pilgrimage detail route
- Full test coverage targeting parity tests, edge cases, integration smoke

Out-of-scope:

- Write providers (already partially implemented in `libs/services/providers/`); this spec
  supplements but does not replace them
- Full map/AR/navigation HUD from japanwalker (only data + card + simple list view)
- iOS-specific: AppIcon, StoreKit, CloudKit, push notifications

## 2. Mandatory Quality Gates

1. Spec Traceability Coverage: ≥ 90% (every active case in `test_cases.csv` mapped in `test_traceability.csv`)
2. Deterministic Test Pass Rate: 100%
3. Integration Smoke Pass Rate: 100% (real HTTP calls, allowed to skip in CI without network)
4. No Fake Test Rule: pass (no `expect(true).toBe(true)`, no permanently `.skip`'d tests, no empty `it()` bodies)
5. Mutation Score (Stryker, optional): ≥ 60% on `libs/services/providers/**` and `libs/repositories/**`
6. Sentrux Composite: ≥ 90

## 3. Sentrux Composite Score

```
Sentrux = 0.30 × SpecCoverage
        + 0.30 × DeterministicPassRate
        + 0.20 × IntegrationPassRate
        + 0.20 × MutationScore (or DeterministicPassRate when mutation skipped)
```

Weights differ from iOS spec (no benchmarks layer in TS port).

## 4. Execution Order

```
1. spec:check         → grep spec/ for malformed CSV, traceability holes
2. typecheck          → tsc --noEmit
3. lint               → eslint
4. test:unit          → bun test (deterministic only; mocks all HTTP)
5. test:integration   → bun test --integration (real network; skips on offline)
6. mutation (optional)→ stryker run
7. score              → calc_sentrux_score.sh
```

Fast loop = 1–4. Pre-merge = 1–5. Nightly = 1–6.

## 5. Test Layer Definitions

- **Deterministic** (`__tests__/unit/`): Pure logic. No fetch, no SQLite, no AsyncStorage. All
  external calls mocked. Each test under 50ms.
- **Integration** (`__tests__/integration/`): Real HTTP to public endpoints (AniList, Jikan,
  Bangumi, Anitabi). May hit SQLite (in-memory). Each test under 30s. Tagged with
  `@integration` and skipped when `process.env.SKIP_INTEGRATION === '1'`.
- **Parity** (`__tests__/parity/`): Same input → same output across providers. Snapshot-based
  for `UnifiedAnimeItem` shapes; static fixture inputs in `spec/fixtures/`.

## 6. Anti-Fake-Test Policy

The pipeline fails when any of the following is detected in `__tests__/**`:

- Tautological assertions: `expect(true).toBe(true)`, `expect(x).toBeDefined()` only
- Permanent skips: `it.skip(`, `describe.skip(` not gated by an env var with a TODO comment
- Empty test bodies: `it('...', () => {})`
- Fake markers: `// FAKE_TEST`, `// DUMMY_ASSERT`
- Tests that pass without invoking the SUT

## 7. Source of Truth

| Artifact | Path |
|---|---|
| Behavioral spec | `spec/SPEC.md` (this file) |
| Architecture | `spec/architecture.md` |
| API contracts | `spec/api_contracts.md` |
| Pilgrimage spec | `spec/pilgrimage_spec.md` |
| Provider matrix | `spec/provider_matrix.csv` |
| Test cases | `spec/test_cases.csv` |
| Traceability | `spec/test_traceability.csv` |
| Edge cases | `spec/edge_cases.md` |
| Mutation targets | `spec/mutation_targets.txt` |
| Mutation suites | `spec/mutation_test_suites.txt` |
| Test fixtures | `spec/fixtures/` |
| iOS reference | `/Users/kidney/Workspace/Work/ani/aniseeker` |
| Pilgrimage reference | `/Users/kidney/Workspace/Work/tokyowalker/japanwalker` |

## 8. Domain Codes

Used in `case_id` prefix (e.g., `UAI-001`):

| Code | Domain |
|---|---|
| UAI | UnifiedAnimeItem (merge, normalize, image, search keywords) |
| ADS | AnimeDataSource protocol + base behavior |
| REPO | AnimeRepository (resolveSource, queryClient, fallback) |
| DSCFG | DataSourceConfiguration (browse source, persistence) |
| DSSW | DataSourceSwitchingCoordinator (state machine) |
| QC | QueryClient (dedup, stale time) |
| CACHE | CacheService (TTL, eviction, SQLite-backed) |
| RL | RateLimiter (per-platform interval, cooldown, retry) |
| IDM | IDMappingService (mal↔anilist↔kitsu, batch, manual map) |
| ANIL | AniList provider |
| MAL | Jikan/MAL provider |
| BGM | Bangumi provider |
| ANNICT | Annict provider |
| KITSU | Kitsu provider |
| SHIK | Shikimori provider |
| SIMKL | Simkl provider |
| LOC | Localization (display title, fallback chain) |
| PILG | Pilgrimage (Anitabi service, card, anime linking) |
| SYNC | Multi-platform sync engine |
| E2E | End-to-end flow (search→detail→pilgrimage, browse switch) |

## 9. Versioning

This spec is at v1.0 (2026-04-28). Bump minor for additive cases, major for contract changes.
Provider behavior changes that break parity with iOS aniseeker → flag in the relevant case row's
`status` column and open a follow-up.
