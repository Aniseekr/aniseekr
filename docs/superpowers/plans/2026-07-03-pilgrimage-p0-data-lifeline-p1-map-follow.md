# Pilgrimage Phase 0（資料生命線）+ Phase 1（地圖貼人）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 圖片在所有發現面真的顯示（normalize + 錯誤態 + 快取韌性 + header 實驗），地圖預設跟著用戶、走過的點在 hub 地圖可辨、非日本用戶置中自己的位置。

**Architecture:** 全部是既有 seam 的最小修改：`AnitabiService` 是 lite 資料唯一 choke point（normalize + stale-if-error 都在這裡治好所有 caller）；圖片統一走新的 `<SpotImage>`；follow 行為改在 `useUserLocationTracking` hook（hub 與 detail 兩個地圖面自動受惠）；marker 視覺改在 pure resolver `marker-style.ts`。

**Tech Stack:** Bun test（`--preload ./test-setup.ts`）、expo-image、expo-location、MapLibre RN、MMKV/SQLite（既有 seams）。

**Spec:** `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`（Phase 0 = 0.0–0.3、Phase 1 = 1.1–1.7；0.4/0.5 proxy＋pipeline 等 WAF spike 結果後另出 plan）。

## Global Constraints

- 測試一律 `bun run test:unit` 或 `bun test --preload ./test-setup.ts <file>` — 裸 `bun test` 會炸（CLAUDE.md Workflow）。
- 型別檢查：`bunx tsc --noEmit`。
- UI 字串一律 `useT()`；新 key 先加 `libs/i18n/locales/en.json`，再補 `zh-Hant.json`（Rule 11）。i18n parity 測試會擋漏。
- 顏色一律 `useTheme()` token（Rule 4）；錯誤態要誠實（Rule 8）；高頻 sensor 值不進 React state（Rule 9）。
- 每個 task 結尾 commit（訊息已給）。不要 push。

---

### Task 1: `/lite` 圖片 normalize（修「圖片整體出不來」的 app 端主因）

**Files:**
- Modify: `libs/services/pilgrimage/anitabi-points.ts`（新增 `normalizeLiteBangumi`）
- Modify: `libs/services/pilgrimage/anitabi-service.ts`（網路路徑 + `rowToBangumi` 兩處呼叫）
- Test: `__tests__/unit/pilgrimage/anitabi-service.test.ts`（追加兩個 test）

**Interfaces:**
- Produces: `normalizeLiteBangumi(bangumi: AnitabiBangumi): AnitabiBangumi` — idempotent；Task 3/4 假設 litePoints/cover 已是絕對 URL。

- [ ] **Step 1: 寫 failing tests**（追加到 `anitabi-service.test.ts`；沿用檔內既有 import，缺的補上）

```ts
import type { PilgrimageRow, PilgrimageSaveInput } from '../../../libs/db';

const RELATIVE_LITE = {
  id: 115908,
  cn: '',
  title: '響け！ユーフォニアム',
  city: '宇治市',
  cover: '/images/bangumi/115908.jpg',
  color: '#4a90d9',
  geo: [34.89, 135.8] as [number, number],
  zoom: 12,
  modified: 0,
  pointsLength: 577,
  imagesLength: 500,
  litePoints: [
    { id: 'pt1', name: '宇治橋', image: '/images/points/115908/pt1.jpg', ep: 1, s: 120, geo: [34.9, 135.8] as [number, number] },
  ],
};

const noopCache = {
  get: async () => null,
  getWithMeta: async () => null,
  set: async () => undefined,
  delete: async () => undefined,
} as unknown as typeof CacheService;

test('lite payload images are normalized before return and persist', async () => {
  let saved: PilgrimageSaveInput | null = null;
  const svc = AnitabiService.resetForTests({
    client: { getLite: async () => ({ ...RELATIVE_LITE }) } as unknown as typeof AnitabiClient,
    db: {
      getPilgrimage: async () => null,
      savePilgrimage: async (row: PilgrimageSaveInput) => { saved = row; },
    } as unknown as typeof LocalDB,
    cache: noopCache,
  });
  const out = await svc.getAnimePilgrimage(115908);
  expect(out?.litePoints[0]?.image).toBe('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
  expect(out?.cover).toBe('https://image.anitabi.cn/bangumi/115908.jpg?plan=h160');
  expect(saved?.litePointsJson ?? '').toContain('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
});

test('rowToBangumi heals relative paths cached by older builds (no cache-bust needed)', async () => {
  const row: PilgrimageRow = {
    bangumi_id: 115908,
    title: '響け！ユーフォニアム',
    title_cn: null,
    city: null,
    cover: '/images/bangumi/115908.jpg',
    color: null,
    center_lat: 34.89,
    center_lng: 135.8,
    zoom: 12,
    points_length: 577,
    images_length: 500,
    lite_points_json: JSON.stringify(RELATIVE_LITE.litePoints),
    cached_at: 0,
    expires_at: Number.MAX_SAFE_INTEGER,
  };
  const svc = AnitabiService.resetForTests({
    client: { getLite: async () => { throw new Error('must not hit network'); } } as unknown as typeof AnitabiClient,
    db: { getPilgrimage: async () => row, savePilgrimage: async () => undefined } as unknown as typeof LocalDB,
    cache: noopCache,
  });
  const out = await svc.getAnimePilgrimage(115908);
  expect(out?.litePoints[0]?.image).toBe('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
  expect(out?.cover).toBe('https://image.anitabi.cn/bangumi/115908.jpg?plan=h160');
});
```

（若 `PilgrimageRow` 欄位與 `libs/db.ts` 實際定義有出入，以 `libs/db.ts` 為準修 fixture，不改斷言。）

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-service.test.ts`
Expected: 兩個新 test FAIL（image 仍是 `/images/...` 相對路徑）。

- [ ] **Step 3: 實作 `normalizeLiteBangumi`**（`anitabi-points.ts` 底部；補 `AnitabiBangumi` 進既有 type import）

```ts
/**
 * Normalize a raw `/lite` payload: `cover` and litePoint `image` arrive as
 * host-relative `/images/...` paths and must become absolute CDN URLs before
 * they are rendered or persisted. Idempotent — already-absolute URLs pass
 * through unchanged, so re-running on rows cached by older builds is safe.
 */
export function normalizeLiteBangumi(bangumi: AnitabiBangumi): AnitabiBangumi {
  return {
    ...bangumi,
    cover: normalizeAnitabiImageUrl(bangumi.cover, bangumi.id),
    litePoints: normalizeRawPoints(
      (bangumi.litePoints ?? []) as unknown as readonly RawAnitabiPoint[],
      bangumi.id
    ),
  };
}
```

`anitabi-service.ts` 兩處：

```ts
// import 區:
import { normalizeLiteBangumi, normalizeRawPoints } from './anitabi-points';

// getAnimePilgrimage 網路路徑，null 檢查之後、memCache.set 之前:
      if (fresh === null) {
        this.memCache.set(bangumiId, { kind: 'miss' });
        return null;
      }

      fresh = normalizeLiteBangumi(fresh);
      this.memCache.set(bangumiId, { kind: 'hit', value: fresh });

// rowToBangumi 最後:
    return normalizeLiteBangumi({
      id: row.bangumi_id,
      // …既有欄位全部保持不變…
      imagesLength: row.images_length ?? 0,
    });
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-service.test.ts && bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-points.test.ts`
Expected: 全 PASS（含既有測試 — 若既有 fixture 用了無 image 的 litePoint 被 drop，改 fixture 給它合法 image，因為 imageless lite point 本來就渲染不了）。

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/anitabi-points.ts libs/services/pilgrimage/anitabi-service.ts __tests__/unit/pilgrimage/anitabi-service.test.ts
git commit -m "fix(pilgrimage): normalize /lite cover+litePoint images at the service choke point"
```

---

### Task 2: stale-if-error（過期快取在斷網／被擋時照樣供資料）

**Files:**
- Modify: `libs/services/pilgrimage/anitabi-service.ts`
- Test: `__tests__/unit/pilgrimage/anitabi-service.test.ts`

**Interfaces:**
- Consumes: `CacheService.getWithMeta<T>(key, graceMs)`（既有；ttl+grace 內回 `{ value, isStale }`）。
- Produces: 行為保證 — network 失敗且有舊資料 → 回舊資料不 throw。NOT_FOUND 仍回 null/[]（那是資料事實，不是故障）。

- [ ] **Step 1: 寫 failing tests**

```ts
test('lite: expired SQLite row is served when the network fails', async () => {
  const expiredRow: PilgrimageRow = {
    bangumi_id: 42,
    title: 'Stale Anime',
    title_cn: null, city: null,
    cover: 'https://image.anitabi.cn/bangumi/42.jpg?plan=h160',
    color: null, center_lat: 1, center_lng: 2, zoom: 10,
    points_length: 3, images_length: 3,
    lite_points_json: '[]',
    cached_at: 0,
    expires_at: 1, // long expired
  };
  const svc = AnitabiService.resetForTests({
    client: {
      getLite: async () => { throw new DataSourceError('SERVER_ERROR', 'HTTP 500'); },
    } as unknown as typeof AnitabiClient,
    db: { getPilgrimage: async () => expiredRow, savePilgrimage: async () => undefined } as unknown as typeof LocalDB,
    cache: noopCache,
  });
  const out = await svc.getAnimePilgrimage(42);
  expect(out?.title).toBe('Stale Anime');
});

test('detail: stale cached points are served when the network fails', async () => {
  const stalePoints = [
    { id: 'p1', name: '駅前', image: 'https://image.anitabi.cn/points/42/p1.jpg?plan=h160', ep: 1, s: 0, geo: [1, 2] as [number, number] },
  ];
  const svc = AnitabiService.resetForTests({
    client: {
      getPoints: async () => { throw new DataSourceError('SERVER_ERROR', 'HTTP 500'); },
      getPointsDetail: async () => { throw new DataSourceError('SERVER_ERROR', 'HTTP 500'); },
    } as unknown as typeof AnitabiClient,
    db: { getPilgrimage: async () => null, savePilgrimage: async () => undefined } as unknown as typeof LocalDB,
    cache: {
      ...noopCache,
      get: async () => null, // fresh read misses (expired)
      getWithMeta: async (_k: string, graceMs: number) =>
        graceMs > 0 ? { value: stalePoints, isStale: true } : null,
    } as unknown as typeof CacheService,
  });
  const out = await svc.getDetailedPoints(42);
  expect(out).toHaveLength(1);
  expect(out[0]?.id).toBe('p1');
});
```

- [ ] **Step 2: 確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-service.test.ts`
Expected: 兩個新 test FAIL（現在直接 throw）。

- [ ] **Step 3: 實作**

`getAnimePilgrimage`：過期 row 不再丟棄，留作 fallback —

```ts
      // 3. SQLite cache
      let staleRow: PilgrimageRow | null = null;
      try {
        const row = await this.db.getPilgrimage(bangumiId);
        if (row) {
          if (row.expires_at > this.now()) {
            const decoded = this.rowToBangumi(row);
            this.memCache.set(bangumiId, { kind: 'hit', value: decoded });
            return decoded;
          }
          // Expired — keep as a stale-if-error fallback instead of discarding.
          staleRow = row;
        }
      } catch (err) {
        console.warn('[AnitabiService] SQLite read failed:', err);
      }

      // 4. Network
      let fresh: AnitabiBangumi | null;
      try {
        fresh = await this.client.getLite(bangumiId);
      } catch (err) {
        if (err instanceof DataSourceError && err.code === 'NOT_FOUND') {
          this.memCache.set(bangumiId, { kind: 'miss' });
          return null;
        }
        if (staleRow) {
          // Stale beats blank: anitabi is a fragile third party (CF WAF 403s,
          // see spec 2026-07-03 §1.1) — serve the expired row rather than
          // rendering an empty screen over data we still hold.
          const decoded = this.rowToBangumi(staleRow);
          this.memCache.set(bangumiId, { kind: 'hit', value: decoded });
          return decoded;
        }
        throw err;
      }
```

`getDetailedPoints`：頂部常數 + 私有 helper，兩個 throw 點前先試 stale —

```ts
/** How far past TTL a cached detail payload may still be served on network failure. */
const DETAIL_STALE_GRACE_MS = 90 * 24 * 60 * 60 * 1000;
```

```ts
  private async readStaleDetail(bangumiId: number): Promise<AnitabiPoint[] | null> {
    try {
      const meta = await this.cache.getWithMeta<AnitabiPoint[]>(
        DETAIL_CACHE_KEY_PREFIX + bangumiId,
        DETAIL_STALE_GRACE_MS
      );
      if (meta && Array.isArray(meta.value) && meta.value.length > 0) {
        this.detailMemCache.set(bangumiId, { kind: 'hit', value: meta.value });
        return meta.value;
      }
    } catch {
      // stale read is best-effort
    }
    return null;
  }
```

兩個 throw 點（`pointsResult.status === 'rejected'` 的非 404 分支、外層 `catch` 的非 404 分支）都改成：

```ts
          const stale = await this.readStaleDetail(bangumiId);
          if (stale) return stale;
          throw err;
```

- [ ] **Step 4: 確認 pass**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-service.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/anitabi-service.ts __tests__/unit/pilgrimage/anitabi-service.test.ts
git commit -m "feat(pilgrimage): stale-if-error — serve expired lite/detail cache when anitabi is unreachable"
```

---

### Task 3: `<SpotImage>` 統一圖片元件（誠實錯誤態，取代 8+ 個裸 `<Image>`）

**Files:**
- Create: `components/pilgrimage/SpotImage.tsx`
- Modify: `libs/i18n/locales/en.json`、`libs/i18n/locales/zh-Hant.json`（`pilgrimage.image.unavailable`）
- Modify（換用 SpotImage）: `app/(tabs)/pilgrimage/index.tsx:807-814,977-982,1056-1061`、`components/pilgrimage/PilgrimageHubSheet.tsx:367-369,504-506,614-616`、`components/pilgrimage/AnimePilgrimageCard.tsx:85,148`、`app/(tabs)/pilgrimage/album.tsx:530-534,1055-1074`、`app/(tabs)/pilgrimage/plan.tsx:389,618`
- Test: `__tests__/unit/pilgrimage/spot-image.test.ts`（新檔，測 pure helper）

**Interfaces:**
- Produces: `SpotImage({ uri, style, contentFit?, recyclingKey?, accessibilityLabel?, fallbackIconSize? })`；`sanitizeImageUri(uri: string | null | undefined): string | null`（僅接受 http(s)，空字串/相對路徑 → null）。Task 4 會把內部 source 換成 `anitabiImageSource`。

- [ ] **Step 1: failing test**（`spot-image.test.ts`）

```ts
import { describe, expect, test } from 'bun:test';
import { sanitizeImageUri } from '../../../components/pilgrimage/SpotImage';

describe('sanitizeImageUri', () => {
  test('accepts absolute http(s) urls', () => {
    expect(sanitizeImageUri('https://image.anitabi.cn/points/1/a.jpg?plan=h160')).toBe(
      'https://image.anitabi.cn/points/1/a.jpg?plan=h160'
    );
  });
  test('rejects empty, relative, and non-string input', () => {
    expect(sanitizeImageUri('')).toBeNull();
    expect(sanitizeImageUri('   ')).toBeNull();
    expect(sanitizeImageUri('/images/points/1/a.jpg')).toBeNull();
    expect(sanitizeImageUri(null)).toBeNull();
    expect(sanitizeImageUri(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 確認 fail**（module 不存在）

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-image.test.ts`
Expected: FAIL — Cannot find module。

- [ ] **Step 3: 實作 `SpotImage.tsx`**

```tsx
// SpotImage — shared scene/cover image for pilgrimage surfaces. Every remote
// pilgrimage image renders through this so a load failure shows an honest
// error tile (CLAUDE.md Rule 8) instead of a silent blank box.
import { useState } from 'react';
import { StyleSheet, View, type StyleProp } from 'react-native';
import { Image, type ImageContentFit, type ImageStyle } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { useT } from '../../libs/i18n';

/** Only absolute http(s) URLs are renderable by expo-image. */
export function sanitizeImageUri(uri: string | null | undefined): string | null {
  if (typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  return /^https?:\/\//.test(trimmed) ? trimmed : null;
}

export interface SpotImageProps {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
  accessibilityLabel?: string;
  fallbackIconSize?: number;
}

export function SpotImage({
  uri,
  style,
  contentFit = 'cover',
  recyclingKey,
  accessibilityLabel,
  fallbackIconSize = 18,
}: SpotImageProps) {
  const { theme } = useTheme();
  const t = useT();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const clean = sanitizeImageUri(uri);

  if (clean === null || failedUri === clean) {
    return (
      <View
        accessibilityLabel={t('pilgrimage.image.unavailable')}
        style={[styles.fallback, { backgroundColor: theme.background.tertiary }, style]}>
        <Ionicons name="image-outline" size={fallbackIconSize} color={theme.text.tertiary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: clean }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={recyclingKey}
      accessibilityLabel={accessibilityLabel}
      onError={() => setFailedUri(clean)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
```

i18n：`en.json` 的 `pilgrimage` 下加 `"image": { "unavailable": "Image unavailable" }`；`zh-Hant.json` 對應 `"image": { "unavailable": "無法載入圖片" }`。

- [ ] **Step 4: 換掉呼叫點**

上列 Modify 清單逐一把 `<Image source={{ uri: X }} …/>` 換成 `<SpotImage uri={X} …/>`（保留原 style/contentFit；`AnimePilgrimageCard.tsx:85` 的 `(anime.cover ?? '').replace(...)` 直接傳原值給 `uri`，空字串由 sanitize 擋掉；`plan.tsx:389,618` 順手刪掉 `.replace('?plan=h160','?plan=h360')` hack，傳原 cover）。裝飾性 LinearGradient fallback（如 album `FolderCard`）已是誠實空態的保留不動。完成後檢查：

Run: `grep -n "source={{ uri" app/\(tabs\)/pilgrimage/index.tsx app/\(tabs\)/pilgrimage/plan.tsx app/\(tabs\)/pilgrimage/album.tsx components/pilgrimage/PilgrimageHubSheet.tsx components/pilgrimage/AnimePilgrimageCard.tsx`
Expected: 僅剩非 anitabi 面（如 capture 本地檔 `entry.capture.uri`）— capture 本地 URI 也建議換 SpotImage（`file://` 開頭會被 sanitize 擋！所以 sanitize 需放行 `file://`）：把 regex 改成 `/^(https?|file):\/\//` 並補一個 test case `expect(sanitizeImageUri('file:///tmp/x.jpg')).toBe('file:///tmp/x.jpg')`。

- [ ] **Step 5: 全部驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: PASS（i18n parity 含新 key）。

- [ ] **Step 6: Commit**

```bash
git add components/pilgrimage/SpotImage.tsx __tests__/unit/pilgrimage/spot-image.test.ts libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json 'app/(tabs)/pilgrimage/index.tsx' 'app/(tabs)/pilgrimage/plan.tsx' 'app/(tabs)/pilgrimage/album.tsx' components/pilgrimage/PilgrimageHubSheet.tsx components/pilgrimage/AnimePilgrimageCard.tsx
git commit -m "feat(pilgrimage): SpotImage — honest error tile + disk cache for every discovery-surface image"
```

---

### Task 4: anitabi header 實驗（Referer + 瀏覽器 UA，低成本可能直接解封）

**Files:**
- Modify: `libs/services/pilgrimage/anitabi-image.ts`（`anitabiImageSource` + headers 常數）
- Modify: `components/pilgrimage/SpotImage.tsx`（source 換 `anitabiImageSource`）
- Modify: `libs/clients/anitabi-client.ts`（fetch headers 加 Referer）
- Test: `__tests__/unit/pilgrimage/anitabi-image.test.ts`

**Interfaces:**
- Produces: `anitabiImageSource(url: string): { uri: string; headers?: Record<string, string> }` — 僅 `image.anitabi.cn` 帶 headers，其他 host 原樣。

- [ ] **Step 1: failing tests**（追加到 `anitabi-image.test.ts`）

```ts
import { anitabiImageSource } from '../../../libs/services/pilgrimage/anitabi-image';

describe('anitabiImageSource', () => {
  test('anitabi CDN urls get referer + browser UA headers', () => {
    const s = anitabiImageSource('https://image.anitabi.cn/points/1/a.jpg?plan=h160');
    expect(s.uri).toBe('https://image.anitabi.cn/points/1/a.jpg?plan=h160');
    expect(s.headers?.Referer).toBe('https://anitabi.cn/');
    expect(s.headers?.['User-Agent']).toContain('Safari');
  });
  test('non-anitabi urls stay bare', () => {
    expect(anitabiImageSource('https://lain.bgm.tv/x.jpg').headers).toBeUndefined();
  });
  test('unparseable input stays bare', () => {
    expect(anitabiImageSource('not-a-url').headers).toBeUndefined();
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-image.test.ts`

- [ ] **Step 3: 實作**（`anitabi-image.ts` 底部）

```ts
const ANITABI_IMAGE_HOST = 'image.anitabi.cn';

/**
 * anitabi's CDN sits behind a Cloudflare WAF that 403s obvious non-browser
 * clients (see spec 2026-07-03 §1.1). A referer + mobile-Safari UA keeps us on
 * the allow side — same workaround class as the api.bgm.tv redirect issue
 * documented in [animeId].tsx. Non-anitabi hosts get a bare source.
 */
export const ANITABI_IMAGE_HEADERS: Record<string, string> = {
  Referer: 'https://anitabi.cn/',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

export function anitabiImageSource(url: string): { uri: string; headers?: Record<string, string> } {
  try {
    if (new URL(url).host === ANITABI_IMAGE_HOST) {
      return { uri: url, headers: { ...ANITABI_IMAGE_HEADERS } };
    }
  } catch {
    // not an absolute URL — return bare and let the image layer surface the failure
  }
  return { uri: url };
}
```

`SpotImage.tsx`：`import { anitabiImageSource } from '../../libs/services/pilgrimage/anitabi-image';`，`source={{ uri: clean }}` → `source={anitabiImageSource(clean)}`。
`anitabi-client.ts:116-118` headers 加一行 `Referer: 'https://anitabi.cn/',`（API 保留自報身分的 UA — 只有被證實擋 UA 才升級成瀏覽器 UA）。

- [ ] **Step 4: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: PASS。

- [ ] **Step 5: 真機驗證（此 task 的真正驗收）**

Dev client 跑起來開 pilgrimage hub：(a) 縮圖顯示 → 實驗成功；(b) 出現 Task 3 的錯誤 tile → headers 不夠（IP/TLS 指紋層級），記錄結果到 spec §5 spike 1，proxy（0.4）升為必做。兩種結果都算 task 完成 — 目標是把「沉默空白」變成「已知狀態」。

- [ ] **Step 6: Commit**

```bash
git add libs/services/pilgrimage/anitabi-image.ts components/pilgrimage/SpotImage.tsx libs/clients/anitabi-client.ts __tests__/unit/pilgrimage/anitabi-image.test.ts
git commit -m "feat(pilgrimage): referer+browser-UA headers for anitabi CDN images (WAF workaround experiment)"
```

---

### Task 5: `location-service` 支援 high-accuracy watch 選項

**Files:**
- Modify: `libs/services/pilgrimage/location-service.ts:229-245`
- Test: `__tests__/unit/pilgrimage/location-service.test.ts`

**Interfaces:**
- Produces: `subscribeToUpdates(cb, { distanceIntervalMeters?, timeIntervalMs?, accuracy?: 'balanced' | 'high' })`；Task 6 以 `{ accuracy: 'high', distanceIntervalMeters: 10, timeIntervalMs: 3000 }` 呼叫。

- [ ] **Step 1: failing test**（沿用該檔既有 fake-module seam 的寫法；斷言傳給 `watchPositionAsync` 的 options）

```ts
test('subscribeToUpdates passes high-accuracy options through', async () => {
  let captured: Record<string, unknown> | null = null;
  const svc = makeServiceWithModule({
    // 沿用檔內既有 fake module helper；若無，仿照鄰近測試 new LocationService(fakeModule) 的建構方式
    watchPositionAsync: async (opts: Record<string, unknown>) => {
      captured = opts;
      return { remove: () => undefined };
    },
    Accuracy: { Balanced: 3, High: 4 },
    requestForegroundPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
  });
  svc.subscribeToUpdates(() => undefined, {
    accuracy: 'high',
    distanceIntervalMeters: 10,
    timeIntervalMs: 3000,
  });
  await Bun.sleep(0); // flush the async IIFE
  expect(captured?.accuracy).toBe(4);
  expect(captured?.distanceInterval).toBe(10);
  expect(captured?.timeInterval).toBe(3000);
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/location-service.test.ts`（TS error 或 accuracy=3）

- [ ] **Step 3: 實作**

```ts
  subscribeToUpdates(
    callback: (loc: LatLng) => void,
    options: {
      distanceIntervalMeters?: number;
      timeIntervalMs?: number;
      accuracy?: 'balanced' | 'high';
    } = {}
  ): Unsubscribe {
    // …
        watcher = await this.module.watchPositionAsync(
          {
            accuracy:
              options.accuracy === 'high'
                ? (this.module.Accuracy?.High ?? 4)
                : (this.module.Accuracy?.Balanced ?? 3),
            distanceInterval: options.distanceIntervalMeters ?? 50,
            timeInterval: options.timeIntervalMs ?? 10_000,
          },
```

- [ ] **Step 4: 確認 pass** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/location-service.test.ts`

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/location-service.ts __tests__/unit/pilgrimage/location-service.test.ts
git commit -m "feat(pilgrimage): location watch accepts accuracy option for follow mode"
```

---

### Task 6: 地圖預設跟人 — 有權限即 following、watcher 常駐、pan 不殺 watcher

**Files:**
- Modify: `libs/services/pilgrimage/locate-fab-state.ts`（`shouldAutoEngageFollow` pure fn）
- Modify: `libs/services/pilgrimage/use-user-location-tracking.ts`（watcher gating + auto-engage + 檔頭註解）
- Test: `__tests__/unit/pilgrimage/locate-fab-decision.test.ts`

**Interfaces:**
- Produces: `shouldAutoEngageFollow(input: { permission: LocatePermissionState; alreadyEngaged: boolean }): boolean`。
- 行為保證：兩個地圖面（hub `map.tsx`、detail `[animeId].tsx`）自動獲得新行為，不需改 screen。FAB cycle（idle→following→compass→idle）與 pan→idle 不變 — 但 idle 現在仍有粗粒度 watcher，藍點不再死掉。

- [ ] **Step 1: failing test**

```ts
import { shouldAutoEngageFollow } from '../../../libs/services/pilgrimage/locate-fab-state';

describe('shouldAutoEngageFollow', () => {
  test('engages once when permission granted', () => {
    expect(shouldAutoEngageFollow({ permission: 'granted', alreadyEngaged: false })).toBe(true);
  });
  test('never re-engages after the first time (user pan wins)', () => {
    expect(shouldAutoEngageFollow({ permission: 'granted', alreadyEngaged: true })).toBe(false);
  });
  test('never engages without permission', () => {
    expect(shouldAutoEngageFollow({ permission: 'undetermined', alreadyEngaged: false })).toBe(false);
    expect(shouldAutoEngageFollow({ permission: 'denied', alreadyEngaged: false })).toBe(false);
    expect(shouldAutoEngageFollow({ permission: 'blocked', alreadyEngaged: false })).toBe(false);
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/locate-fab-decision.test.ts`

- [ ] **Step 3: 實作**

`locate-fab-state.ts` 底部：

```ts
/**
 * One-shot decision: a map surface auto-enters `following` the first time it
 * sees granted permission, so opening a map means "the map is on me" without a
 * FAB tap. `alreadyEngaged` is the surface's mount-scoped latch — once the
 * user pans away (→ idle) we never fight them by re-engaging.
 */
export function shouldAutoEngageFollow(input: {
  permission: LocatePermissionState;
  alreadyEngaged: boolean;
}): boolean {
  return input.permission === 'granted' && !input.alreadyEngaged;
}
```

`use-user-location-tracking.ts`：

1. watcher effect（:209-227）— gating 換成權限、選項依 follow 狀態：

```ts
  // ─── Location watcher (alive whenever permission is granted) ────────────
  // idle keeps a battery-friendly coarse watcher so the puck stays live;
  // following/compass tighten to walking cadence for the recentre loop.
  useEffect(() => {
    if (internal.permission !== 'granted') return;
    const follow = internal.followState !== 'idle';
    const unsubscribe = locationService.subscribeToUpdates(
      (loc) => {
        if (sameLatLng(locationRef.current, loc)) {
          const cb = onFollowLocationRef.current;
          const fs = followStateRef.current;
          if (cb && (fs === 'following' || fs === 'compass')) cb(loc, fs);
          return;
        }
        setLocation(loc);
        const cb = onFollowLocationRef.current;
        const fs = followStateRef.current;
        if (cb && (fs === 'following' || fs === 'compass')) cb(loc, fs);
      },
      follow ? { accuracy: 'high', distanceIntervalMeters: 10, timeIntervalMs: 3000 } : {}
    );
    return unsubscribe;
  }, [internal.followState, internal.permission]);
```

2. auto-engage effect（新，放 permission effect 之後）：

```ts
  // ─── Auto-engage follow on first granted permission (once per mount) ────
  const autoEngagedRef = useRef(false);
  useEffect(() => {
    if (!shouldAutoEngageFollow({ permission: internal.permission, alreadyEngaged: autoEngagedRef.current })) {
      return;
    }
    autoEngagedRef.current = true;
    setInternal((prev) =>
      prev.followState === 'idle' ? { ...prev, followState: 'following' } : prev
    );
    locationService
      .getCurrentLocation()
      .then((loc) => {
        if (!loc) return;
        if (!sameLatLng(locationRef.current, loc)) setLocation(loc);
        onFollowLocationRef.current?.(loc, 'following');
      })
      .catch(() => undefined);
  }, [internal.permission]);
```

3. 檔頭註解第 4-6 行更新：idle 在有權限時仍保有粗粒度 watcher（puck 不死）；預設進 following。

- [ ] **Step 4: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: PASS。

- [ ] **Step 5: 真機/模擬器走查**：開 hub 地圖（已授權）→ 不按 FAB 地圖即置中並跟隨（模擬器 Features > Location > Freeway Drive）；滑動地圖 → 停止跟隨但藍點持續移動；按 FAB → 恢復跟隨。

- [ ] **Step 6: Commit**

```bash
git add libs/services/pilgrimage/locate-fab-state.ts libs/services/pilgrimage/use-user-location-tracking.ts __tests__/unit/pilgrimage/locate-fab-decision.test.ts
git commit -m "feat(pilgrimage): follow-by-default map — watcher alive on grant, auto-engage once, pan pauses without killing the puck"
```

---

### Task 7: hub 地圖 visited 標記（攻略感第一步）

**Files:**
- Modify: `libs/services/pilgrimage/map-engine/marker-style.ts:78-86`（anime 分支尊重 `visited`）
- Modify: `app/(tabs)/pilgrimage/map.tsx:453-473`（帶入 `visited`）
- Test: `__tests__/unit/pilgrimage/map-marker-style.test.ts`

- [ ] **Step 1: failing test**

```ts
test('anime centroid honors the visited flag (green progress ring)', () => {
  const visual = resolveMarkerVisual({
    id: 'bgm:115908', kind: 'anime', lat: 34.9, lng: 135.8,
    title: '響け！ユーフォニアム', color: '#4a90d9', pointsLength: 577, visited: true,
  } as MapMarker);
  expect(visual.visited).toBe(true);
  expect(visual.shape).toBe('balloon');
});

test('city88 markers never show visited', () => {
  const visual = resolveMarkerVisual({
    id: '88:1', kind: 'city88', lat: 35, lng: 139, title: 'x', color: '#caa64b', visited: true,
  } as MapMarker);
  expect(visual.visited).toBe(false);
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/map-marker-style.test.ts`（anime case FAIL）

- [ ] **Step 3: 實作**

`marker-style.ts` anime centroid 分支：`visited: false,` → `visited: !!m.visited,`（city88 分支保持 `false`）。
`map.tsx` `baseAnitabiMarkers` push 物件加一行：

```ts
        color: anime.color || theme.accent,
        // ≥1 known point checked in ⇒ the user has started this anime's route.
        visited: entry.visitedCount > 0,
```

- [ ] **Step 4: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit`（`native-map-markers.test.tsx` 應照常過 — balloon 的 visited 渲染早已存在）

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/map-engine/marker-style.ts 'app/(tabs)/pilgrimage/map.tsx' __tests__/unit/pilgrimage/map-marker-style.test.ts
git commit -m "feat(pilgrimage): hub anime markers turn visited-green once any of their spots is checked in"
```

---

### Task 8: 拆日本 gate — 人在哪裡就置中哪裡

**Files:**
- Modify: `libs/services/pilgrimage/pilgrimage-hub-initial-view.ts`（:39 拿掉 `pointInJapan`；刪 `pointInJapan` fn 與 `JAPAN_BOUNDS` 常數 — 該檔內已無其他使用者；`JAPAN_CENTER` 留作無定位 fallback）
- Modify: `app/(tabs)/pilgrimage/index.tsx:107`（`tier.inJapan` → `tier.farAway`）
- Modify: `libs/i18n/locales/*.json`（rename key；`grep -rn "inJapan" libs/i18n/locales/` 的每個 hit）
- Test: `__tests__/unit/pilgrimage/pilgrimage-hub-initial-view.test.ts`

- [ ] **Step 1: failing test**

```ts
test('fresh user location outside Japan is centered (Taipei)', () => {
  const view = resolvePilgrimageHubInitialView({
    focusBangumiId: null,
    now: 1_000,
    snapshot: {
      userLocation: { latitude: 25.03, longitude: 121.56 },
      userLocationUpdatedAt: 1_000,
      updatedAt: 1_000,
    } as never,
  });
  expect(view.center).toEqual({ lat: 25.03, lng: 121.56 });
});
```

同檔若有「非日本位置 → fallback」的既有斷言，翻轉其預期（現在也置中用戶）。

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/pilgrimage-hub-initial-view.test.ts`

- [ ] **Step 3: 實作**

```ts
  const freshUserLocation = getFreshUserLocation(snapshot, now);
  if (freshUserLocation) {
    return toView(freshUserLocation.latitude, freshUserLocation.longitude, HUB_USER_ZOOM);
  }
```

刪 `pointInJapan` + `JAPAN_BOUNDS`。i18n：en `"farAway": "Far away"`、zh-Hant `"farAway": "遠方聖地"`（其餘 locale 依 grep hits 同步 rename），`index.tsx:107` labelKey 改 `'tabs.pilgrimageScreen.tier.farAway'`。

- [ ] **Step 4: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit`（i18n parity 測試會抓漏改的 locale）

- [ ] **Step 5: Commit**

```bash
git add libs/services/pilgrimage/pilgrimage-hub-initial-view.ts 'app/(tabs)/pilgrimage/index.tsx' libs/i18n/locales __tests__/unit/pilgrimage/pilgrimage-hub-initial-view.test.ts
git commit -m "fix(pilgrimage): center on the user anywhere in the world — Japan is a fallback, not a gate"
```

---

### Task 9: 小修 — cluster 點擊有反應、夜間地圖主題會自己翻轉

**Files:**
- Modify: `app/(tabs)/pilgrimage/map.tsx`（:196-204 時鐘、:729-745 傳 `onClusterPress`）

（純 glue — `resolveMapModeWithClock`、engine 的 cluster 行為都已有測試；本 task 無新單元測試。）

- [ ] **Step 1: 夜間時鐘**（取代 :201-204 的 inline `new Date().getHours()`）

```ts
  // 'auto' flips at 18:00/06:00 — poll the hour once a minute so a map left
  // open actually switches (same-value setState bails, so this is render-free).
  const [clockHour, setClockHour] = useState(() => new Date().getHours());
  useEffect(() => {
    if (mapThemePref !== 'auto') return;
    const id = setInterval(() => setClockHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, [mapThemePref]);
  const styleUrl = resolveMapStyleUrl(
    resolveMapModeWithClock(mapThemePref, effectiveMode, clockHour),
    styleOverride
  );
```

- [ ] **Step 2: cluster 點擊**（handlers 區加，`<MapSurface>` 傳入）

```ts
  // Small clusters delegate to the surface (big ones zoom-to-fit inside the
  // engine). Fit their bbox; a same-building cluster (degenerate bbox) jumps
  // past CLUSTER_DISABLE_AT instead so the markers actually separate.
  const handleClusterPress = useCallback((members: readonly MapMarker[]) => {
    if (members.length === 0) return;
    let south = 90, west = 180, north = -90, east = -180;
    for (const m of members) {
      south = Math.min(south, m.lat);
      north = Math.max(north, m.lat);
      west = Math.min(west, m.lng);
      east = Math.max(east, m.lng);
    }
    if (north - south < 0.0005 && east - west < 0.0005) {
      mapRef.current?.recenter(members[0].lat, members[0].lng, 16, { animate: true });
      return;
    }
    mapRef.current?.fitBounds?.({ south, west, north, east }, { animate: true });
  }, []);
```

```tsx
        onClusterPress={handleClusterPress}
```

- [ ] **Step 3: 驗證** → Run: `bunx tsc --noEmit && bun run test:unit`；模擬器點一個小 cluster → 地圖 zoom 進去。

- [ ] **Step 4: Commit**

```bash
git add 'app/(tabs)/pilgrimage/map.tsx'
git commit -m "fix(pilgrimage): cluster taps zoom in; auto map theme flips at night without a re-render nudge"
```

---

### Task 10: SpotSheet「你的位置 → 這個點」方位 + 地圖面 i18n 清理

**Files:**
- Modify: `components/pilgrimage/detail/_helpers.ts`（`bearingDegrees`、`cardinalFromBearing`）
- Modify: `components/pilgrimage/detail/SpotSheet.tsx`（`userLocation` prop、方位 chip、:281-285 三條英文硬字串換 t()）
- Modify: `app/(tabs)/pilgrimage/[animeId].tsx:859`（傳 `userLocation`）
- Modify: `components/pilgrimage/LocateFab.tsx:112-117`（a11y 換 t()）
- Modify: `libs/i18n/locales/en.json`、`zh-Hant.json`
- Test: `__tests__/unit/pilgrimage/spot-bearing.test.ts`（新檔）

**Interfaces:**
- Produces: `bearingDegrees(from: { latitude: number; longitude: number }, to: readonly [number, number]): number`（0–360，北=0）；`cardinalFromBearing(deg: number): 'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'nw'`。
- SpotSheet props 增加 `userLocation?: { latitude: number; longitude: number } | null`（memo 比較函式同步加此欄位）。

- [ ] **Step 1: failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { bearingDegrees, cardinalFromBearing } from '../../../components/pilgrimage/detail/_helpers';

describe('bearingDegrees', () => {
  test('due north is 0', () => {
    expect(Math.round(bearingDegrees({ latitude: 35, longitude: 139 }, [36, 139]))).toBe(0);
  });
  test('due east is ~90', () => {
    expect(Math.round(bearingDegrees({ latitude: 35, longitude: 139 }, [35, 140]))).toBe(90);
  });
});

describe('cardinalFromBearing', () => {
  test('rounds to 8 compass points with wraparound', () => {
    expect(cardinalFromBearing(0)).toBe('n');
    expect(cardinalFromBearing(44)).toBe('ne');
    expect(cardinalFromBearing(90)).toBe('e');
    expect(cardinalFromBearing(337.5)).toBe('n');
    expect(cardinalFromBearing(292.5)).toBe('nw');
  });
});
```

- [ ] **Step 2: 確認 fail** → Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/spot-bearing.test.ts`

- [ ] **Step 3: 實作 helpers**（`_helpers.ts` 底部）

```ts
/** Great-circle initial bearing from the user to a spot, degrees 0–360 (north = 0). */
export function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: readonly [number, number]
): number {
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to[0] * Math.PI) / 180;
  const Δλ = ((to[1] - from.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export type CardinalKey = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function cardinalFromBearing(deg: number): CardinalKey {
  const keys: readonly CardinalKey[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  return keys[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
```

- [ ] **Step 4: i18n keys**

`en.json` `pilgrimage.detail` 下加：

```json
"distanceAway": "{distance} away",
"sceneOfCount": "{index} of {count} scenes",
"sceneLocation": "Scene location",
"bearing": { "n": "N", "ne": "NE", "e": "E", "se": "SE", "s": "S", "sw": "SW", "w": "W", "nw": "NW" }
```

`pilgrimage.map` 下加：

```json
"locateIdleA11y": "Show my location",
"locateFollowingA11y": "Stop following my location",
"locateCompassA11y": "Stop compass mode"
```

`zh-Hant.json` 對應：`"distanceAway": "距離 {distance}"`、`"sceneOfCount": "第 {index}／{count} 個場景"`、`"sceneLocation": "場景位置"`、`"bearing": { "n": "北", "ne": "東北", "e": "東", "se": "東南", "s": "南", "sw": "西南", "w": "西", "nw": "西北" }`、`"locateIdleA11y": "顯示我的位置"`、`"locateFollowingA11y": "停止跟隨我的位置"`、`"locateCompassA11y": "停止指南針模式"`。

- [ ] **Step 5: SpotSheet**

props/解構加 `userLocation = null`；帶型別的 key 對照表（放元件外）：

```ts
import type { TranslationKey } from '../../../libs/i18n';
import { bearingDegrees, cardinalFromBearing, type CardinalKey } from './_helpers';

const BEARING_LABEL_KEY: Record<CardinalKey, TranslationKey> = {
  n: 'pilgrimage.detail.bearing.n',
  ne: 'pilgrimage.detail.bearing.ne',
  e: 'pilgrimage.detail.bearing.e',
  se: 'pilgrimage.detail.bearing.se',
  s: 'pilgrimage.detail.bearing.s',
  sw: 'pilgrimage.detail.bearing.sw',
  w: 'pilgrimage.detail.bearing.w',
  nw: 'pilgrimage.detail.bearing.nw',
};
```

（若 `TranslationKey` 的實際匯出名不同，以 `libs/i18n` 匯出為準。）distance row（:278-286）改成：

```tsx
        <View style={styles.distanceRow}>
          <Ionicons name="location-outline" size={15} color={theme.text.tertiary} />
          <ThemedText variant="bodySmall" tone="secondary">
            {distanceKm != null
              ? t('pilgrimage.detail.distanceAway', { distance: formatDistanceKm(distanceKm) })
              : sceneStack.length > 1
                ? t('pilgrimage.detail.sceneOfCount', {
                    index: activeSceneIndex + 1,
                    count: sceneStack.length,
                  })
                : t('pilgrimage.detail.sceneLocation')}
          </ThemedText>
          {bearing != null && distanceKm != null ? (
            <>
              <Ionicons
                name="arrow-up"
                size={12}
                color={theme.text.secondary}
                style={{ transform: [{ rotate: `${Math.round(bearing)}deg` }] }}
              />
              <ThemedText variant="bodySmall" tone="secondary">
                {t(BEARING_LABEL_KEY[cardinalFromBearing(bearing)])}
              </ThemedText>
            </>
          ) : null}
        </View>
```

`bearing` 在元件 body 計算（spot/userLocation 變更時重算，量小不需 memo）：

```ts
  const bearing =
    spot && userLocation && hasValidGeo(spot) ? bearingDegrees(userLocation, spot.geo) : null;
```

memo 比較函式（:444 附近）加 `prev.userLocation?.latitude === next.userLocation?.latitude && prev.userLocation?.longitude === next.userLocation?.longitude &&`。
（若 `t()` 的第二參數簽名不是 `(key, params)`，以 `libs/i18n` 的 `useT` 實際簽名為準 — `engine.ts:73-79` 已有 `{name}` 插值實作。）

- [ ] **Step 6: 呼叫點與 LocateFab**

`[animeId].tsx:859` 的 `<SpotSheet` props 加 `userLocation={userLocation}`（:175 已在 scope）。
`LocateFab.tsx`：`import { useT } from '../../libs/i18n';`，元件內 `const t = useT();`，:112-117 改：

```ts
  const a11y =
    state === 'idle'
      ? t('pilgrimage.map.locateIdleA11y')
      : state === 'following'
        ? t('pilgrimage.map.locateFollowingA11y')
        : t('pilgrimage.map.locateCompassA11y');
```

- [ ] **Step 7: 驗證** → Run: `bun run test:unit && bunx tsc --noEmit` Expected: PASS。模擬器開 detail → 點一個 spot → 距離旁出現方位箭頭與「東北」等字樣。

- [ ] **Step 8: Commit**

```bash
git add components/pilgrimage/detail/_helpers.ts components/pilgrimage/detail/SpotSheet.tsx 'app/(tabs)/pilgrimage/[animeId].tsx' components/pilgrimage/LocateFab.tsx libs/i18n/locales/en.json libs/i18n/locales/zh-Hant.json __tests__/unit/pilgrimage/spot-bearing.test.ts
git commit -m "feat(pilgrimage): spot sheet shows bearing to the spot; localize distance row + locate FAB a11y"
```

---

## 完成後整體驗收（對照 spec Phase 0/1 驗收）

- [ ] `bun run test:unit` 全綠、`bunx tsc --noEmit` 無錯。
- [ ] Hub / featured / nearby 縮圖顯示（或顯示誠實錯誤 tile — 不再有沉默空白）。
- [ ] 飛航模式：看過的動漫資料與（已快取的）圖照常；TTL 過期＋斷網 → 仍顯示舊資料。
- [ ] 開地圖（已授權定位）→ 不按任何鍵即置中自己並跟隨；滑動後藍點仍活著；FAB 一鍵回追。
- [ ] 人在日本以外 → hub 地圖置中自己，不是日本。
- [ ] 走過任一點的動漫，hub 地圖 marker 變綠。
- [ ] SpotSheet 顯示「距離 + 方位」。
- [ ] Task 4 真機結果已記錄到 spec §5（決定 proxy 是否升級為必做）。
