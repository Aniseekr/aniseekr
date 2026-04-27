# Agent Instructions for Spec-Driven Implementation

## Overall Approach

Every code change in `libs/services/data-sources/`, `libs/repositories/`, or
`libs/services/pilgrimage/` MUST trace back to a `case_id` in `spec/test_cases.csv`
and have at least one test in `__tests__/` referenced from `spec/test_traceability.csv`.

Workflow per feature:

1. Read the relevant spec section (SPEC.md, architecture.md, api_contracts.md, pilgrimage_spec.md)
2. Identify case_ids from `test_cases.csv`
3. Write the failing tests first (red)
4. Implement the minimum code to pass (green)
5. Update `test_traceability.csv` to mark cases `pending → covered`
6. Refactor while keeping tests green

## Implementation Order (Dependency-Sorted)

1. **Foundation** (no dependencies):
   - `libs/services/rate-limiter.ts`
   - `libs/services/data-sources/data-source-error.ts`
   - `libs/models/unified-anime-item.ts`
   - `libs/models/platform-image-data.ts`
   - `libs/services/data-source-config.ts`

2. **Infrastructure** (depend on Foundation):
   - `libs/services/query-client.ts`
   - `libs/services/data-source-switching-coordinator.ts`
   - `libs/utils/season-utils.ts`
   - `libs/utils/chinese-converter.ts`
   - `libs/utils/anime-localization-service.ts`
   - Update `libs/services/cache-service.ts` if needed (existing)

3. **Clients** (HTTP/GraphQL only, no domain logic):
   - `libs/clients/bangumi-client.ts`
   - `libs/clients/annict-client.ts`
   - `libs/clients/kitsu-client.ts`
   - `libs/clients/shikimori-client.ts`
   - `libs/clients/simkl-client.ts`
   - `libs/clients/anitabi-client.ts`
   - (existing: `anilist-client.ts`, `jikan-client.ts` — refactor as needed)

4. **Data Sources** (one per platform, all parallel-safe):
   - `libs/services/data-sources/anime-data-source.ts` (protocol)
   - `libs/services/data-sources/anilist-data-source.ts`
   - `libs/services/data-sources/jikan-data-source.ts`
   - `libs/services/data-sources/bangumi-data-source.ts` (depends on AniList for delegation)
   - `libs/services/data-sources/annict-data-source.ts` (depends on AniList for image fallback)
   - `libs/services/data-sources/kitsu-data-source.ts`
   - `libs/services/data-sources/shikimori-data-source.ts`
   - `libs/services/data-sources/simkl-data-source.ts`

5. **Repository** (depends on all data sources):
   - `libs/repositories/anime-repository.ts` (rewrite/extend)

6. **Pilgrimage**:
   - `libs/services/pilgrimage/types.ts`
   - `libs/services/pilgrimage/anitabi-service.ts`
   - `libs/services/pilgrimage/pilgrimage-repository.ts`
   - `components/pilgrimage/AnimePilgrimageCard.tsx`
   - `components/pilgrimage/NearbyPilgrimageBadge.tsx`
   - `components/pilgrimage/PilgrimageSpotList.tsx`
   - `app/pilgrimage/[animeId].tsx`

7. **UI Wiring**:
   - Update `app/bangumi.tsx`, `app/index.tsx`, etc. to use new repository
   - Add `app/(setting)/data-source.tsx` for browse source picker
   - Hook `NearbyPilgrimageBadge` into anime detail/cards

## Test Conventions

- Test files: `__tests__/unit/<module>.test.ts` or `__tests__/integration/<module>.test.ts`
- Test name MUST start with the case_id: `it('UAI-020 normalizedScore divides anilist score over 10 by 10', ...)`
- Use `bun test` runner (see `package.json` scripts to be added)
- Mock `fetch` via `jest.spyOn(globalThis, 'fetch')` or equivalent
- Mock SQLite via in-memory `expo-sqlite` (or stub)
- Integration tests gate behind `if (process.env.SKIP_INTEGRATION === '1') return;`

## Naming Conventions

- Class names: `PascalCase`, suffix with role (e.g., `AniListDataSource`, `AnimeRepository`).
- File names: `kebab-case` matching class name (e.g., `anilist-data-source.ts`).
- Type/interface names: `PascalCase` (e.g., `UnifiedAnimeItem`, `AnitabiBangumi`).
- Constants: `SCREAMING_SNAKE_CASE`.
- Private members: prefix with `_` only if avoiding name collision.

## Imports

Use absolute paths from project root:
```ts
import { UnifiedAnimeItem } from '@/libs/models/unified-anime-item';
```

If absolute imports not yet configured, use relative `../../libs/...`.

## Error Handling

- Throw `DataSourceError` from data sources, never bare `Error`.
- Use `Result<T>` pattern (`{ ok: true, value } | { ok: false, error }`) only when
  callers need to branch — most paths just throw.
- Catch in repository for fallback (Jikan media fallback, AniList genres fallback).
- Surface to UI as user-friendly messages via Boundary components.

## Forbidden Patterns

- Direct provider HTTP calls from UI components — go through repository
- Module-level state (use singleton classes if needed, but make them testable)
- `any` type — use `unknown` and narrow
- `eval()`, `Function()` constructors
- Disabling tests without env-var gate
- Committing API keys (read from `process.env.EXPO_PUBLIC_*`)
