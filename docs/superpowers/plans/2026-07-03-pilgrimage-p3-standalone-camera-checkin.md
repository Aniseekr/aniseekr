# Pilgrimage P3 — Standalone Camera + Captures v2 + Check-in Implementation Plan

> **Agentic-workers note**: This plan is written to be executed by a coding agent one task at a time. Each task is independently committable (one `git commit` per task, no push). Do the steps in order; do not skip the "run to confirm fail" gates — they prove the test is real before you make it pass. Every file:line anchor below was verified against the `main`-branch checkout at `/Users/kidney/Workspace/Work/ani/aniseekr`; if a line has drifted, re-anchor by symbol name (the surrounding code excerpts are quoted).

**Goal**: Let users photograph pilgrimage scenes without first picking a spot, keep every shot at a spot (not just the latest), and make "check-in" (打卡 = visited + timestamp) the core action — all wired onto existing services, not rebuilt.

**Architecture**: Two local-first MMKV stores get a v2 schema with lazy v1→v2 migration (captures become per-spot arrays + a `free` bucket; visited gains epoch-ms timestamps behind a boolean-compatible view). A new thin `capture.tsx` route reuses the existing `CameraStage` engine + `ShutterRow`/`ZoomPresets`/`CameraScrim` chrome to shoot free captures, snapshot GPS once, save to the album, and offer a within-150 m mount suggestion by scanning already-cached Anitabi points. The album folder view and `SpotSheet` are extended to surface the new data.

**Tech Stack**: Expo Router (file-based), React Native, react-native-vision-camera v5 (via the neutral `CameraEngineHandle` seam), MMKV (`kvGet`/`kvSet`), SQLite `CacheService`, expo-location, expo-media-library, Reanimated `SharedValue`, `bun test` unit suite, TypeScript.

**Spec**: `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md` — Phase 3 table 3.1–3.5 (lines 170–182). Read it before starting.

---

## Deltas — where real code contradicted the outline (read first)

These were verified by reading source; the plan follows the real code, not the outline.

1. **`PilgrimageCapture` already carries the timestamp and geo the outline wanted to add.** `captures.ts:46` has `capturedAt: number` (required) and `captures.ts:52` has `userLocation?: CaptureGeoLocation` (`{latitude, longitude}`). The outline's proposed `takenAt?: number` / `geo?: [number,number]|null` are **redundant** — this plan reuses `capturedAt` as the timestamp and `userLocation` as the GPS snapshot. **No new fields on `PilgrimageCapture`.** (Free captures set `userLocation` from the one-shot fix, or omit it → honest "no location", which `album.tsx:1120` already renders as absent.)
2. **`CacheService.allKeys()` exists** (`cache-service.ts:414`, `Promise<string[]>`). The outline's open question ("查 CacheService 有無 list API；沒有就降級") is **resolved: yes**. The nearest-spot suggestion (3.2) scans keys with prefix `anitabi_points_v2_` and reads each. No degraded "free-bucket only" fallback is needed. Scope is honest: only animes whose detail the user has already opened are in that cache.
3. **The detail cache value is `AnitabiPoint[]`, not `AnitabiBangumi`.** `anitabi-service.ts:276` stores `fresh` (an `AnitabiPoint[]`) at `anitabi_points_v2_{bangumiId}`. Each point has `id`, `geo: [lat,lng]`, `name`, `image`, `ep`, `s`. The `animeId` comes from the **key suffix**, not the value.
4. **`loadCapturesSync()` keeps its `Record<spotId, latestCapture>` shape.** Its 3 consumers only need per-spot presence: `usePilgrimageInteractions.ts:65` (capture marker), `usePilgrimageHubData.ts:130` (count of distinct spots), `album.tsx:126`. To avoid touching the two hooks, `loadCapturesSync` stays returning the latest-per-spot map (a derived view over v2). The album switches to a new `loadAllCapturesSync()` / `loadCapturesV2Sync()`.
5. **`saveVisitedSpots(map: VisitedMap)` keeps its boolean-map signature.** It is the toggle write path (`usePilgrimageInteractions.ts:83,97`). Rather than reconstruct timestamps from a boolean diff, `saveVisitedSpots` **merges** the boolean map into the v2 timestamp store (preserve existing timestamps, stamp newly-true spots with `Date.now()`, drop absent spots). `VisitedMap` stays `Record<string,true>` for all ~12 typed consumers.
6. **`album.tsx` `CompareCard` is keyed on `entry.capture.spotId`** (`album.tsx:670,681`) and deletes with `clearCapture(spotId)` (`album.tsx:328`). With v2 multiple captures share a `spotId`, so the key must become per-capture (`${spotId}:${capturedAt}`) and delete must pass the uri: `clearCapture(spotId, uri)`.
7. **`SpotSheet` renders raw English literals** `"Visited"` / `"Scene"` / `` `${sceneCount} scenes` `` at `SpotSheet.tsx:322` (Rule 11 violation, pre-existing). Task 8 replaces the check-in label with `t()` keys as part of the button upgrade.

---

## Global Constraints

- **Tests**: run with `bun run test:unit` (whole suite) or a single file with `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/<file>.test.ts`. **Never** run bare `bun test` — it skips the native-module mocks in `test-setup.ts`, RN fails to parse, and the run hangs.
- **Type check**: `bunx tsc --noEmit`. Baseline noise is exactly 2 pre-existing `TS2882` errors about `global.css` — do not rely on a fully-clean tsc, but **add zero new errors**.
- **i18n (Rule 11)**: every new UI string is added to `libs/i18n/locales/en.json` **first** (TypeScript infers `TranslationKey` from it), then translated in `libs/i18n/locales/zh-Hant.json`. Never pass an English literal into `label=`/`<Text>`. `zh-Hans` auto-falls-back via OpenCC; `ja`/`ko` fall back to English. Interpolation uses `{name}` syntax.
- **Theme (Rule 4)**: colors come from `useTheme()` (`theme.accent`, `theme.background.*`, `theme.text.*`, `theme.glassBorder`, `theme.status.*`). No hardcoded hex except the documented camera-scrim exception (`ShutterRow`/`ZoomPresets`/`CameraChrome` rgba over the live preview) and brand source colors. Use `ThemedText`/`ThemedButton`/`ThemedSurface`/`ThemedIconButton` and `readableTextOn()` for text on accent fills.
- **Rule 8 (no fake data)**: a capture with no GPS fix stores `userLocation: undefined` and the album shows no location row — never a guessed coordinate. The mount suggestion only appears when a real cached point is within range; otherwise the capture silently stays in the free bucket. Nearest-spot scan returns `null` (no suggestion) rather than a plausible-looking one.
- **Rule 9 (state off the render path)**: camera zoom/exposure stay in `SharedValue`s passed to `CameraStage`; the per-session proximity-prompt de-dupe uses a `useRef<Set<string>>`, not state; capture-in-flight is a ref/local boolean in the smallest component. Do not add capture/HUD state to any existing route root.
- **Haptics (Rule 7)**: use `hapticsBridge` (`selection`/`tap`/`success`/`warning`). `ThemedButton`/`ShutterRow` already call the right one.
- **Commits**: one commit per task with the exact `git add` list shown. **Do not push.** Do not run any other git commands.

---

## Task 1 — Captures schema v2 (per-spot arrays + free bucket) with v1 migration (spec 3.1)

Highest-risk task #1. The v1→v2 migration is pinned with fixtures using the real v1 shape.

### Files
- **Modify** `libs/services/storage/keys.ts` — add `CAPTURES_STORAGE_KEY_V2` next to `CAPTURES_STORAGE_KEY` (line 19).
- **Modify** `libs/services/pilgrimage/captures.ts` — v2 index shape, lazy migration, new/updated read+write API. Current file: `Index { spots: Record<string, PilgrimageCapture> }` at :72-75; `loadSync` :92-98; `persist` :100-108; `loadCapturesSync` :111-113; `recordCapture` :115-119 (replaces per spot); `clearCapture` :129-135 (whole spot).
- **Test** `__tests__/unit/pilgrimage/captures.test.ts` — rewrite the "keeps only the latest" pin (behavior changes) and add v2/migration/free cases.

### Interfaces
Consumes (existing, unchanged):
- `kvGet(key: string): string | null`, `kvSet(key: string, value: string): void` from `../storage/app-storage` (`app-storage.ts:83,88`).
- `PilgrimageCapture` (`captures.ts:39-70`) — `spotId`, `uri`, `capturedAt`, `userLocation?`, `source?`, `animeId?`, `spotName?`, `spotImage?`, `spotGeo?`, … (unchanged).

Produces (relied on by later tasks + existing callers):
```ts
export const CAPTURES_STORAGE_KEY_V2: string; // '@aniseekr/pilgrimage/captures/v2'
export interface CapturesIndexV2 { spots: Record<string, PilgrimageCapture[]>; free: PilgrimageCapture[]; }

// Backwards-compatible: latest capture per spot (Task 4 delta #4 keeps hooks untouched).
export function loadCapturesSync(): Record<string, PilgrimageCapture>;

// New for the album (flat, newest-first) + raw v2 accessor.
export function loadCapturesV2Sync(): CapturesIndexV2;
export function loadAllCapturesSync(): PilgrimageCapture[]; // every spot capture + every free capture, newest-first

// Writes (all async, persist to v2):
export function recordCapture(capture: PilgrimageCapture): Promise<void>;      // APPEND to spots[spotId], newest-first
export function recordFreeCapture(capture: PilgrimageCapture): Promise<void>;  // APPEND to free, newest-first
export function clearCapture(spotId: string, uri?: string): Promise<void>;     // uri → remove one; else remove all for spot
export function clearFreeCapture(uri: string): Promise<void>;                  // remove one free capture by uri

// Kept for existing tests / callers:
export function listCaptures(): Promise<Record<string, PilgrimageCapture>>;    // latest-per-spot view
export function getCapture(spotId: string): Promise<PilgrimageCapture | null>; // latest for spot
export function __resetCapturesCacheForTests(): void;
```

### Steps

- [ ] **Write the failing test.** Replace `__tests__/unit/pilgrimage/captures.test.ts` with:

```ts
// Behavioural pin for the pilgrimage capture index (v2).
// - record appends multiple captures per spot (newest-first), not "latest only".
// - free captures live in their own bucket.
// - loadCapturesSync stays a latest-per-spot view (backwards-compat).
// - a v1 blob is lazily migrated: single capture -> length-1 array, free empty.

import { beforeEach, describe, expect, it } from 'bun:test';
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { CAPTURES_STORAGE_KEY } from '../../../libs/services/storage/keys';
import {
  clearCapture,
  clearFreeCapture,
  getCapture,
  listCaptures,
  loadAllCapturesSync,
  loadCapturesSync,
  loadCapturesV2Sync,
  recordCapture,
  recordFreeCapture,
  __resetCapturesCacheForTests,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';

function capture(spotId: string, uri = `file:///${spotId}.jpg`, capturedAt = 1_700_000_000_000): PilgrimageCapture {
  return { spotId, uri, capturedAt };
}

beforeEach(() => {
  appStorage.clearAll();
  __resetCapturesCacheForTests();
  __resetAppStorageForTests();
});

describe('pilgrimage captures v2', () => {
  it('returns an empty index when nothing is stored', async () => {
    expect(await listCaptures()).toEqual({});
    expect(loadCapturesSync()).toEqual({});
    expect(loadCapturesV2Sync()).toEqual({ spots: {}, free: [] });
    expect(loadAllCapturesSync()).toEqual([]);
  });

  it('appends multiple captures per spot, newest first', async () => {
    await recordCapture(capture('shrine', 'file:///a.jpg', 1));
    await recordCapture(capture('shrine', 'file:///b.jpg', 2));
    const v2 = loadCapturesV2Sync();
    expect(v2.spots.shrine.map((c) => c.uri)).toEqual(['file:///b.jpg', 'file:///a.jpg']);
    // Backwards-compat view keeps only the newest per spot.
    expect((await getCapture('shrine'))?.uri).toBe('file:///b.jpg');
    expect(Object.keys(loadCapturesSync())).toEqual(['shrine']);
  });

  it('stores free captures in their own bucket', async () => {
    await recordFreeCapture(capture('free-1', 'file:///f1.jpg', 5));
    await recordFreeCapture(capture('free-2', 'file:///f2.jpg', 6));
    const v2 = loadCapturesV2Sync();
    expect(v2.free.map((c) => c.uri)).toEqual(['file:///f2.jpg', 'file:///f1.jpg']);
    expect(v2.spots).toEqual({});
    // loadCapturesSync (per-spot view) does NOT surface free captures.
    expect(loadCapturesSync()).toEqual({});
    // flat loader includes both buckets.
    expect(loadAllCapturesSync().map((c) => c.uri)).toEqual(['file:///f2.jpg', 'file:///f1.jpg']);
  });

  it('clears one capture by uri, and the whole spot without a uri', async () => {
    await recordCapture(capture('shrine', 'file:///a.jpg', 1));
    await recordCapture(capture('shrine', 'file:///b.jpg', 2));
    await clearCapture('shrine', 'file:///a.jpg');
    expect(loadCapturesV2Sync().spots.shrine.map((c) => c.uri)).toEqual(['file:///b.jpg']);
    await clearCapture('shrine');
    expect(loadCapturesV2Sync().spots.shrine).toBeUndefined();
    expect(await getCapture('shrine')).toBeNull();
  });

  it('clears one free capture by uri', async () => {
    await recordFreeCapture(capture('free-1', 'file:///f1.jpg', 5));
    await recordFreeCapture(capture('free-2', 'file:///f2.jpg', 6));
    await clearFreeCapture('file:///f1.jpg');
    expect(loadCapturesV2Sync().free.map((c) => c.uri)).toEqual(['file:///f2.jpg']);
  });

  it('lazily migrates a v1 blob: single capture -> length-1 array, empty free', async () => {
    // Real v1 shape: { spots: Record<spotId, PilgrimageCapture> } under the v1 key.
    const v1 = { spots: { shrine: capture('shrine', 'file:///legacy.jpg', 42) } };
    appStorage.set(CAPTURES_STORAGE_KEY, JSON.stringify(v1));
    __resetCapturesCacheForTests();
    const v2 = loadCapturesV2Sync();
    expect(v2).toEqual({ spots: { shrine: [capture('shrine', 'file:///legacy.jpg', 42)] }, free: [] });
    expect((await getCapture('shrine'))?.uri).toBe('file:///legacy.jpg');
    // First write persists v2 and does not lose the migrated capture.
    await recordCapture(capture('shrine', 'file:///new.jpg', 43));
    expect(loadCapturesV2Sync().spots.shrine.map((c) => c.uri)).toEqual(['file:///new.jpg', 'file:///legacy.jpg']);
  });

  it('prefers v2 over a stale v1 blob when both exist', async () => {
    appStorage.set(CAPTURES_STORAGE_KEY, JSON.stringify({ spots: { shrine: capture('shrine', 'file:///v1.jpg', 1) } }));
    await recordCapture(capture('tower', 'file:///v2.jpg', 2)); // writes v2
    __resetCapturesCacheForTests();
    const v2 = loadCapturesV2Sync();
    expect(Object.keys(v2.spots)).toEqual(['tower']); // v1 ignored once v2 exists
  });
});
```

> Note: `appStorage.set(key, value)` is the MMKV mock's setter used across the suite (see `__tests__/unit/pilgrimage/visited-prefs.test.ts` pattern which uses `saveVisitedSpots`; the app-storage mock exposes `.set`). If `.set` is not available on the mock, use `kvSet` from `../../../libs/services/storage/app-storage` instead — verify by grepping the mock in `test-setup.ts` before running.

- [ ] **Run to confirm fail.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/captures.test.ts` → expect failures: `loadCapturesV2Sync`/`recordFreeCapture`/`clearFreeCapture`/`loadAllCapturesSync` are `not a function`, and the append/migration assertions fail against the current "latest-only" implementation.

- [ ] **Add the v2 key.** In `libs/services/storage/keys.ts`, directly under line 19:
```ts
export const CAPTURES_STORAGE_KEY = '@aniseekr/pilgrimage/captures/v1';
export const CAPTURES_STORAGE_KEY_V2 = '@aniseekr/pilgrimage/captures/v2';
```

- [ ] **Rewrite `libs/services/pilgrimage/captures.ts` storage layer.** Keep the `SensorSnapshot`/`CaptureGeoLocation`/`PilgrimageCapture` interfaces (lines 15-70) verbatim. Replace the `Index`/cache/read/write block (lines 72-140) with:

```ts
import { kvGet, kvSet } from '../storage/app-storage';
import { CAPTURES_STORAGE_KEY, CAPTURES_STORAGE_KEY_V2 } from '../storage/keys';

export { CAPTURES_STORAGE_KEY, CAPTURES_STORAGE_KEY_V2 };

export interface CapturesIndexV2 {
  /** spotId -> every capture at that spot, newest-first. */
  spots: Record<string, PilgrimageCapture[]>;
  /** Standalone captures taken without a spot (Phase 3 free camera), newest-first. */
  free: PilgrimageCapture[];
}

// Memoise the parsed v2 index against BOTH raw strings so a lazy v1→v2 read
// self-invalidates when either backing string changes.
let cache: { rawV2: string | null; rawV1: string | null; index: CapturesIndexV2 } | null = null;

function sanitizeArray(value: unknown): PilgrimageCapture[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (c): c is PilgrimageCapture =>
      Boolean(c) && typeof c === 'object' && typeof (c as PilgrimageCapture).uri === 'string'
  );
}

/** Parse a stored v2 blob. Returns null if the string isn't a v2 index. */
function parseV2(raw: string | null): CapturesIndexV2 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CapturesIndexV2>;
    if (!parsed || typeof parsed !== 'object' || !parsed.spots) return null;
    const spots: Record<string, PilgrimageCapture[]> = {};
    for (const [k, v] of Object.entries(parsed.spots)) {
      const arr = sanitizeArray(v);
      if (arr.length > 0) spots[k] = arr;
    }
    return { spots, free: sanitizeArray(parsed.free) };
  } catch {
    return null;
  }
}

/** Migrate the real v1 shape `{ spots: Record<spotId, PilgrimageCapture> }` → v2. */
function migrateV1(raw: string | null): CapturesIndexV2 {
  if (!raw) return { spots: {}, free: [] };
  try {
    const parsed = JSON.parse(raw) as { spots?: Record<string, PilgrimageCapture> };
    const spots: Record<string, PilgrimageCapture[]> = {};
    if (parsed?.spots && typeof parsed.spots === 'object') {
      for (const [k, v] of Object.entries(parsed.spots)) {
        if (v && typeof v === 'object' && typeof (v as PilgrimageCapture).uri === 'string') {
          spots[k] = [v as PilgrimageCapture];
        }
      }
    }
    return { spots, free: [] };
  } catch {
    return { spots: {}, free: [] };
  }
}

function loadV2(): CapturesIndexV2 {
  const rawV2 = kvGet(CAPTURES_STORAGE_KEY_V2);
  const rawV1 = kvGet(CAPTURES_STORAGE_KEY);
  if (cache && cache.rawV2 === rawV2 && cache.rawV1 === rawV1) return cache.index;
  const index = parseV2(rawV2) ?? migrateV1(rawV1);
  cache = { rawV2, rawV1, index };
  return index;
}

function persist(idx: CapturesIndexV2): void {
  try {
    const rawV2 = JSON.stringify(idx);
    kvSet(CAPTURES_STORAGE_KEY_V2, rawV2);
    cache = { rawV2, rawV1: kvGet(CAPTURES_STORAGE_KEY), index: idx };
  } catch {
    // best-effort; ignore
  }
}

/** Raw v2 index (spots arrays + free bucket). */
export function loadCapturesV2Sync(): CapturesIndexV2 {
  return loadV2();
}

/** Latest capture per spot — backwards-compatible view for markers/counts. */
export function loadCapturesSync(): Record<string, PilgrimageCapture> {
  const { spots } = loadV2();
  const out: Record<string, PilgrimageCapture> = {};
  for (const [spotId, arr] of Object.entries(spots)) {
    if (arr.length > 0) out[spotId] = arr[0]; // arrays are newest-first
  }
  return out;
}

/** Every capture (all spots + free), newest-first. For the album. */
export function loadAllCapturesSync(): PilgrimageCapture[] {
  const { spots, free } = loadV2();
  const all: PilgrimageCapture[] = [];
  for (const arr of Object.values(spots)) all.push(...arr);
  all.push(...free);
  return all.sort((a, b) => b.capturedAt - a.capturedAt);
}

export async function recordCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadV2();
  const existing = idx.spots[capture.spotId] ?? [];
  const next: CapturesIndexV2 = {
    spots: { ...idx.spots, [capture.spotId]: [capture, ...existing] },
    free: idx.free,
  };
  persist(next);
}

export async function recordFreeCapture(capture: PilgrimageCapture): Promise<void> {
  const idx = loadV2();
  persist({ spots: idx.spots, free: [capture, ...idx.free] });
}

export async function listCaptures(): Promise<Record<string, PilgrimageCapture>> {
  return loadCapturesSync();
}

export async function getCapture(spotId: string): Promise<PilgrimageCapture | null> {
  const arr = loadV2().spots[spotId];
  return arr && arr.length > 0 ? arr[0] : null;
}

export async function clearCapture(spotId: string, uri?: string): Promise<void> {
  const idx = loadV2();
  const arr = idx.spots[spotId];
  if (!arr) return;
  const nextSpots = { ...idx.spots };
  if (uri) {
    const filtered = arr.filter((c) => c.uri !== uri);
    if (filtered.length > 0) nextSpots[spotId] = filtered;
    else delete nextSpots[spotId];
  } else {
    delete nextSpots[spotId];
  }
  persist({ spots: nextSpots, free: idx.free });
}

export async function clearFreeCapture(uri: string): Promise<void> {
  const idx = loadV2();
  const nextFree = idx.free.filter((c) => c.uri !== uri);
  if (nextFree.length === idx.free.length) return;
  persist({ spots: idx.spots, free: nextFree });
}

/** Test-only — drop the memoised index. */
export function __resetCapturesCacheForTests(): void {
  cache = null;
}
```

- [ ] **Run to confirm pass.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/captures.test.ts` → all green.
- [ ] **Type check.** `bunx tsc --noEmit` → no new errors (only the 2 baseline `global.css` ones).
- [ ] **Full suite sanity.** `bun run test:unit` → still green (confirms `usePilgrimageInteractions`/`usePilgrimageHubData`/`album` callers of `loadCapturesSync`/`recordCapture`/`clearCapture` still compile against the new signatures; `clearCapture(spotId)` remains valid because `uri` is optional).
- [ ] **Commit.** `git add libs/services/storage/keys.ts libs/services/pilgrimage/captures.ts __tests__/unit/pilgrimage/captures.test.ts` then `git commit -m "feat(pilgrimage): captures schema v2 — per-spot arrays + free bucket, v1 migration"`.

---

## Task 2 — Visited timestamps v2 (打卡) with v1 migration (spec 3.3, data half)

Highest-risk task #2. The v1→v2 migration (`true` → `0` = "visited before timestamps existed") is pinned with fixtures.

### Files
- **Modify** `libs/services/storage/keys.ts` — add `VISITED_SPOTS_STORAGE_KEY_V2` next to line 17.
- **Modify** `libs/services/pilgrimage/visited-prefs.ts` — v2 timestamp store, boolean-compatible view, merge-on-save, new timestamp accessors. Current: `VisitedMap = Record<string,true>` (:13); `sanitizeVisited` (:15-22); `loadVisitedSpotsSync` (:25-34); `loadVisitedSpots` (:37-39); `saveVisitedSpots` (:41-47).
- **Test** `__tests__/unit/pilgrimage/visited-prefs.test.ts` — add v2/migration/timestamp cases (keep existing boolean pins green).

### Interfaces
Consumes: `kvGet`/`kvSet` (`app-storage.ts:83,88`); `Logger` (`../../utils/logger`).
Produces:
```ts
export const VISITED_SPOTS_STORAGE_KEY_V2: string; // 'aniseekr.pilgrimage.visited.v2'
export type VisitedMap = Record<string, true>;                 // UNCHANGED — boolean view for all consumers
export type VisitedAtMap = Record<string, number>;             // spotId -> epoch ms (0 = migrated pre-timestamp)

export function loadVisitedSpotsSync(): VisitedMap;            // boolean view derived from v2 (or migrated v1)
export function loadVisitedSpots(): Promise<VisitedMap>;
export function saveVisitedSpots(map: VisitedMap): Promise<void>; // MERGE into v2 timestamp store (delta #5)
export function loadVisitedAtSync(): VisitedAtMap;            // NEW — full timestamp map
export function visitedAtSync(spotId: string): number | null; // NEW — timestamp for one spot, null if not visited
```

### Steps

- [ ] **Write the failing test.** Append to `__tests__/unit/pilgrimage/visited-prefs.test.ts` (keep lines 1-42; add imports + a new `describe`):

Update the import block at the top to add the new symbols and the key:
```ts
import { appStorage, __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';
import { VISITED_SPOTS_STORAGE_KEY } from '../../../libs/services/storage/keys';
import {
  loadVisitedSpots,
  loadVisitedSpotsSync,
  saveVisitedSpots,
  loadVisitedAtSync,
  visitedAtSync,
} from '../../../libs/services/pilgrimage/visited-prefs';
```

Then append this block after the existing `describe('visited spots persistence', …)`:
```ts
describe('visited timestamps v2 (打卡)', () => {
  it('records an epoch-ms timestamp for a freshly-visited spot', async () => {
    const before = Date.now();
    await saveVisitedSpots({ spotA: true });
    const at = visitedAtSync('spotA');
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(before);
    // boolean view still works for legacy consumers
    expect(loadVisitedSpotsSync()).toEqual({ spotA: true });
  });

  it('preserves an existing timestamp when the same spot stays visited', async () => {
    await saveVisitedSpots({ spotA: true });
    const first = visitedAtSync('spotA');
    await new Promise((r) => setTimeout(r, 2));
    await saveVisitedSpots({ spotA: true, spotB: true }); // spotA unchanged, spotB new
    expect(visitedAtSync('spotA')).toBe(first);           // NOT re-stamped
    expect(visitedAtSync('spotB')).not.toBeNull();
  });

  it('drops a spot (and its timestamp) when it is removed from the map', async () => {
    await saveVisitedSpots({ spotA: true, spotB: true });
    await saveVisitedSpots({ spotA: true }); // spotB toggled off
    expect(visitedAtSync('spotB')).toBeNull();
    expect(loadVisitedSpotsSync()).toEqual({ spotA: true });
  });

  it('lazily migrates a v1 blob: Record<spotId,true> -> timestamp 0', async () => {
    // Real v1 shape under the v1 key.
    appStorage.set(VISITED_SPOTS_STORAGE_KEY, JSON.stringify({ old1: true, old2: true }));
    expect(loadVisitedAtSync()).toEqual({ old1: 0, old2: 0 }); // 0 = "visited before we stored time"
    expect(loadVisitedSpotsSync()).toEqual({ old1: true, old2: true });
    expect(visitedAtSync('old1')).toBe(0);
  });

  it('keeps migrated 0-timestamps unless the spot is re-checked-in', async () => {
    appStorage.set(VISITED_SPOTS_STORAGE_KEY, JSON.stringify({ old1: true }));
    await saveVisitedSpots({ old1: true, new1: true }); // old1 already 0 -> stays 0; new1 stamped
    expect(visitedAtSync('old1')).toBe(0);
    expect(visitedAtSync('new1')).toBeGreaterThan(0);
  });
});
```

- [ ] **Run to confirm fail.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/visited-prefs.test.ts` → `loadVisitedAtSync`/`visitedAtSync` are `not a function`; timestamp assertions fail.

- [ ] **Add the v2 key.** In `libs/services/storage/keys.ts`, directly under line 17:
```ts
export const VISITED_SPOTS_STORAGE_KEY = 'aniseekr.pilgrimage.visited.v1';
export const VISITED_SPOTS_STORAGE_KEY_V2 = 'aniseekr.pilgrimage.visited.v2';
```

- [ ] **Rewrite `libs/services/pilgrimage/visited-prefs.ts`.** Replace the whole file body below the header comment with:

```ts
import { kvGet, kvSet } from '../storage/app-storage';
import { VISITED_SPOTS_STORAGE_KEY, VISITED_SPOTS_STORAGE_KEY_V2 } from '../storage/keys';
import { Logger } from '../../utils/logger';

/** Boolean view — unchanged public type consumed across the pilgrimage UI. */
export type VisitedMap = Record<string, true>;
/** spotId -> epoch ms of check-in. `0` marks a spot migrated from v1 (time unknown). */
export type VisitedAtMap = Record<string, number>;

function sanitizeAt(parsed: unknown): VisitedAtMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: VisitedAtMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Migrate the v1 `Record<spotId, true>` blob -> timestamp map with 0 sentinels. */
function migrateV1(raw: string | null): VisitedAtMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: VisitedAtMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v === true) out[k] = 0; // honest: visited, timestamp unknown
    }
    return out;
  } catch {
    return {};
  }
}

/** Read the v2 timestamp map, lazily deriving from v1 when v2 is absent. Pure (no write). */
export function loadVisitedAtSync(): VisitedAtMap {
  try {
    const rawV2 = kvGet(VISITED_SPOTS_STORAGE_KEY_V2);
    if (rawV2) return sanitizeAt(JSON.parse(rawV2));
    return migrateV1(kvGet(VISITED_SPOTS_STORAGE_KEY));
  } catch (err) {
    Logger.warn('[VisitedPrefs] load failed, returning empty', err);
    return {};
  }
}

export function visitedAtSync(spotId: string): number | null {
  const map = loadVisitedAtSync();
  return spotId in map ? map[spotId] : null;
}

/** Boolean view for first-paint seeding — derived from the timestamp map. */
export function loadVisitedSpotsSync(): VisitedMap {
  const at = loadVisitedAtSync();
  const out: VisitedMap = {};
  for (const k of Object.keys(at)) out[k] = true;
  return out;
}

export async function loadVisitedSpots(): Promise<VisitedMap> {
  return loadVisitedSpotsSync();
}

/**
 * Merge a boolean map into the v2 timestamp store: keep existing timestamps for
 * spots that stay visited, stamp newly-true spots with now, drop absent spots.
 * (Delta #5 — the toggle write path passes a full boolean map and must not lose
 * or falsify timestamps.)
 */
export async function saveVisitedSpots(map: VisitedMap): Promise<void> {
  try {
    const prev = loadVisitedAtSync();
    const now = Date.now();
    const next: VisitedAtMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (v !== true) continue;
      next[k] = k in prev ? prev[k] : now; // preserve or stamp
    }
    kvSet(VISITED_SPOTS_STORAGE_KEY_V2, JSON.stringify(next));
  } catch (err) {
    Logger.warn('[VisitedPrefs] save failed', err);
  }
}
```

- [ ] **Run to confirm pass.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/visited-prefs.test.ts` → all green (existing boolean pins + new timestamp pins).
- [ ] **Type check.** `bunx tsc --noEmit` → no new errors. (All ~12 `VisitedMap` consumers still compile; the type is unchanged.)
- [ ] **Full suite.** `bun run test:unit` → green.
- [ ] **Commit.** `git add libs/services/storage/keys.ts libs/services/pilgrimage/visited-prefs.ts __tests__/unit/pilgrimage/visited-prefs.test.ts` then `git commit -m "feat(pilgrimage): visited prefs v2 — epoch-ms check-in timestamps with v1 migration"`.

---

## Task 3 — Album entries: free-bucket branch (spec 3.4, service half)

### Files
- **Modify** `libs/services/pilgrimage/album-captures.ts` — accept a `free` list, emit free-folder entries. Current: `buildPilgrimageAlbumEntries({ captures, animes })` :23-45; discard guard :58-67; `PilgrimageAlbumEntry` :4-9.
- **Test** `__tests__/unit/pilgrimage/album-captures.test.ts` — add free-branch cases (keep existing `getCaptureFrameMatchPercent`/known-spot pins).

### Interfaces
Consumes: `PilgrimageCapture` (Task 1), `AnitabiBangumi`/`AnitabiPoint` (`./types`).
Produces:
```ts
export const FREE_FOLDER_ANIME_ID = -1; // reserved synthetic anime id for the "自由拍攝" folder
export interface PilgrimageAlbumEntry { capture; spot; anime; matchPercent; isFree?: boolean; } // + isFree flag
export function buildPilgrimageAlbumEntries(input: {
  captures: readonly PilgrimageCapture[];
  free?: readonly PilgrimageCapture[];
  animes: readonly AnitabiBangumi[];
}): PilgrimageAlbumEntry[];
```

### Steps

- [ ] **Write the failing test.** Append to `__tests__/unit/pilgrimage/album-captures.test.ts`:
```ts
import { buildPilgrimageAlbumEntries, FREE_FOLDER_ANIME_ID } from '../../../libs/services/pilgrimage/album-captures';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';

describe('free-bucket album entries', () => {
  const free: PilgrimageCapture = {
    spotId: 'free-1', uri: 'file:///free.jpg', capturedAt: 100, source: 'camera',
    userLocation: { latitude: 35.1, longitude: 139.2 },
  };

  it('emits a free-folder entry for a free capture (no reference scene)', () => {
    const entries = buildPilgrimageAlbumEntries({ captures: [], free: [free], animes: [] });
    expect(entries).toHaveLength(1);
    expect(entries[0].isFree).toBe(true);
    expect(entries[0].anime.id).toBe(FREE_FOLDER_ANIME_ID);
    expect(entries[0].spot.image).toBe(''); // no scene image -> single-photo card
    expect(entries[0].capture.uri).toBe('file:///free.jpg');
    expect(entries[0].matchPercent).toBeNull();
  });

  it('keeps free entries separate from known-spot entries and sorts by capturedAt', () => {
    const spotCap: PilgrimageCapture = {
      spotId: 's1', uri: 'file:///s1.jpg', capturedAt: 200,
      animeId: 7, spotImage: 'https://x/scene.jpg', spotName: 'Shrine',
    };
    const entries = buildPilgrimageAlbumEntries({ captures: [spotCap], free: [free], animes: [] });
    expect(entries.map((e) => e.capture.uri)).toEqual(['file:///s1.jpg', 'file:///free.jpg']); // 200 > 100
    expect(entries.find((e) => e.isFree)?.anime.id).toBe(FREE_FOLDER_ANIME_ID);
  });
});
```

- [ ] **Run to confirm fail.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/album-captures.test.ts` → `FREE_FOLDER_ANIME_ID` undefined; `free` param ignored.

- [ ] **Implement.** In `libs/services/pilgrimage/album-captures.ts`:

Add to the `PilgrimageAlbumEntry` interface (after `matchPercent`):
```ts
  /** True for standalone free captures — the album renders a single photo (no comparison). */
  isFree?: boolean;
```

Add the constant after the imports:
```ts
/** Reserved synthetic anime id for the "自由拍攝" (free capture) folder. */
export const FREE_FOLDER_ANIME_ID = -1;
```

Change the input type + loop (replace `BuildAlbumEntriesInput` and the body of `buildPilgrimageAlbumEntries`):
```ts
interface BuildAlbumEntriesInput {
  captures: readonly PilgrimageCapture[];
  free?: readonly PilgrimageCapture[];
  animes: readonly AnitabiBangumi[];
}

export function buildPilgrimageAlbumEntries({
  captures,
  free = [],
  animes,
}: BuildAlbumEntriesInput): PilgrimageAlbumEntry[] {
  const entries: PilgrimageAlbumEntry[] = [];
  for (const capture of captures) {
    const known = findKnownSpot(capture, animes);
    if (known) {
      entries.push({
        capture,
        anime: known.anime,
        spot: known.spot,
        matchPercent: getCaptureFrameMatchPercent(capture),
      });
      continue;
    }
    const fromCapture = buildEntryFromCaptureMetadata(capture);
    if (fromCapture) entries.push(fromCapture);
  }
  for (const capture of free) {
    entries.push(buildFreeEntry(capture));
  }
  return entries.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt);
}

function buildFreeEntry(capture: PilgrimageCapture): PilgrimageAlbumEntry {
  const geo: [number, number] = capture.userLocation
    ? [capture.userLocation.latitude, capture.userLocation.longitude]
    : [0, 0];
  const spot: AnitabiPoint = {
    id: capture.spotId,
    name: '',       // no reference scene name — folder label comes from i18n, not this
    image: '',      // empty -> album renders the single captured photo, no comparison
    ep: 0,
    s: 0,
    geo,
  };
  const anime: AnitabiBangumi = {
    id: FREE_FOLDER_ANIME_ID,
    title: '',      // free folder title is an i18n string in album.tsx, never this
    cn: '',
    city: '',
    cover: '',
    color: '',
    geo,
    zoom: 12,
    modified: capture.capturedAt,
    litePoints: [spot],
    pointsLength: 0,
    imagesLength: 0,
  };
  return { capture, spot, anime, matchPercent: null, isFree: true };
}
```

- [ ] **Run to confirm pass.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/album-captures.test.ts` → green.
- [ ] **Type check.** `bunx tsc --noEmit` → no new errors.
- [ ] **Commit.** `git add libs/services/pilgrimage/album-captures.ts __tests__/unit/pilgrimage/album-captures.test.ts` then `git commit -m "feat(pilgrimage): album entries — free-capture folder branch"`.

---

## Task 4 — Album screen: multi-capture per spot + 自由拍攝 folder (spec 3.4, UI half)

### Files
- **Modify** `app/(tabs)/pilgrimage/album.tsx` — seed from v2, feed free bucket, per-capture keys/delete, free-folder title, single-photo `CompareCard` for free entries. Anchors: import `loadCapturesSync` :26; state seed :126; `entries` memo :171-176; folder id/title from `entry.anime.id` :183-198 + `getPilgrimageAnimeTitles(folder.anime)` :403,637,926,1036; `CompareCard key={entry.capture.spotId}` :670,681; `handleDeleteEntry` `clearCapture(spotId)` :319-330; `CompareCard` scene half render :1054-1066.
- **Modify** `libs/i18n/locales/en.json` + `zh-Hant.json` — add `pilgrimage.album.freeCapturesFolder`.

### Interfaces
Consumes: `loadCapturesV2Sync`, `clearCapture(spotId, uri)`, `clearFreeCapture(uri)` (Task 1); `buildPilgrimageAlbumEntries({captures, free, animes})`, `FREE_FOLDER_ANIME_ID` (Task 3).

### Steps

- [ ] **Add i18n keys.** In `libs/i18n/locales/en.json`, inside the `"album"` object (starts line 974), add:
```json
"freeCapturesFolder": "Free captures",
```
In `libs/i18n/locales/zh-Hant.json`, inside its `"album"` object (starts line 974), add:
```json
"freeCapturesFolder": "自由拍攝",
```

- [ ] **Swap the capture source to v2.** In `album.tsx`, change the import (line 24-28) to add the v2 loaders and `clearFreeCapture`, and `FREE_FOLDER_ANIME_ID`:
```ts
import {
  clearCapture,
  clearFreeCapture,
  loadCapturesV2Sync,
  type CapturesIndexV2,
  type PilgrimageCapture,
} from '../../../libs/services/pilgrimage/captures';
```
and add to the `album-captures` import (line 32-35):
```ts
import {
  buildPilgrimageAlbumEntries,
  FREE_FOLDER_ANIME_ID,
  type PilgrimageAlbumEntry,
} from '../../../libs/services/pilgrimage/album-captures';
```

- [ ] **Seed state from v2 and build entries with the free bucket.** Replace the capture state (line 126) and `entries` memo (line 171-176):
```ts
const [capturesV2, setCapturesV2] = useState<CapturesIndexV2>(loadCapturesV2Sync);
```
```ts
const entries = useMemo<AlbumEntry[]>(() => {
  const spotCaptures: PilgrimageCapture[] = [];
  for (const arr of Object.values(capturesV2.spots)) spotCaptures.push(...arr);
  return buildPilgrimageAlbumEntries({
    captures: spotCaptures,
    free: capturesV2.free,
    animes,
  });
}, [capturesV2, animes]);
```

- [ ] **Give the free folder its i18n title.** In the folder title resolution (`headerTitle` at :401-405 and `detailHeader`/`FolderCard` titles) the album calls `getPilgrimageAnimeTitles(folder.anime).primary`. Add a helper near the top of the component file (module scope) and use it wherever a folder/anime title is displayed:
```ts
function folderTitle(anime: AnitabiBangumi, t: ReturnType<typeof useT>): string {
  if (anime.id === FREE_FOLDER_ANIME_ID) return t('pilgrimage.album.freeCapturesFolder');
  return getPilgrimageAnimeTitles(anime).primary;
}
```
Replace the three `getPilgrimageAnimeTitles(<folder|selectedFolder>.anime).primary` title reads used for display (line ~403 `headerTitle`, line ~637 detail header, line ~926 `FolderCard`) with `folderTitle(<…>.anime, t)`. (`FolderCard` already receives no `t`; it calls `useT()` at :924 — use that local `t`.) Leave `getPilgrimageAnimeTitles` for the free folder's *anime subtitle/region* untouched — the free folder has `region: null`, so no region label renders.

- [ ] **Per-capture keys + delete (delta #6).** In the detail masonry (`CompareCard` at lines 669-676 and 681-688) change the key:
```tsx
key={`${entry.capture.spotId}:${entry.capture.capturedAt}`}
```
In `handleDeleteEntry` (lines 306-337) replace the optimistic state update + `clearCapture(spotId)` with a per-capture removal that also handles free captures:
```ts
const handleDeleteEntry = useCallback(
  (entry: AlbumEntry) => {
    hapticsBridge.warning();
    const spotTitles = getPilgrimageSpotTitles(entry.spot);
    Alert.alert(
      t('pilgrimage.album.deleteTitle'),
      t('pilgrimage.album.deleteBody', { title: entry.isFree ? t('pilgrimage.album.freeCapturesFolder') : spotTitles.primary }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('pilgrimage.album.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            const { spotId, uri } = entry.capture;
            // Optimistically drop from the rendered v2 snapshot.
            setCapturesV2((prev) => {
              if (entry.isFree) {
                return { spots: prev.spots, free: prev.free.filter((c) => c.uri !== uri) };
              }
              const arr = prev.spots[spotId];
              if (!arr) return prev;
              const filtered = arr.filter((c) => c.uri !== uri);
              const spots = { ...prev.spots };
              if (filtered.length > 0) spots[spotId] = filtered;
              else delete spots[spotId];
              return { spots, free: prev.free };
            });
            const p = entry.isFree ? clearFreeCapture(uri) : clearCapture(spotId, uri);
            p.catch((err) => console.warn('[PilgrimageAlbum] delete failed:', err));
          },
        },
      ]
    );
  },
  [t]
);
```

- [ ] **Single-photo card for free entries.** In `CompareCard` (lines 1016-1136), the scene half (lines 1054-1066) renders `entry.spot.image`. Guard it so a free entry (empty `entry.spot.image`) renders only the captured photo full-height:
```tsx
{entry.spot.image ? (
  <>
    <View style={[styles.compareHalf, { height: animeH }]}>
      <Image source={{ uri: entry.spot.image }} style={styles.compareImgFill} contentFit="cover" transition={140} />
      <View style={styles.cornerTag}>
        <ThemedText weight="700" style={{ color: '#FFFFFF', fontSize: 9 }}>{t('pilgrimage.album.tagScene')}</ThemedText>
      </View>
    </View>
    <View style={styles.divider} />
  </>
) : null}
```
(The "yours" half at lines 1068-1082 stays; for a free entry it becomes the only image, filling the card.)

- [ ] **Fix the `CompareCard` prop.** `CompareCard` currently takes `entry: AlbumEntry` — no signature change needed (`isFree` rides on the entry). The `handleEntryPress` navigation (lines 254-304) pushes to `compare/preview` using `entry.spot.image` as the reference; for a free entry that image is `''`. Guard so a free capture opens without a broken reference: at the top of `handleEntryPress`, `if (entry.isFree) return;` (free captures have no comparison to open). Keep the visual card tappable-but-inert for free entries by passing `onPress={entry.isFree ? undefined : () => handleEntryPress(entry)}` at the two `CompareCard` call sites.

- [ ] **Manual verification (no unit test — pure UI wiring).** `bunx tsc --noEmit` → no new errors. Then run the app (`bun run ios` or the project's dev-client launch) and confirm: (a) a spot with 3 captures shows 3 cards; (b) the "自由拍攝" folder appears when a free capture exists and its cards render single-photo; (c) long-press delete removes exactly one card. Record the result in the PR description. (i18n parity test `__tests__/unit/i18n.test.ts` runs in the suite to catch a missing `zh-Hant` key.)
- [ ] **Full suite.** `bun run test:unit` → green (i18n parity included).
- [ ] **Commit.** `git add app/(tabs)/pilgrimage/album.tsx libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json` then `git commit -m "feat(pilgrimage): album — multi-capture per spot + 自由拍攝 folder"`.

---

## Task 5 — Nearest cached-spot suggestion service (spec 3.2, data half)

Pure distance helper (unit-tested) + async cache scan (resolves delta #2). Used by the capture screen (Task 6) and reused-in-spirit by the banner (Task 9).

### Files
- **Create** `libs/services/pilgrimage/nearest-cached-spot.ts`.
- **Test** `__tests__/unit/pilgrimage/nearest-cached-spot.test.ts`.

### Interfaces
Consumes: `CacheService.allKeys()` / `CacheService.get<AnitabiPoint[]>` (`cache-service.ts:414,112`); `locationService.getDistanceKm(a,b)` (`location-service.ts:202`, km); `AnitabiPoint` (`./types`).
Produces:
```ts
export interface NearestSpotSuggestion {
  animeId: number;          // parsed from the cache key suffix
  spot: AnitabiPoint;       // the matched cached point (has id, name, image, geo, ep)
  distanceMeters: number;
}
// Pure — testable without the cache. `points` is a flat list already tagged with animeId.
export function pickNearestWithin(
  points: readonly { animeId: number; spot: AnitabiPoint }[],
  user: { latitude: number; longitude: number },
  radiusMeters: number,
): NearestSpotSuggestion | null;
// Async — scans anitabi_points_v2_* cache keys, then calls pickNearestWithin.
export function findNearestCachedSpot(
  user: { latitude: number; longitude: number },
  radiusMeters?: number, // default 150
): Promise<NearestSpotSuggestion | null>;
```

### Steps

- [ ] **Write the failing test** (`__tests__/unit/pilgrimage/nearest-cached-spot.test.ts`):
```ts
import { describe, expect, it } from 'bun:test';
import { pickNearestWithin } from '../../../libs/services/pilgrimage/nearest-cached-spot';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function pt(id: string, lat: number, lng: number): AnitabiPoint {
  return { id, name: id, image: `https://x/${id}.jpg`, ep: 0, s: 0, geo: [lat, lng] };
}

describe('pickNearestWithin', () => {
  const user = { latitude: 35.0, longitude: 139.0 };

  it('returns null when nothing is within the radius', () => {
    const far = [{ animeId: 1, spot: pt('a', 36.0, 140.0) }]; // >100km away
    expect(pickNearestWithin(far, user, 150)).toBeNull();
  });

  it('returns the closest point within the radius, with its animeId and meters', () => {
    // ~0.0009 deg lat ~= 100m; 0.0005 ~= 55m.
    const near = pt('near', 35.0005, 139.0);
    const nearer = pt('nearer', 35.0002, 139.0);
    const res = pickNearestWithin(
      [{ animeId: 7, spot: near }, { animeId: 9, spot: nearer }],
      user,
      150
    );
    expect(res).not.toBeNull();
    expect(res!.spot.id).toBe('nearer');
    expect(res!.animeId).toBe(9);
    expect(res!.distanceMeters).toBeLessThan(150);
    expect(res!.distanceMeters).toBeGreaterThan(0);
  });

  it('skips points with invalid geo', () => {
    const bad = [{ animeId: 1, spot: { ...pt('b', 0, 0), geo: [Number.NaN, 139.0] as [number, number] } }];
    expect(pickNearestWithin(bad, user, 150)).toBeNull();
  });
});
```

- [ ] **Run to confirm fail.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/nearest-cached-spot.test.ts` → module not found / `pickNearestWithin` undefined.

- [ ] **Implement** `libs/services/pilgrimage/nearest-cached-spot.ts`:
```ts
import { CacheService } from '../cache-service';
import { locationService } from './location-service';
import type { AnitabiPoint } from './types';

// Mirror of anitabi-service.ts:32 — the detail cache stores AnitabiPoint[] per bangumi id.
const DETAIL_CACHE_KEY_PREFIX = 'anitabi_points_v2_';
const DEFAULT_RADIUS_METERS = 150;

export interface NearestSpotSuggestion {
  animeId: number;
  spot: AnitabiPoint;
  distanceMeters: number;
}

function hasValidGeo(spot: AnitabiPoint): boolean {
  const [lat, lng] = spot.geo ?? [];
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** Pure nearest-within-radius pick. `radiusMeters` in metres. Null when none qualify. */
export function pickNearestWithin(
  points: readonly { animeId: number; spot: AnitabiPoint }[],
  user: { latitude: number; longitude: number },
  radiusMeters: number
): NearestSpotSuggestion | null {
  let best: NearestSpotSuggestion | null = null;
  for (const { animeId, spot } of points) {
    if (!hasValidGeo(spot)) continue;
    const [lat, lng] = spot.geo;
    const meters = locationService.getDistanceKm(user, { latitude: lat, longitude: lng }) * 1000;
    if (meters > radiusMeters) continue;
    if (!best || meters < best.distanceMeters) best = { animeId, spot, distanceMeters: meters };
  }
  return best;
}

/** Scan every cached anitabi detail (animes the user has opened) for the nearest spot. */
export async function findNearestCachedSpot(
  user: { latitude: number; longitude: number },
  radiusMeters: number = DEFAULT_RADIUS_METERS
): Promise<NearestSpotSuggestion | null> {
  let keys: string[];
  try {
    keys = await CacheService.allKeys();
  } catch {
    return null;
  }
  const detailKeys = keys.filter((k) => k.startsWith(DETAIL_CACHE_KEY_PREFIX));
  const flat: { animeId: number; spot: AnitabiPoint }[] = [];
  for (const key of detailKeys) {
    const animeId = Number(key.slice(DETAIL_CACHE_KEY_PREFIX.length));
    if (!Number.isFinite(animeId) || animeId <= 0) continue;
    const points = await CacheService.get<AnitabiPoint[]>(key);
    if (!Array.isArray(points)) continue;
    for (const spot of points) flat.push({ animeId, spot });
  }
  return pickNearestWithin(flat, user, radiusMeters);
}
```

- [ ] **Run to confirm pass.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/nearest-cached-spot.test.ts` → green.
- [ ] **Type check.** `bunx tsc --noEmit` → no new errors.
- [ ] **Commit.** `git add libs/services/pilgrimage/nearest-cached-spot.ts __tests__/unit/pilgrimage/nearest-cached-spot.test.ts` then `git commit -m "feat(pilgrimage): nearest cached-spot suggestion service (150m scan)"`.

---

## Task 6 — Standalone camera route `capture.tsx` (spec 3.2, UI core)

A thin shell that reuses the existing camera engine + chrome — NOT a fork of `compare/[spotId].tsx`. Reused as-is by name: `CameraStage` + its `CameraEngineHandle` (`components/pilgrimage/camera/CameraStage.tsx`, `camera-engine.ts`), `ShutterRow`, `ZoomPresets`, `CameraScrim`, `useCameraZoom`, `useTapToFocus`, `availableStopsFromDeviceInfo` (`lens-switching.ts:217`), `useCameraPermission` (vision-camera), `locationService`, `MediaLibrary`. New logic wired: `recordFreeCapture` + `clearFreeCapture` + `recordCapture` (Task 1), `findNearestCachedSpot` (Task 5).

### Files
- **Create** `app/(tabs)/pilgrimage/capture.tsx`.
- **Modify** `libs/i18n/locales/en.json` + `zh-Hant.json` — add a `pilgrimage.capture` namespace.

### Interfaces
Consumes:
- `CameraStage` props (verified `CameraStage.tsx:94-174`): `facing`, `zoomShared`, `exposureShared`, `pinchGesture`, `tapGesture`, `resolutionTier: '4k'|'2k'`, `aspect: AspectRatio`, `qualityPrioritization: QualityPrioritization`, `quality: number`, `orientationSource: OrientationSource`, `onDeviceInfo?`, `onCameraReady?`, `ref` → `CameraEngineHandle { takePhoto(opts?): Promise<EnginePhoto|null>; focus({x,y}); getDeviceInfo(); takeSnapshot() }`. When `device` is omitted, `CameraStage` resolves its own via `useResolvedCameraDevice(facing)`.
- `useCameraZoom({ minZoom, maxZoom })` → `{ zoomShared, pinchGesture, activeStop, setStop }` (`useCameraZoom.ts:123-135`).
- `useTapToFocus({ onFocus })` → `{ tapGesture, releaseLock }` (`useTapToFocus.ts:31-38`).
- `availableStopsFromDeviceInfo(info)` → `FocalStop[]`.
- `locationService.getCurrentLocation()` → `Promise<LatLng|null>`.
- `MediaLibrary.usePermissions()` + `MediaLibrary.saveToLibraryAsync(uri)` (pattern from `preview.tsx:199,477`).

### Steps

- [ ] **Add i18n keys.** In `libs/i18n/locales/en.json`, add a top-level (inside `pilgrimage`) `"capture"` object:
```json
"capture": {
  "title": "Free capture",
  "permTitle": "Camera access needed",
  "permBody": "Allow camera access to take pilgrimage photos.",
  "permCta": "Open Settings",
  "savedToAlbum": "Saved to your album",
  "mountTitle": "Near {name}",
  "mountBody": "{distance}m away · attach this photo to the scene?",
  "mountConfirm": "Attach to scene",
  "mountDismiss": "Keep as free capture"
}
```
Mirror in `libs/i18n/locales/zh-Hant.json` under `pilgrimage`:
```json
"capture": {
  "title": "自由拍攝",
  "permTitle": "需要相機權限",
  "permBody": "允許相機權限即可拍攝巡禮照片。",
  "permCta": "開啟設定",
  "savedToAlbum": "已存入相簿",
  "mountTitle": "靠近 {name}",
  "mountBody": "距離 {distance} 公尺 · 要把這張照片掛到此場景嗎？",
  "mountConfirm": "掛到此場景",
  "mountDismiss": "留在自由拍攝"
}
```

- [ ] **Create the route** `app/(tabs)/pilgrimage/capture.tsx`. File-based routing auto-registers it under the pilgrimage stack (`_layout.tsx` is a bare `<Stack screenOptions={{ headerShown:false }} />`; the screen also declares `<Stack.Screen options={{ headerShown:false }} />` like `album.tsx:409`). Skeleton (thin shell; Rule 9 keeps zoom/exposure in `SharedValue`s, capture-in-flight in a ref, suggestion in local state):
```tsx
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCameraPermission } from 'react-native-vision-camera';
import * as MediaLibrary from 'expo-media-library';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { useT } from '../../../libs/i18n';
import { ThemedText, ThemedButton, readableTextOn } from '../../../components/themed';
import { hapticsBridge } from '../../../modules/haptics/hapticsBridge';
import { CameraStage } from '../../../components/pilgrimage/camera/CameraStage';
import type { CameraDeviceInfo, CameraEngineHandle } from '../../../components/pilgrimage/camera/camera-engine';
import ShutterRow from '../../../components/pilgrimage/camera/ShutterRow';
import ZoomPresets from '../../../components/pilgrimage/camera/ZoomPresets';
import CameraScrim from '../../../components/pilgrimage/camera/CameraScrim';
import type { CameraFacing, FocalStop } from '../../../components/pilgrimage/camera/types';
import { useCameraZoom } from '../../../hooks/useCameraZoom';
import { useTapToFocus } from '../../../hooks/useTapToFocus';
import { availableStopsFromDeviceInfo } from '../../../libs/services/pilgrimage/lens-switching';
import { locationService } from '../../../libs/services/pilgrimage/location-service';
import { recordFreeCapture, recordCapture, clearFreeCapture } from '../../../libs/services/pilgrimage/captures';
import { findNearestCachedSpot, type NearestSpotSuggestion } from '../../../libs/services/pilgrimage/nearest-cached-spot';
import { getPilgrimageSpotTitles } from '../../../libs/services/pilgrimage/pilgrimage-localization';

export default function StandaloneCaptureScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions({ writeOnly: true });

  const cameraRef = useRef<CameraEngineHandle>(null);
  const capturingRef = useRef(false);
  const [facing, setFacing] = useState<CameraFacing>('back');
  const [capturing, setCapturing] = useState(false);
  const [stops, setStops] = useState<FocalStop[]>([1]);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [suggestion, setSuggestion] = useState<NearestSpotSuggestion | null>(null);
  const lastFreeRef = useRef<{ uri: string; capturedAt: number } | null>(null);

  const exposureShared = useSharedValue(0);
  const zoom = useCameraZoom({ minZoom, maxZoom });
  const focus = useTapToFocus({ onFocus: (p) => { void cameraRef.current?.focus(p); } });

  const handleDeviceInfo = useCallback((info: CameraDeviceInfo | null) => {
    if (!info) return;
    setStops(availableStopsFromDeviceInfo(info));
    setMinZoom(info.minZoom);
    setMaxZoom(info.maxZoom);
  }, []);

  if (!hasPermission) {
    return (
      <View style={[styles.permRoot, { backgroundColor: theme.background.primary }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.permBody}>
          <ThemedText variant="titleLarge" weight="700">{t('pilgrimage.capture.permTitle')}</ThemedText>
          <ThemedText variant="bodyMedium" tone="secondary" align="center">{t('pilgrimage.capture.permBody')}</ThemedText>
          <ThemedButton
            label={t('pilgrimage.capture.permCta')}
            onPress={async () => { const ok = await requestPermission(); if (!ok) Linking.openSettings().catch(() => undefined); }}
            size="lg"
          />
        </SafeAreaView>
      </View>
    );
  }

  const ensureMedia = async () => (mediaPerm?.granted ? true : (await requestMediaPerm()).granted);

  const onShutter = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const photo = await cameraRef.current?.takePhoto({ enableShutterSound: true });
      focus.releaseLock();
      if (!photo?.uri) return;
      const capturedAt = Date.now();
      const user = await locationService.getCurrentLocation().catch(() => null);
      const spotId = `free-${capturedAt}-${Math.round(Math.random() * 1e6)}`;
      await recordFreeCapture({
        spotId,
        uri: photo.uri,
        capturedAt,
        source: 'camera',
        userLocation: user ? { latitude: user.latitude, longitude: user.longitude } : undefined,
      });
      lastFreeRef.current = { uri: photo.uri, capturedAt };
      if (await ensureMedia()) await MediaLibrary.saveToLibraryAsync(photo.uri).catch(() => undefined);
      hapticsBridge.success();
      // Mount suggestion — only when a real cached spot is within 150m (Rule 8: no guess).
      if (user) {
        const near = await findNearestCachedSpot(user, 150);
        if (near) setSuggestion(near);
      }
    } catch (e) {
      console.warn('[capture] shutter failed', e);
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }, [focus, mediaPerm]);

  const acceptMount = useCallback(async () => {
    const s = suggestion; const last = lastFreeRef.current;
    setSuggestion(null);
    if (!s || !last) return;
    hapticsBridge.selection();
    // Move the free capture under the matched spot: record then drop the free entry.
    await recordCapture({
      spotId: s.spot.id,
      uri: last.uri,
      capturedAt: last.capturedAt,
      source: 'camera',
      animeId: s.animeId,
      spotName: s.spot.name,
      spotImage: s.spot.image,
      spotEp: s.spot.ep,
      spotGeo: s.spot.geo,
    });
    await clearFreeCapture(last.uri);
  }, [suggestion]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraStage
        ref={cameraRef}
        facing={facing}
        zoomShared={zoom.zoomShared}
        exposureShared={exposureShared}
        pinchGesture={zoom.pinchGesture}
        tapGesture={focus.tapGesture}
        resolutionTier="4k"
        aspect="4:3"
        qualityPrioritization="balanced"
        quality={0.9}
        orientationSource="device"
        onDeviceInfo={handleDeviceInfo}
      />
      <CameraScrim />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topRow, { paddingTop: insets.top }]}>
          <Pressable onPress={() => { hapticsBridge.tap(); router.back(); }} hitSlop={14} style={styles.iconBtn}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
          <ThemedText variant="titleSmall" weight="700" style={{ color: '#FFFFFF' }}>{t('pilgrimage.capture.title')}</ThemedText>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.bottom}>
          <View style={styles.zoomWrap}>
            <ZoomPresets stops={stops} activeStop={zoom.activeStop} themeColor={theme.accent} onPick={zoom.setStop} />
          </View>
          <ShutterRow
            themeColor={theme.accent}
            capturing={capturing}
            isLandscape={false}
            isFrontFacing={facing === 'front'}
            onShutter={onShutter}
            onFlip={() => { hapticsBridge.selection(); setFacing((f) => (f === 'back' ? 'front' : 'back')); }}
          />
        </View>
      </SafeAreaView>
      {suggestion ? (
        <MountSuggestion
          suggestion={suggestion}
          theme={theme}
          t={t}
          onConfirm={acceptMount}
          onDismiss={() => setSuggestion(null)}
        />
      ) : null}
    </GestureHandlerRootView>
  );
}
```
Add a small `MountSuggestion` card component (module scope) using `ThemedSurface`/`ThemedButton`, reading `getPilgrimageSpotTitles(suggestion.spot).primary` for `{name}` and `Math.round(suggestion.distanceMeters)` for `{distance}`, plus a `styles` StyleSheet (theme tokens; the only rgba allowed is over the live preview per the camera-scrim exception). Keep it minimal — two buttons: confirm (`onConfirm`) / dismiss (`onDismiss`).

> Sizing note: `ShutterRow` handles its own layout (row in portrait). Do not wrap it in `flex:1`. The `bottom` container anchors to `insets.bottom`.

- [ ] **Verify + type check.** `bunx tsc --noEmit` → no new errors. Confirm `AspectRatio`/`QualityPrioritization`/`OrientationSource` literals accepted by `CameraStage` (they are the prop types at `CameraStage.tsx:107-108,172`; `'4:3'`/`'balanced'`/`'device'` are valid members — re-check `components/pilgrimage/camera/types.ts` for `AspectRatio` and vision-camera's `QualityPrioritization` if tsc complains, and adjust the literal).
- [ ] **Manual run.** Launch the dev client, open `/pilgrimage/capture`, shoot a photo with location on → confirm it lands in the album's 自由拍攝 folder and (near a cached spot) the mount card appears; accept → it moves into that anime's folder. With location off → no card, capture stays free (honest). Record result in the PR.
- [ ] **Full suite.** `bun run test:unit` → green (i18n parity).
- [ ] **Commit.** `git add "app/(tabs)/pilgrimage/capture.tsx" libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json` then `git commit -m "feat(pilgrimage): standalone free-capture camera route with mount suggestion"`.

---

## Task 7 — Camera entry points: hub header + map FAB (spec 3.2, entry)

### Files
- **Modify** `app/(tabs)/pilgrimage/index.tsx` — add a camera icon button to the header (`headerRight` cluster, next to album at :594-599). `handleOpenAlbum` at :487-489 is the pattern.
- **Modify** `app/(tabs)/pilgrimage/map.tsx` — add a `RoundHeaderButton` (imported :86, used :759-785) in the top overlay next to album; `handleOpenAlbum` at :585.
- **Modify** `libs/i18n/locales/en.json` + `zh-Hant.json` — add `pilgrimage.capture.entryA11y` (accessibility label).

### Steps

- [ ] **Add a11y key.** en.json (inside `pilgrimage.capture`): `"entryA11y": "Free capture camera"`. zh-Hant.json: `"entryA11y": "自由拍攝相機"`.

- [ ] **Hub header button.** In `index.tsx`, add a handler near `handleOpenAlbum` (line 487):
```ts
const handleOpenCamera = useCallback(() => { hapticsBridge.tap(); router.push('/pilgrimage/capture'); }, [router]);
```
Add a `Pressable` in the `headerRight` cluster (after the album button block ending ~line 599), mirroring its style:
```tsx
<Pressable
  onPress={handleOpenCamera}
  hitSlop={8}
  accessibilityRole="button"
  accessibilityLabel={t('pilgrimage.capture.entryA11y')}
  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}>
  <Ionicons name="camera-outline" size={18} color={theme.text.primary} />
</Pressable>
```

- [ ] **Map FAB.** In `map.tsx`, add a handler near `handleOpenAlbum` (line 585):
```ts
const handleOpenCamera = useCallback(() => { hapticsBridge.tap(); router.push('/pilgrimage/capture'); }, [router]);
```
Add a `RoundHeaderButton` in the top overlay cluster next to the album one (after line 784):
```tsx
<RoundHeaderButton
  icon="camera-outline"
  onPress={handleOpenCamera}
  accessibilityLabel={t('pilgrimage.capture.entryA11y')}
  tint={themeColor}
  theme={theme}
/>
```
(Confirm `hapticsBridge` is already imported in each file; both use it elsewhere.)

- [ ] **Type check + manual.** `bunx tsc --noEmit` → clean. Launch app: tap the header camera icon on the hub and the map overlay camera icon → both open `/pilgrimage/capture`.
- [ ] **Full suite.** `bun run test:unit` → green.
- [ ] **Commit.** `git add "app/(tabs)/pilgrimage/index.tsx" "app/(tabs)/pilgrimage/map.tsx" libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json` then `git commit -m "feat(pilgrimage): free-capture entry points — hub header + map FAB"`.

---

## Task 8 — SpotSheet check-in button (spec 3.3, UI half)

Upgrade the visited toggle into a primary "打卡" (check-in) action with a split "check-in / check-in + photo" affordance, reusing the existing `onToggleVisited` and `onStartCamera` callbacks (no new props). Fixes delta #7 (raw English literals).

### Files
- **Modify** `components/pilgrimage/detail/SpotSheet.tsx` — replace the visited `Pressable` in `intentActions` (:298-324) and reshape the primary action. `handleToggleVisited` :125-128, `handleStartCamera` :137-140, `visited` prop :42.
- **Modify** `libs/i18n/locales/en.json` + `zh-Hant.json` — add `pilgrimageUi.checkIn`, `checkedIn`, `checkInPhoto`.

### Steps

- [ ] **Add i18n keys.** en.json (inside `pilgrimageUi`, near line 1608 `"visited"`): `"checkIn": "Check in"`, `"checkedIn": "Checked in"`, `"checkInPhoto": "Check in + photo"`. zh-Hant.json: `"checkIn": "打卡"`, `"checkedIn": "已打卡"`, `"checkInPhoto": "打卡並拍照"`.

- [ ] **Replace the visited chip with a check-in split.** In `SpotSheet.tsx`, change the visited `Pressable` (lines 298-324) so its label uses i18n (delta #7) and reads as a check-in:
```tsx
<Pressable
  onPress={handleToggleVisited}
  style={({ pressed }) => [
    styles.intentBtn,
    visited
      ? { backgroundColor: `${theme.status.success}22`, borderColor: theme.status.success }
      : { backgroundColor: theme.background.tertiary, borderColor: theme.glassBorder },
    pressed && { opacity: 0.84 },
  ]}>
  <Ionicons name={visited ? 'checkmark-circle' : 'flag-outline'} size={16} color={visited ? theme.status.success : theme.text.secondary} />
  <ThemedText variant="bodySmall" weight="700" style={{ color: visited ? theme.status.success : theme.text.secondary }}>
    {visited ? t('pilgrimageUi.checkedIn') : t('pilgrimageUi.checkIn')}
  </ThemedText>
</Pressable>
```
(Keep the save/plan chips at :325-375 unchanged.)

- [ ] **Add "check-in + photo" to the primary camera button.** The existing `startCameraBtn` (:378-389) already routes to the camera via `onStartCamera`. Add a check-in side-effect so "打卡並拍照" both stamps visited and opens the camera. Change `handleStartCamera` (:137-140) to also toggle visited when not yet visited:
```ts
const handleStartCamera = useCallback(() => {
  if (spot) {
    if (!visited) onToggleVisited(visitedTarget ?? spot); // check-in on the way to the camera
    onStartCamera(spot);
  }
}, [onStartCamera, onToggleVisited, spot, visited, visitedTarget]);
```
Relabel the primary button (line 386-388) to reflect the combined action:
```tsx
<ThemedText variant="bodyMedium" weight="800" style={{ color: themeColorFg }}>
  {visited ? t('pilgrimageUi.startArCamera2') : t('pilgrimageUi.checkInPhoto')}
</ThemedText>
```
Add `visited` and `onToggleVisited` to the `handleStartCamera` closure's deps (done above). `visited`/`onToggleVisited`/`visitedTarget` are already props; no interface change.

> Rule 9 / memo: `SpotSheet` is memoised with a custom comparator (`:445-458`) that already checks `visited`, `onToggleVisited`, `onStartCamera`. No comparator change needed.

- [ ] **Type check + manual.** `bunx tsc --noEmit` → clean. Launch app, open a spot sheet: the visited chip reads 打卡/已打卡; the primary button reads 打卡並拍照 when not visited and 啟動 AR 相機 once visited; tapping it both stamps visited (check the marker) and opens the camera.
- [ ] **Full suite.** `bun run test:unit` → green.
- [ ] **Commit.** `git add components/pilgrimage/detail/SpotSheet.tsx libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json` then `git commit -m "feat(pilgrimage): SpotSheet 打卡 check-in button (visited + optional photo)"`.

---

## Task 9 — Detail-map proximity check-in banner (spec 3.5)

Foreground-only, on the per-anime detail map (`[animeId].tsx` — the screen with the full point list). When the user's live location is within 100 m of a not-yet-checked-in point, show a top banner "你在 {name} 附近，打卡？" with a check-in button. Throttled once per spot per session via a `useRef<Set>` (Rule 9). No background geofence (spec 3.5 / 不做清單).

### Files
- **Create** `components/pilgrimage/detail/ProximityCheckInBanner.tsx` — minimal `ThemedSurface` banner (no camera-slide-banner component exists to reuse; the camera toasts `AutoCaptureToast`/`CamSwitchToast` are camera-HUD-specific, so a small themed banner is the honest minimal choice).
- **Modify** `app/(tabs)/pilgrimage/[animeId].tsx` — compute nearest unvisited point from `tracking.location` (:175) + `points` + `visited` (:178) using `pickNearestWithin` (Task 5, pure), render the banner, wire its check-in to `toggleVisitedPoint` (:181), throttle with a ref.
- **Test** `__tests__/unit/pilgrimage/proximity-checkin.test.ts` — pin the nearest-unvisited selection (reuses `pickNearestWithin`, filtered by visited).

### Interfaces
Consumes: `pickNearestWithin` (Task 5); `toggleVisitedPoint(spot: AnitabiPoint)` (`usePilgrimageInteractions.ts:74`); `tracking.location: LatLng|null`; `points: AnitabiPoint[]`; `visited: VisitedMap`.

### Steps

- [ ] **Write the failing test** (`__tests__/unit/pilgrimage/proximity-checkin.test.ts`) — a small pure helper `nearestUnvisitedWithin` that wraps `pickNearestWithin` after filtering visited ids:
```ts
import { describe, expect, it } from 'bun:test';
import { nearestUnvisitedWithin } from '../../../libs/services/pilgrimage/proximity-checkin';
import type { AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function pt(id: string, lat: number, lng: number): AnitabiPoint {
  return { id, name: id, image: '', ep: 0, s: 0, geo: [lat, lng] };
}
const user = { latitude: 35.0, longitude: 139.0 };

describe('nearestUnvisitedWithin', () => {
  it('ignores visited points and returns the nearest unvisited within radius', () => {
    const points = [pt('a', 35.0002, 139.0), pt('b', 35.0004, 139.0)]; // a nearer than b
    const res = nearestUnvisitedWithin(points, { a: true }, user, 100);
    expect(res?.spot.id).toBe('b'); // a is visited -> skipped
  });
  it('returns null when the only nearby point is already visited', () => {
    const points = [pt('a', 35.0002, 139.0)];
    expect(nearestUnvisitedWithin(points, { a: true }, user, 100)).toBeNull();
  });
  it('returns null when nothing is within radius', () => {
    expect(nearestUnvisitedWithin([pt('far', 36, 140)], {}, user, 100)).toBeNull();
  });
});
```

- [ ] **Run to confirm fail.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/proximity-checkin.test.ts` → module not found.

- [ ] **Implement the helper** `libs/services/pilgrimage/proximity-checkin.ts`:
```ts
import { pickNearestWithin, type NearestSpotSuggestion } from './nearest-cached-spot';
import type { AnitabiPoint } from './types';
import type { VisitedMap } from './visited-prefs';

/** Nearest point NOT already checked in, within radiusMeters. animeId is irrelevant here (0). */
export function nearestUnvisitedWithin(
  points: readonly AnitabiPoint[],
  visited: VisitedMap,
  user: { latitude: number; longitude: number },
  radiusMeters: number
): NearestSpotSuggestion | null {
  const flat = points.filter((p) => visited[p.id] !== true).map((spot) => ({ animeId: 0, spot }));
  return pickNearestWithin(flat, user, radiusMeters);
}
```

- [ ] **Run to confirm pass.** `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/proximity-checkin.test.ts` → green.

- [ ] **Create `ProximityCheckInBanner.tsx`.** Minimal themed banner (props: `spotName: string`, `distanceMeters: number`, `onCheckIn: () => void`, `onDismiss: () => void`, `theme`, `t`). Use `ThemedSurface variant="elevated"` + `ThemedText` + `ThemedButton` (label `t('pilgrimageUi.checkIn')`). Copy from `t('pilgrimage.detail.nearSpotPrompt', { name })` (add the key below). No hardcoded hex.

- [ ] **Add i18n key.** en.json (inside `pilgrimage.detail`, or `pilgrimageUi`): `"nearSpotPrompt": "You're near {name}"`. zh-Hant.json: `"nearSpotPrompt": "你在 {name} 附近"`. (Re-use `pilgrimageUi.checkIn` for the button.)

- [ ] **Wire into `[animeId].tsx`.** After `derived`/`interactions` are available (around line 213), compute the banner target off the live location, throttled per session:
```ts
const promptedRef = useRef<Set<string>>(new Set());
const [proximityTarget, setProximityTarget] = useState<{ spot: AnitabiPoint; distanceMeters: number } | null>(null);
useEffect(() => {
  if (!userLocation) return;
  const near = nearestUnvisitedWithin(points, visited, userLocation, 100);
  if (near && !promptedRef.current.has(near.spot.id)) {
    promptedRef.current.add(near.spot.id);
    setProximityTarget({ spot: near.spot, distanceMeters: near.distanceMeters });
  }
}, [userLocation, points, visited]);
```
> Rule 9: `userLocation` already updates coarsely (the tracking hook throttles); this effect only sets state when a NEW unvisited spot enters range, and the ref gate prevents re-prompting the same spot. Do not push this into a live-frequency path.

Render the banner near the top of the screen body (above the map, e.g. next to the header ~line 598), only when `proximityTarget`:
```tsx
{proximityTarget ? (
  <ProximityCheckInBanner
    spotName={getPilgrimageSpotTitles(proximityTarget.spot).primary}
    distanceMeters={proximityTarget.distanceMeters}
    theme={theme}
    t={t}
    onCheckIn={() => { toggleVisitedPoint(proximityTarget.spot); setProximityTarget(null); }}
    onDismiss={() => setProximityTarget(null)}
  />
) : null}
```
Add the imports for `nearestUnvisitedWithin`, `ProximityCheckInBanner`, and (if not present) `getPilgrimageSpotTitles`/`useState`/`useEffect`/`useRef`.

- [ ] **Type check + manual.** `bunx tsc --noEmit` → clean. Manual: use a simulator location within 100 m of a known spot in an opened anime → the banner appears once; tap check-in → the marker turns visited and the banner dismisses; it does not re-appear for that spot this session.
- [ ] **Full suite.** `bun run test:unit` → green.
- [ ] **Commit.** `git add libs/services/pilgrimage/proximity-checkin.ts components/pilgrimage/detail/ProximityCheckInBanner.tsx "app/(tabs)/pilgrimage/[animeId].tsx" __tests__/unit/pilgrimage/proximity-checkin.test.ts libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json` then `git commit -m "feat(pilgrimage): detail-map proximity check-in banner (<100m, foreground)"`.

---

## Self-review — spec coverage

| Spec item | Task(s) |
|---|---|
| 3.1 captures schema v2 (`Record<spotId, Capture[]>` + `free`, v1 migration) | Task 1 |
| 3.2 standalone capture entry (hub header + map FAB), overlay-off camera, 150m mount suggestion, else free folder | Tasks 5 (scan), 6 (route), 7 (entries) |
| 3.3 打卡 unify: visited timestamp + SpotSheet primary check-in button (± photo) | Task 2 (timestamp data), Task 8 (button) |
| 3.4 album: anime folders + 自由拍攝 + multi-capture per spot | Task 3 (service), Task 4 (UI) |
| 3.5 foreground proximity check-in banner on the detail map (<100m), no background geofence | Task 9 |

**不做清單 honored**: no background geofence/push, no cloud upload, no capture editor, no `compare/[spotId]` standalone-mode retrofit (a new thin route replaces it). No fake data: missing GPS → `userLocation` omitted and no suggestion; suggestion only from real cached points; migrated `visited` timestamp `0` renders as "visited, time unknown", never a fabricated date.

**Placeholder scan**: none — every step carries real code.

**Type consistency across tasks**: `CapturesIndexV2`/`recordFreeCapture`/`clearFreeCapture`/`loadCapturesV2Sync` (Task 1) → consumed with matching signatures in Tasks 4 & 6; `NearestSpotSuggestion`/`pickNearestWithin` (Task 5) → reused by Task 9's `nearestUnvisitedWithin`; `VisitedMap` unchanged so Task 2 touches zero consumers; `FREE_FOLDER_ANIME_ID` (Task 3) → used by Task 4's `folderTitle`.
