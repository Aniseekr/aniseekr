# B1: Bangumi Archive → bangumi_id + name_cn in the merged mapping (Aniseekr-source)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The published `anime-id-mappings-merged.json` gains `bangumi_id` and `name_cn` for the bulk of the catalog, with a coverage gate that fails the build if either silently regresses toward 0%.

**Architecture:** Two new data sources join the existing Fribb × manami merge in `/Users/kidney/Workspace/Work/ani/Aniseekr-source`:
1. **anitabi-cross-index** (already published by this repo; `{bangumiId, anilistId, malId, titleCn}` resolved via AniList with episode/year disambiguation) — authoritative seeds, applied post-merge by anilist/mal key.
2. **Bangumi Archive weekly dump** (`subject.jsonlines`, type === 2) — broad-catalog title matching: normalized native-title equality (ported from the app's proven `bangumi-title-match.ts`), disambiguated by air year (±1) and platform/type compatibility; ambiguous → skip, bangumi IDs claimed by >1 manami entry → dropped. Never guess (app CLAUDE.md Rule 8).

`name_cn` comes from the Archive subject record (cross-index `titleCn` as fallback for seed-matched rows missing an Archive record).

**Verified facts (2026-06-12):**
- Archive release: tag `archive`, assets `dump-YYYY-MM-DD.HHMMSSZ.zip` (~408 MB), no stable alias → resolve newest via GitHub API.
- `subject.jsonlines` is 886 MB uncompressed → stream line-by-line via `unzip -p`.
- type=2 fields: `id`, `name`, `name_cn`, `date` ("YYYY-MM-DD", ~96% present), `platform` ∈ {1=TV, 2=OVA, 3=Movie, 5=WEB, 0=other} (+ rare garbage like 2006).
- manami minified retains `title`, `synonyms` (incl. Japanese natives), `animeSeason.year`, `type` (TV/MOVIE/OVA/ONA/SPECIAL/UNKNOWN).
- Local dump for calibration: `/tmp/bgm-dump/dump.zip` (env `BANGUMI_DUMP_PATH` skips download).

**Tech Stack:** Bun (scripts + `bun test`), GitHub Actions ubuntu runner (`unzip` preinstalled).

---

### Task B1-1: `scripts/lib/normalize-title.ts` + test scaffold

**Files:**
- Create: `scripts/lib/normalize-title.ts`
- Create: `tests/normalize-title.test.ts`
- Modify: `package.json` (add `"test": "bun test"`)

- [ ] **Step 1: failing test** (`tests/normalize-title.test.ts`):

```ts
import { describe, expect, it } from 'bun:test';
import { normalizeTitleKey } from '../scripts/lib/normalize-title';

describe('normalizeTitleKey', () => {
  it('collapses width, case, brackets, punctuation and whitespace', () => {
    expect(normalizeTitleKey('鋼の錬金術師 FULLMETAL ALCHEMIST')).toBe('鋼の錬金術師fullmetalalchemist');
    expect(normalizeTitleKey('「進撃の巨人」 Season 3')).toBe('進撃の巨人season3');
    expect(normalizeTitleKey('ＳＴＥＩＮＳ；ＧＡＴＥ')).toBe('steins;gate');
    expect(normalizeTitleKey('!NVADE SHOW!')).toBe('nvadeshow');
  });
  it('returns empty for punctuation-only input', () => {
    expect(normalizeTitleKey('!?。・')).toBe('');
  });
});
```

- [ ] **Step 2: run** `bun test tests/normalize-title.test.ts` → FAIL (module missing)
- [ ] **Step 3: implement** (`scripts/lib/normalize-title.ts`) — port verbatim from the app repo (`aniseekr/libs/services/pilgrimage/bangumi-title-match.ts`) so both ends agree on "same title":

```ts
/**
 * Collapse a title to a comparison key: NFKC (full/half width), lowercase,
 * brackets + common punctuation + whitespace stripped.
 *
 * Ported verbatim from aniseekr `libs/services/pilgrimage/bangumi-title-match.ts`
 * (normalizeTitleKey) — the app's runtime matcher and this build-time matcher
 * must agree on what "the same title" means.
 */
export function normalizeTitleKey(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[『』「」《》【】()[\]（）]/g, '')
    .replace(/[!！?？:：,，.。'’"“”・\-_–—\s　]+/g, '')
    .trim();
}
```

- [ ] **Step 4: run** → PASS. Add `"test": "bun test"` to package.json scripts.
- [ ] **Step 5: commit** `feat(lib): port normalizeTitleKey from aniseekr runtime matcher`

---

### Task B1-2: `scripts/lib/bangumi-dump.ts`

**Files:**
- Create: `scripts/lib/bangumi-dump.ts`
- Create: `tests/bangumi-dump.test.ts`

- [ ] **Step 1: failing tests:**

```ts
import { describe, expect, it } from 'bun:test';
import { parseSubjectLine, pickNewestDumpAsset } from '../scripts/lib/bangumi-dump';

describe('pickNewestDumpAsset', () => {
  it('picks the lexicographically newest dump-*.zip', () => {
    const assets = [
      { name: 'dump-2026-05-26.210457Z.zip', browser_download_url: 'u1' },
      { name: 'dump-2026-06-09.210424Z.zip', browser_download_url: 'u2' },
      { name: 'dump-2026-06-09.210424Z.7z', browser_download_url: 'u3' },
      { name: 'dump-2026-06-02.210429Z.zip', browser_download_url: 'u4' },
    ];
    expect(pickNewestDumpAsset(assets)?.browser_download_url).toBe('u2');
  });
  it('returns null when no zip asset matches', () => {
    expect(pickNewestDumpAsset([{ name: 'readme.md', browser_download_url: 'x' }])).toBeNull();
  });
});

describe('parseSubjectLine', () => {
  it('extracts an anime subject', () => {
    const line = JSON.stringify({
      id: 8, type: 2, name: 'コードギアス 反逆のルルーシュR2',
      name_cn: 'Code Geass 反叛的鲁路修R2', date: '2008-04-06', platform: 1,
    });
    expect(parseSubjectLine(line)).toEqual({
      id: 8,
      name: 'コードギアス 反逆のルルーシュR2',
      nameCn: 'Code Geass 反叛的鲁路修R2',
      year: 2008,
      platform: 1,
    });
  });
  it('rejects non-anime, invalid ids, and handles missing date/name_cn', () => {
    expect(parseSubjectLine(JSON.stringify({ id: 1, type: 1, name: 'x' }))).toBeNull();
    expect(parseSubjectLine(JSON.stringify({ id: 0, type: 2, name: 'x' }))).toBeNull();
    expect(parseSubjectLine('not json')).toBeNull();
    expect(parseSubjectLine(JSON.stringify({ id: 9, type: 2, name: 'y', name_cn: '', date: '' })))
      .toEqual({ id: 9, name: 'y', nameCn: null, year: null, platform: null });
  });
});
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement:**

```ts
/**
 * Bangumi Archive weekly dump access.
 *
 * The bangumi/Archive repo publishes dated assets (dump-YYYY-MM-DD.HHMMSSZ.zip,
 * ~400 MB) under the fixed `archive` release tag — no stable-alias asset, so
 * the newest one is resolved through the GitHub API. `subject.jsonlines`
 * inside is ~900 MB; it is never buffered whole — `unzip -p` streams it and
 * lines are parsed as they arrive, keeping only type-2 (anime) subjects.
 *
 * Env:
 *   BANGUMI_DUMP_PATH  use a local dump.zip instead of downloading (dev loop)
 *   GH_TOKEN           optional GitHub API token (CI; avoids rate limits)
 */

const ARCHIVE_RELEASE_API = 'https://api.github.com/repos/bangumi/Archive/releases/tags/archive';

export interface DumpAsset {
  name: string;
  browser_download_url: string;
}

export interface BangumiAnimeSubject {
  id: number;
  name: string;
  nameCn: string | null;
  year: number | null;
  /** 1=TV, 2=OVA, 3=Movie, 5=WEB, 0=other; null when absent/garbage. */
  platform: number | null;
}

const DUMP_NAME_RE = /^dump-\d{4}-\d{2}-\d{2}\..*\.zip$/;
const KNOWN_PLATFORMS = new Set([0, 1, 2, 3, 5]);

/** Dated names are fixed-width, so lexicographic max = newest. */
export function pickNewestDumpAsset(assets: readonly DumpAsset[]): DumpAsset | null {
  let best: DumpAsset | null = null;
  for (const a of assets) {
    if (!DUMP_NAME_RE.test(a.name)) continue;
    if (!best || a.name > best.name) best = a;
  }
  return best;
}

export function parseSubjectLine(line: string): BangumiAnimeSubject | null {
  let o: {
    id?: unknown; type?: unknown; name?: unknown; name_cn?: unknown;
    date?: unknown; platform?: unknown;
  };
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (o.type !== 2) return null;
  if (typeof o.id !== 'number' || !Number.isFinite(o.id) || o.id <= 0) return null;
  if (typeof o.name !== 'string' || o.name.length === 0) return null;

  const nameCn = typeof o.name_cn === 'string' && o.name_cn.trim().length > 0
    ? o.name_cn.trim()
    : null;
  const yearMatch = typeof o.date === 'string' ? /^(\d{4})-/.exec(o.date) : null;
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const platform =
    typeof o.platform === 'number' && KNOWN_PLATFORMS.has(o.platform) ? o.platform : null;

  return { id: o.id, name: o.name, nameCn, year, platform };
}

export async function downloadLatestDump(destPath: string): Promise<string> {
  const local = process.env.BANGUMI_DUMP_PATH;
  if (local) {
    console.log(`[bangumi-dump] using local dump: ${local}`);
    return local;
  }
  const headers: Record<string, string> = { 'User-Agent': 'Aniseekr-source build' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(ARCHIVE_RELEASE_API, { headers });
  if (!res.ok) throw new Error(`Archive release listing failed: ${res.status}`);
  const release = (await res.json()) as { assets?: DumpAsset[] };
  const asset = pickNewestDumpAsset(release.assets ?? []);
  if (!asset) throw new Error('No dump-*.zip asset found in bangumi/Archive release');

  console.log(`[bangumi-dump] downloading ${asset.name}…`);
  const dl = await fetch(asset.browser_download_url);
  if (!dl.ok || !dl.body) throw new Error(`Dump download failed: ${dl.status}`);
  await Bun.write(destPath, dl);
  return destPath;
}

/** Stream subject.jsonlines out of the zip; never buffers the whole file. */
export async function loadAnimeSubjects(zipPath: string): Promise<BangumiAnimeSubject[]> {
  const proc = Bun.spawn(['unzip', '-p', zipPath, 'subject.jsonlines'], {
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const subjects: BangumiAnimeSubject[] = [];
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const parsed = parseSubjectLine(buffer.slice(0, nl));
      if (parsed) subjects.push(parsed);
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) {
    const parsed = parseSubjectLine(buffer);
    if (parsed) subjects.push(parsed);
  }
  const exit = await proc.exited;
  if (exit !== 0) throw new Error(`unzip exited with ${exit}`);
  console.log(`[bangumi-dump] anime subjects: ${subjects.length}`);
  return subjects;
}
```

- [ ] **Step 4: run** → PASS
- [ ] **Step 5: commit** `feat(lib): bangumi Archive dump resolution + streaming subject parser`

---

### Task B1-3: `scripts/lib/bangumi-match.ts`

**Files:**
- Create: `scripts/lib/bangumi-match.ts`
- Create: `tests/bangumi-match.test.ts`

Matching rules (in order):
1. Candidate set = union of index hits for `normalize(title)` and every `normalize(synonym)`, over an index of Bangumi `name` AND `name_cn`.
2. If >1 candidate and the manami year is known: keep candidates with `|year − manamiYear| ≤ 1` (unknown-year candidates are kept — absence of data is not evidence).
3. If still >1 and the manami type maps to a platform set: keep candidates whose platform is in the set or null.
4. Exactly 1 left → match; else skip (never guess).
5. Global pass: a bangumi id claimed by >1 manami entry → all claims dropped.

- [ ] **Step 1: failing tests:**

```ts
import { describe, expect, it } from 'bun:test';
import { matchManamiToBangumi, type ManamiMatchInput } from '../scripts/lib/bangumi-match';
import type { BangumiAnimeSubject } from '../scripts/lib/bangumi-dump';

const subj = (s: Partial<BangumiAnimeSubject> & { id: number; name: string }): BangumiAnimeSubject => ({
  nameCn: null, year: null, platform: null, ...s,
});
const entry = (e: Partial<ManamiMatchInput> & { title: string }): ManamiMatchInput => ({
  synonyms: [], year: null, type: null, ...e,
});

describe('matchManamiToBangumi', () => {
  it('matches a unique native-title hit via synonyms', () => {
    const { matches } = matchManamiToBangumi(
      [entry({ title: 'Attack on Titan', synonyms: ['進撃の巨人'], year: 2013 })],
      [subj({ id: 23686, name: '進撃の巨人', year: 2013, platform: 1 })]
    );
    expect(matches.get(0)).toBe(23686);
  });

  it('disambiguates same-name entries by year ±1', () => {
    const subjects = [
      subj({ id: 10, name: 'ハンター×ハンター', year: 1999, platform: 1 }),
      subj({ id: 11, name: 'ハンター×ハンター', year: 2011, platform: 1 }),
    ];
    const { matches } = matchManamiToBangumi(
      [entry({ title: 'Hunter x Hunter (2011)', synonyms: ['ハンター×ハンター'], year: 2011, type: 'TV' })],
      subjects
    );
    expect(matches.get(0)).toBe(11);
  });

  it('disambiguates TV vs movie by type when years tie', () => {
    const subjects = [
      subj({ id: 20, name: '君の名は。', year: 2016, platform: 3 }),
      subj({ id: 21, name: '君の名は。', year: 2016, platform: 1 }),
    ];
    const { matches } = matchManamiToBangumi(
      [entry({ title: 'Kimi no Na wa.', synonyms: ['君の名は。'], year: 2016, type: 'MOVIE' })],
      subjects
    );
    expect(matches.get(0)).toBe(20);
  });

  it('skips when ambiguity survives the filters', () => {
    const subjects = [
      subj({ id: 30, name: '同名', year: 2020, platform: 1 }),
      subj({ id: 31, name: '同名', year: 2020, platform: 1 }),
    ];
    const { matches, stats } = matchManamiToBangumi(
      [entry({ title: '同名', year: 2020, type: 'TV' })],
      subjects
    );
    expect(matches.size).toBe(0);
    expect(stats.ambiguous).toBe(1);
  });

  it('matches through name_cn too', () => {
    const { matches } = matchManamiToBangumi(
      [entry({ title: '葬送的芙莉蓮' })],
      [subj({ id: 40, name: '葬送のフリーレン', nameCn: '葬送的芙莉蓮' })]
    );
    expect(matches.get(0)).toBe(40);
  });

  it('drops a bangumi id claimed by two different entries', () => {
    const subjects = [subj({ id: 50, name: 'かぶり' })];
    const { matches, stats } = matchManamiToBangumi(
      [entry({ title: 'かぶり' }), entry({ title: 'カブリ', synonyms: ['かぶり'] })],
      subjects
    );
    expect(matches.size).toBe(0);
    expect(stats.collisionsDropped).toBe(2);
  });
});
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement:**

```ts
import type { BangumiAnimeSubject } from './bangumi-dump';
import { normalizeTitleKey } from './normalize-title';

export interface ManamiMatchInput {
  title: string;
  synonyms: readonly string[];
  year: number | null;
  /** manami `type`: TV | MOVIE | OVA | ONA | SPECIAL | UNKNOWN | null */
  type: string | null;
}

export interface MatchStats {
  matched: number;
  ambiguous: number;
  noCandidate: number;
  collisionsDropped: number;
}

/** manami type → acceptable Bangumi platforms (null platform always passes). */
const TYPE_TO_PLATFORMS: Record<string, ReadonlySet<number>> = {
  TV: new Set([1]),
  MOVIE: new Set([3]),
  OVA: new Set([2]),
  ONA: new Set([5]),
  // SPECIAL / UNKNOWN: Bangumi has no dedicated platform — no constraint.
};

export function matchManamiToBangumi(
  entries: readonly ManamiMatchInput[],
  subjects: readonly BangumiAnimeSubject[]
): { matches: Map<number, number>; stats: MatchStats } {
  // Index native names and Chinese names; a key may collide across subjects.
  const index = new Map<string, BangumiAnimeSubject[]>();
  const add = (key: string, s: BangumiAnimeSubject) => {
    if (!key) return;
    const list = index.get(key);
    if (list) {
      if (!list.includes(s)) list.push(s);
    } else {
      index.set(key, [s]);
    }
  };
  for (const s of subjects) {
    add(normalizeTitleKey(s.name), s);
    if (s.nameCn) add(normalizeTitleKey(s.nameCn), s);
  }

  const stats: MatchStats = { matched: 0, ambiguous: 0, noCandidate: 0, collisionsDropped: 0 };
  const provisional = new Map<number, number>(); // entry index → bangumi id

  entries.forEach((entry, i) => {
    const keys = new Set<string>();
    keys.add(normalizeTitleKey(entry.title));
    for (const syn of entry.synonyms) keys.add(normalizeTitleKey(syn));
    keys.delete('');

    const candidates = new Map<number, BangumiAnimeSubject>();
    for (const key of keys) {
      for (const s of index.get(key) ?? []) candidates.set(s.id, s);
    }
    if (candidates.size === 0) {
      stats.noCandidate += 1;
      return;
    }

    let remaining = [...candidates.values()];
    if (remaining.length > 1 && entry.year !== null) {
      remaining = remaining.filter((s) => s.year === null || Math.abs(s.year - entry.year!) <= 1);
    }
    const platforms = entry.type ? TYPE_TO_PLATFORMS[entry.type] : undefined;
    if (remaining.length > 1 && platforms) {
      remaining = remaining.filter((s) => s.platform === null || platforms.has(s.platform));
    }

    if (remaining.length === 1) {
      provisional.set(i, remaining[0].id);
    } else {
      stats.ambiguous += 1;
    }
  });

  // A bangumi id claimed by two entries means at least one claim is wrong —
  // drop them all rather than guess which one is right.
  const claimCount = new Map<number, number>();
  for (const id of provisional.values()) claimCount.set(id, (claimCount.get(id) ?? 0) + 1);
  const matches = new Map<number, number>();
  for (const [i, id] of provisional) {
    if (claimCount.get(id) === 1) {
      matches.set(i, id);
    } else {
      stats.collisionsDropped += 1;
    }
  }
  stats.matched = matches.size;
  return { matches, stats };
}
```

- [ ] **Step 4: run** → PASS
- [ ] **Step 5: commit** `feat(lib): manami→bangumi title matcher with year/type disambiguation`

---

### Task B1-4: integrate into `build-id-mapping-source.ts` + gate + schema

**Files:**
- Modify: `scripts/build-id-mapping-source.ts`
- Modify: `schemas/anime-id-mappings.schema.json`

- [ ] **Step 1:** Extend `ManamiEntry` and record plumbing:

```ts
interface ManamiEntry {
  sources?: string[];
  title?: string;
  synonyms?: string[];
  animeSeason?: { season?: string; year?: number };
  type?: string;
}
```

`MergedRecord` gains `name_cn`:

```ts
type MergedRecord = Partial<Record<IdColumn, number | string>> & { name_cn?: string };
const MERGE_FIELDS = [...ID_COLUMNS, 'name_cn'] as const;
```

…and `mergeInto` iterates `MERGE_FIELDS` instead of `ID_COLUMNS`.

- [ ] **Step 2:** New constants + cross-index fetch:

```ts
const CROSS_INDEX_URL =
  'https://github.com/Aniseekr/Aniseekr-source/releases/download/anitabi-cross-index/anitabi-cross-index.json';

interface CrossIndexEntry {
  bangumiId: number;
  anilistId: number | null;
  malId: number | null;
  titleCn: string;
}
```

- [ ] **Step 3:** In `main()`, after the existing fetches:
  1. `const dumpPath = await downloadLatestDump(resolve(process.cwd(), 'bangumi-dump.zip'))` and `const subjects = await loadAnimeSubjects(dumpPath)`; build `subjectById = new Map(subjects.map(s => [s.id, s]))`.
  2. Title-match: build `ManamiMatchInput[]` from manami entries (`title ?? ''`, `synonyms ?? []`, `animeSeason?.year ?? null`, `type ?? null`), run `matchManamiToBangumi`, then for matched indices set `bangumi_id` + `name_cn` (from the subject) on the corresponding `manamiRecords[i]` BEFORE `dedupeByPriority`.
  3. After `dedupeByPriority`: fetch cross-index (tolerate failure with a warning — it's an enhancement layer), build `byAnilist` / `byMal` maps from entries with `bangumiId > 0`. For every merged record: seed `bangumi_id` from cross-index when present (cross-index wins over a disagreeing title match; count disagreements), then fill `name_cn` from `subjectById.get(bangumi_id)?.nameCn ?? crossEntry?.titleCn` when missing.
  4. Log a match report: `stats`, seed count, disagreements.
- [ ] **Step 4:** Coverage gate after `reportCoverage(merged)`:

```ts
function enforceCoverageGate(records: MergedRecord[]): void {
  const withAnilist = records.filter((r) => r.anilist_id !== undefined);
  const pct = (n: number) => (withAnilist.length ? (n / withAnilist.length) * 100 : 0);
  const bangumiPct = pct(withAnilist.filter((r) => r.bangumi_id !== undefined).length);
  const nameCnPct = pct(withAnilist.filter((r) => r.name_cn !== undefined).length);
  console.log(
    `[gate] of ${withAnilist.length} anilist rows: bangumi_id ${bangumiPct.toFixed(1)}%, name_cn ${nameCnPct.toFixed(1)}%`
  );
  // Floors calibrated against the 2026-06-09 dump (Task B1-6); their job is
  // to catch a silent return to ~0%, not to enforce a precise number.
  if (bangumiPct < BANGUMI_FLOOR_PCT || nameCnPct < NAME_CN_FLOOR_PCT) {
    console.error('[gate] FAIL — bangumi/name_cn coverage regressed; refusing to publish.');
    process.exit(1);
  }
}
```

(Floors as module constants; placeholder 20/15 until B1-6 calibrates.)
- [ ] **Step 5:** Schema: add `name_cn` to `MappingRecord.properties` (`{"type": "string", "description": "Official Chinese title from the Bangumi Archive dump (subject.name_cn)."}`) and update the `bangumi_id` description to name the two contributing feeds.
- [ ] **Step 6:** `bun test` all green; commit `feat(build): join Bangumi Archive + cross-index into merged mapping with coverage gate`

---

### Task B1-5: workflow

**Files:**
- Modify: `.github/workflows/build-id-mapping.yml`

- [ ] Add `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` env to the "Build merged mapping JSON" step (Archive API listing) and a `bun test` step before the build. Note the build now downloads ~400 MB; ubuntu runners have 14 GB disk — fine.
- [ ] Commit `ci(id-mapping): run tests, pass token for Archive API listing`

---

### Task B1-6: local calibration + spot checks

- [ ] **Step 1:** `BANGUMI_DUMP_PATH=/tmp/bgm-dump/dump.zip bun scripts/build-id-mapping-source.ts` — full real run.
- [ ] **Step 2:** Spot-check with python/jq against the output: AniList 5114 (鋼之鍊金術師FA), 11061 (獵人2011), 16498 (進擊的巨人), 21 (海賊王): each must carry a `bangumi_id` whose Archive subject `name` matches the expected native title, and a plausible `name_cn`. Mismatch → fix matcher, re-run.
- [ ] **Step 3:** Set `BANGUMI_FLOOR_PCT` / `NAME_CN_FLOOR_PCT` to roughly half the measured coverage (regression tripwire, not a precision target). Re-run gate passes.
- [ ] **Step 4:** Check output size delta (expect ≲ +2 MB minified).
- [ ] **Step 5:** Commit `chore(build): calibrate bangumi coverage floors against 2026-06-09 dump`
