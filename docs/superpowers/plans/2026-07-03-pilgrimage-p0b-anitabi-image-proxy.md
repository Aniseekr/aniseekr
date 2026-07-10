# Pilgrimage Phase 0b（Anitabi 圖片 Proxy on Cloudflare Workers）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `aniseeker_backend`（Elysia on Cloudflare Workers）加一條 `GET /anitabi/img/*` edge proxy，把 app 對 anitabi 圖片的請求換成瀏覽器身分轉發、邊緣快取 30 天，讓被 CF WAF 擋掉的圖片穩定出得來；app 端只在 `ANITABI_PROXY_BASE` 有值時改走 proxy，否則維持 P0 的直連＋header fallback。

**Architecture:** proxy 是 pure fetch 轉發，不需要 Elysia 的任何功能，所以在 `src/index.ts` 的 fetch handler 開頭攔截 `/anitabi/img/`（在 `app.fetch` 之前），完全繞過 `/api` group 的 access-token gate；真正的邏輯放進可注入依賴的 pure function `handleAnitabiImage(request, deps)`（`src/routes/anitabi/imageProxy.ts`），用 fake fetch／fake cache／fake ctx 在 `bun test` 下單測。快取用 Workers 內建 `caches.default`（免 binding），cache key = 進來的 proxy URL；一次成功的 2xx 在 30 天內同時充當 stale-on-error 路徑（HIT 先回、永遠碰不到上游）。app 端的接線只是把 P0 Task 4 產出的 `anitabiImageSource()` 加一個「proxy base 有值就改寫 URI」的分支，`<SpotImage>` 自動受惠、零改動。

**Tech Stack:** Elysia（沿用，但 proxy 不經過它）、Cloudflare Workers（`caches.default` Cache API、`ctx.waitUntil`）、wrangler 4、bun:test（backend repo 的第一批測試，無 preload）；app 端 expo-image + bun preload 測試。

**Spec:** `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`。本 plan 覆蓋 **Phase 0 表的 0.4（自家圖片線路 proxy）** 與 **§5 spike 1（Workers egress 是否被 anitabi WAF 擋）**。**0.5（資料快照）不在本 plan** — 它併入 Phase 2 的 pipeline plan（跨 repo、隨 `anitabi-index` release 一起發）。授權面（Anitabi CC BY-NC-SA 4.0）：本 proxy 只轉發圖片 bytes、不改寫也不移除任何內容，`origin`/`originURL` 出處欄位活在 point metadata（app 端顯示，proxy 不觸碰），故 proxy 對授權中性。

---

## 與大綱／main 的差異（top-of-plan deltas，已逐一 Read 核對）

1. **`anitabiImageSource` / `ANITABI_IMAGE_HEADERS` / `ANITABI_IMAGE_HOST` 尚未在 main。** 目前 `libs/services/pilgrimage/anitabi-image.ts`（已 Read）只有 `normalizeAnitabiImageUrl` / `toFullResImageUrl` / `withDefaultPlan`。這三個 symbol 是 **P0 plan（`2026-07-03-pilgrimage-p0-data-lifeline-p1-map-follow.md`）Task 4 的產物**。→ **本 plan 前置依賴 P0 已合併**；Task 3 的 Consumes 以 P0 Task 4 的逐字簽名為準（已從 P0 plan 核對，見 Task 3 Interfaces）。
2. **Backend repo 幾乎零測試設施。** `package.json`（已 Read）`test` script 是 `echo "Error: no test specified" && exit 1`、無 `deploy` script；`node_modules` 尚未安裝；`tsconfig.json` 只有 `types: ["bun-types"]`，**沒有** `@cloudflare/workers-types`，也**沒有任何 tsc gate**（無 typecheck script）。→ 本 plan 建立該 repo 第一批 `bun test`；純函式測試零外部 import（只 `bun:test` + 本地檔），**實測無需 `bun install` 即可跑**（已在本機驗證）；`wrangler deploy`（Task 4）才需要先 `bun install`。
3. **`wrangler.toml`（已 Read）極簡**：`name = "aniseeker-backend"`、`main = "src/index.ts"`、`compatibility_date = "2025-11-15"`、`compatibility_flags = ["nodejs_compat"]`、`account_id`、`[observability]`。**無 routes、無 custom domain、無 bindings。** → 預設 `workers_dev` 開啟，公開 origin = `aniseeker-backend.<subdomain>.workers.dev`，subdomain 是 account-specific 且 repo 內查不到 → Task 4 部署後從 wrangler 輸出讀取（決策 gate）。`caches.default` 免 binding。
4. **`src/index.ts`（已 Read）已用 `ExecutionContext`**（未安裝 workers-types，untyped 但無 gate 故不阻擋部署，wrangler/esbuild 只 strip types）。`caches.default` 同屬 Workers 執行期全域、bun-types 無此型別 → 在 index.ts 內對 `caches.default` 做 localized cast（見 Task 2），不新增全域 ambient 宣告以免與 bun-types 衝突。
5. **token gate 只在 `/api` group 內**（已核對 `src/app.ts:6-31` + `src/middlewares/accessToken.ts`）。`accessTokenMiddleware` 掛在 `.group("/api", …)` 內部（app.ts:29）→ 在 `app.fetch` 之前攔截 `/anitabi/img/` 就完全繞過，**不需改 Elysia**。這也順帶解決大綱裡「Elysia handler 怎麼拿到 ctx」的開放問題：index.ts 的 fetch handler 第三參數就是 `ctx`，走 index.ts 攔截即可直接用 `ctx.waitUntil`。

---

## Global Constraints

- **測試指令（兩個 repo 不同）**：
  - aniseekr（`/Users/kidney/Workspace/Work/ani/aniseekr`）一律 `bun run test:unit` 或 `bun test --preload ./test-setup.ts <file>` — **裸 `bun test` 會炸**（漏掉 native-module mock，CLAUDE.md Workflow）。基線 1397 tests 綠。
  - backend（`/Users/kidney/Workspace/Work/ani/aniseeker_backend`）**沒有** test-setup preload，本 plan 是它的第一批測試 → 單檔跑 `bun test src/routes/anitabi/imageProxy.test.ts`（純函式、零 native 依賴，**不需先 `bun install`**）。
- **型別檢查**：aniseekr `bunx tsc --noEmit`（基線有 2 個 pre-existing TS2882 `global.css` 噪音，不得新增其他錯誤）。backend repo **無 tsc gate**（未裝 workers-types、無 typecheck script）→ 本 plan 不在 backend 引入 tsc gate；backend 的正確性靠 `bun test` + Task 4 的實機 deploy probe 驗證。
- **i18n（Rule 11）**：本 phase **不新增任何 user-facing UI 字串**（proxy 對用戶完全不可見、無 UI）→ 不動 `libs/i18n/locales/*.json`。若未來要顯示「圖片來源」等文案，才依 Rule 11 先加 `en.json` 再補 `zh-Hant.json`。
- **顏色（Rule 4）**：本 phase 無 UI，不涉及 `useTheme()`。
- **誠實錯誤態（Rule 8）**：proxy 失敗一律回**真實的** 404（path 不允許）／502（上游掛了且無 cache）＋短 JSON，**永遠不回一張假圖或占位圖**。app 端 proxy 未啟用時 `ANITABI_PROXY_BASE` 保持空字串、走 P0 的直連＋header fallback，不假裝已接上 proxy。
- **高頻 state 離開 render path（Rule 9）**：app 端唯一改動是 pure function `anitabiImageSource`（無 React state、無 effect），不進 render path。
- **每個 task 結尾 commit（訊息已給）。不要 push。** backend commit 在 backend repo，aniseekr commit 在 aniseekr repo。

---

### Task 1: backend — `imageProxy.ts` pure handler（path allow-list + 30d cache，`bun test` 單測）

**Files:**
- Create: `src/routes/anitabi/imageProxy.ts`（`/Users/kidney/Workspace/Work/ani/aniseeker_backend/src/routes/anitabi/imageProxy.ts`）
- Create（Test）: `src/routes/anitabi/imageProxy.test.ts`
- Modify: `package.json`（`scripts.test`：`echo "Error: no test specified" && exit 1` → `bun test`）

**Interfaces:**
- Produces: `resolveAnitabiUpstream(requestUrl: string): string | null` — 把 proxy URL 映射成 `https://image.anitabi.cn/<rest>?plan=…`，非允許 path 回 `null`（Task 2 用來判斷是否進 proxy 分支的同款規則）。
- Produces: `handleAnitabiImage(request: Request, deps: AnitabiImageDeps): Promise<Response>`，其中
  ```ts
  export interface AnitabiImageDeps {
    cache: {
      match(request: Request): Promise<Response | undefined>;
      put(request: Request, response: Response): Promise<void>;
    };
    fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
    waitUntil: (promise: Promise<unknown>) => void;
  }
  ```
  Task 2 以 `{ cache: caches.default, fetchImpl: (u,i)=>fetch(u,i), waitUntil: (p)=>ctx.waitUntil(p) }` 呼叫。

- [ ] **Step 1: 寫 failing tests**（`src/routes/anitabi/imageProxy.test.ts`）

```ts
import { describe, expect, test } from 'bun:test';
import {
  resolveAnitabiUpstream,
  handleAnitabiImage,
  type AnitabiImageDeps,
} from './imageProxy';

// ── fakes ──────────────────────────────────────────────────────────────────
function makeFakeCache() {
  const store = new Map<string, Response>();
  const putCalls: string[] = [];
  const cache: AnitabiImageDeps['cache'] = {
    async match(req: Request): Promise<Response | undefined> {
      const hit = store.get(req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req: Request, res: Response): Promise<void> {
      putCalls.push(req.url);
      store.set(req.url, res);
    },
  };
  return { cache, store, putCalls };
}

function makeDeps(overrides: {
  fetchImpl?: AnitabiImageDeps['fetchImpl'];
  seed?: { url: string; response: Response };
}) {
  const { cache, store, putCalls } = makeFakeCache();
  if (overrides.seed) store.set(overrides.seed.url, overrides.seed.response);
  const pending: Promise<unknown>[] = [];
  const fetchCalls: string[] = [];
  const deps: AnitabiImageDeps = {
    cache,
    fetchImpl:
      overrides.fetchImpl ??
      (async (url) => {
        fetchCalls.push(url);
        return new Response('IMG-BYTES', {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }),
    waitUntil: (p) => {
      pending.push(p);
    },
  };
  return { deps, pending, fetchCalls, putCalls, store };
}

const settle = (pending: Promise<unknown>[]) => Promise.all(pending);

// ── resolveAnitabiUpstream ──────────────────────────────────────────────────
describe('resolveAnitabiUpstream', () => {
  test('maps an allowed points path to the anitabi CDN, forwarding plan', () => {
    expect(
      resolveAnitabiUpstream(
        'https://proxy.example.workers.dev/anitabi/img/points/115908/pt1.jpg?plan=h160'
      )
    ).toBe('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
  });

  test('maps an allowed bangumi path with no query', () => {
    expect(
      resolveAnitabiUpstream('https://proxy.example.workers.dev/anitabi/img/bangumi/240038.jpg')
    ).toBe('https://image.anitabi.cn/bangumi/240038.jpg');
  });

  test('drops every query param except plan', () => {
    expect(
      resolveAnitabiUpstream(
        'https://proxy.example.workers.dev/anitabi/img/points/1/a.jpg?plan=h160&evil=1&x=2'
      )
    ).toBe('https://image.anitabi.cn/points/1/a.jpg?plan=h160');
  });

  test('rejects paths outside the points/ and bangumi/ allow-list (open-proxy guard)', () => {
    expect(
      resolveAnitabiUpstream('https://proxy.example.workers.dev/anitabi/img/evil/x.jpg')
    ).toBeNull();
    expect(
      resolveAnitabiUpstream('https://proxy.example.workers.dev/anitabi/img/')
    ).toBeNull();
  });

  test('rejects requests that are not under /anitabi/img/', () => {
    expect(
      resolveAnitabiUpstream('https://proxy.example.workers.dev/api/rate/photos/random')
    ).toBeNull();
    expect(resolveAnitabiUpstream('https://proxy.example.workers.dev/')).toBeNull();
  });

  test('path traversal normalizes away and cannot escape the allow-list', () => {
    // new URL() collapses `..`; the result no longer starts with /anitabi/img/.
    expect(
      resolveAnitabiUpstream('https://proxy.example.workers.dev/anitabi/img/../secret')
    ).toBeNull();
  });
});

// ── handleAnitabiImage ──────────────────────────────────────────────────────
describe('handleAnitabiImage', () => {
  test('404s a disallowed path without touching the network', async () => {
    const { deps, fetchCalls } = makeDeps({});
    const res = await handleAnitabiImage(
      new Request('https://proxy.example.workers.dev/anitabi/img/evil/x.jpg'),
      deps
    );
    expect(res.status).toBe(404);
    expect(fetchCalls).toHaveLength(0);
  });

  test('serves a cache HIT without hitting upstream', async () => {
    const url = 'https://proxy.example.workers.dev/anitabi/img/points/1/a.jpg?plan=h160';
    const { deps, fetchCalls } = makeDeps({
      seed: {
        url,
        response: new Response('CACHED', {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=2592000, immutable',
          },
        }),
      },
    });
    const res = await handleAnitabiImage(new Request(url), deps);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('CACHED');
    expect(fetchCalls).toHaveLength(0);
  });

  test('cache MISS fetches upstream with browser headers, returns 200, caches 30d immutable', async () => {
    const url = 'https://proxy.example.workers.dev/anitabi/img/points/115908/pt1.jpg?plan=h160';
    let sentHeaders: Headers | undefined;
    const { deps, pending, putCalls, store } = makeDeps({
      fetchImpl: async (u, init) => {
        expect(u).toBe('https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160');
        sentHeaders = new Headers(init?.headers);
        return new Response('IMG', { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      },
    });
    const res = await handleAnitabiImage(new Request(url), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=2592000, immutable');
    expect(sentHeaders?.get('Referer')).toBe('https://anitabi.cn/');
    expect(sentHeaders?.get('User-Agent')).toContain('Safari');
    await settle(pending);
    expect(putCalls).toEqual([url]);
    expect(store.get(url)?.headers.get('Cache-Control')).toBe(
      'public, max-age=2592000, immutable'
    );
  });

  test('upstream 403 becomes a 502 and is NOT cached', async () => {
    const url = 'https://proxy.example.workers.dev/anitabi/img/points/1/a.jpg?plan=h160';
    const { deps, pending, putCalls } = makeDeps({
      fetchImpl: async () => new Response('denied', { status: 403 }),
    });
    const res = await handleAnitabiImage(new Request(url), deps);
    expect(res.status).toBe(502);
    await settle(pending);
    expect(putCalls).toHaveLength(0);
  });

  test('an upstream network throw becomes a 502', async () => {
    const url = 'https://proxy.example.workers.dev/anitabi/img/bangumi/240038.jpg';
    const { deps } = makeDeps({
      fetchImpl: async () => {
        throw new Error('econnreset');
      },
    });
    const res = await handleAnitabiImage(new Request(url), deps);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `cd /Users/kidney/Workspace/Work/ani/aniseeker_backend && bun test src/routes/anitabi/imageProxy.test.ts`
Expected: FAIL — `Cannot find module './imageProxy'`（檔案還不存在）。

- [ ] **Step 3: 實作 `src/routes/anitabi/imageProxy.ts`**

```ts
// Anitabi image proxy — runs at the Cloudflare Workers edge in front of
// `image.anitabi.cn`, whose CDN sits behind a Cloudflare WAF that 403s obvious
// non-browser clients (see aniseekr spec 2026-07-03 §1.1). We forward with a
// browser Referer + mobile-Safari UA, cache 2xx responses at the edge for 30
// days, and hard-limit the path to anitabi's `points/` and `bangumi/` trees so
// this can never be abused as an open image proxy.
//
// Mounted in `src/index.ts` BEFORE Elysia so it bypasses the `/api` access-token
// gate (public read-only images). Kept dependency-injectable (AnitabiImageDeps)
// so it unit-tests under plain `bun test` without a Workers runtime.

const ANITABI_IMAGE_ORIGIN = 'https://image.anitabi.cn';
const PROXY_PATH_PREFIX = '/anitabi/img/';
const ALLOWED_PREFIXES = ['points/', 'bangumi/'] as const;

/** 30 days, immutable — anitabi image URLs are content-addressed by point id. */
const IMAGE_CACHE_CONTROL = 'public, max-age=2592000, immutable';

const UPSTREAM_HEADERS: Record<string, string> = {
  Referer: 'https://anitabi.cn/',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

export interface AnitabiImageDeps {
  cache: {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
  };
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
}

/**
 * Resolve a proxied request URL to the upstream anitabi CDN URL, or null when
 * the path is not an allowed anitabi image path. Only the `plan` size token is
 * forwarded; every other query param is dropped so cache keys stay clean and
 * arbitrary upstream query injection is impossible.
 */
export function resolveAnitabiUpstream(requestUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (!url.pathname.startsWith(PROXY_PATH_PREFIX)) return null;
  const rest = url.pathname.slice(PROXY_PATH_PREFIX.length);
  if (!ALLOWED_PREFIXES.some((prefix) => rest.startsWith(prefix))) return null;
  const plan = url.searchParams.get('plan');
  const query = plan ? `?plan=${encodeURIComponent(plan)}` : '';
  return `${ANITABI_IMAGE_ORIGIN}/${rest}${query}`;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handleAnitabiImage(
  request: Request,
  deps: AnitabiImageDeps
): Promise<Response> {
  const upstreamUrl = resolveAnitabiUpstream(request.url);
  if (upstreamUrl === null) return jsonError(404, 'not_found');

  // Cache key = the incoming (proxy) URL. A prior 2xx served here doubles as the
  // stale-on-error path: while the 30d entry lives, a HIT returns before we ever
  // touch upstream, so an anitabi outage is invisible. Best-effort only — the
  // Cache API may evict entries before their max-age (documented, honest limit).
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await deps.cache.match(cacheKey);
  if (cached) return cached;

  let upstream: Response;
  try {
    upstream = await deps.fetchImpl(upstreamUrl, { headers: UPSTREAM_HEADERS });
  } catch {
    return jsonError(502, 'upstream_unreachable');
  }
  if (!upstream.ok) return jsonError(502, 'upstream_error');

  const headers = new Headers(upstream.headers);
  headers.set('Cache-Control', IMAGE_CACHE_CONTROL);
  const response = new Response(upstream.body, { status: upstream.status, headers });
  // Clone BEFORE returning: the body stream is single-read, so the cache gets
  // the clone and the caller gets the original.
  deps.waitUntil(deps.cache.put(cacheKey, response.clone()));
  return response;
}
```

`package.json` `scripts.test` 換成：

```json
    "test": "bun test",
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `cd /Users/kidney/Workspace/Work/ani/aniseeker_backend && bun test src/routes/anitabi/imageProxy.test.ts`
Expected: 全 PASS（`resolveAnitabiUpstream` 6 例 + `handleAnitabiImage` 5 例）。

- [ ] **Step 5: Commit**（在 backend repo）

```bash
git add src/routes/anitabi/imageProxy.ts src/routes/anitabi/imageProxy.test.ts package.json
git commit -m "feat(anitabi-proxy): edge image proxy handler with path allow-list + 30d cache (unit-tested)"
```

---

### Task 2: backend — 在 `index.ts` 掛載（Elysia 之前）+ 加 deploy script

**Files:**
- Modify: `src/index.ts`（`/Users/kidney/Workspace/Work/ani/aniseeker_backend/src/index.ts`，目前 1-10 行）
- Modify: `package.json`（新增 `scripts.deploy`）

**Interfaces:**
- Consumes: Task 1 的 `handleAnitabiImage(request, deps)` 與 `AnitabiImageDeps`。
- Produces: 無新 pure API（純 glue）。行為保證：任何 `pathname` 以 `/anitabi/img/` 開頭的請求都由 proxy 處理、**不進 Elysia**、**不經過 `/api` token gate**；其餘請求原樣交給 `app.fetch`。

（純 glue，且 `caches.default` / `ExecutionContext` / `app.fetch` 需要 Workers runtime，無法在 `bun test` 下單測 — 比照 P0 plan Task 9「pure glue，no new unit test」。本 task 的驗收：Task 1 的單測不回歸 + Task 4 的實機 deploy probe。）

- [ ] **Step 1: 改 `src/index.ts`**（整檔換成）

```ts
import app from "./app";
import { bindRuntimeEnv } from "./env";
import { handleAnitabiImage, type AnitabiImageDeps } from "./routes/anitabi/imageProxy";

// Cloudflare Workers entry: export fetch handler
export default {
  fetch(request: Request, env: Record<string, string>, ctx: ExecutionContext) {
    bindRuntimeEnv(env);

    // Anitabi image proxy — handled BEFORE Elysia so it bypasses the /api
    // access-token gate (public read-only images). See routes/anitabi/imageProxy.
    if (new URL(request.url).pathname.startsWith("/anitabi/img/")) {
      return handleAnitabiImage(request, {
        // `caches.default` is the Cloudflare edge Cache API — present at runtime
        // in Workers but not typed by bun-types, hence the localized cast.
        cache: (caches as unknown as { default: AnitabiImageDeps["cache"] }).default,
        fetchImpl: (url, init) => fetch(url, init),
        waitUntil: (promise) => ctx.waitUntil(promise),
      });
    }

    return app.fetch(request, env, ctx);
  },
};
```

`package.json` 新增 script（放在 `dev` 之後）：

```json
    "deploy": "wrangler deploy",
```

- [ ] **Step 2: 確認 proxy 單測不回歸**

Run: `cd /Users/kidney/Workspace/Work/ani/aniseeker_backend && bun test src/routes/anitabi/imageProxy.test.ts`
Expected: 全 PASS（imageProxy 未動，只是被 index.ts import）。

- [ ] **Step 3: 靜態確認掛載點正確**（不部署，只讀）

Run: `cd /Users/kidney/Workspace/Work/ani/aniseeker_backend && grep -n "anitabi/img" src/index.ts`
Expected: 出現 `if (new URL(request.url).pathname.startsWith("/anitabi/img/"))` 一行，且位於 `return app.fetch` 之前（確保繞過 `/api` gate）。

- [ ] **Step 4: Commit**（在 backend repo）

```bash
git add src/index.ts package.json
git commit -m "feat(anitabi-proxy): mount /anitabi/img/* before Elysia (bypass /api gate) + deploy script"
```

---

### Task 3: aniseekr — `anitabiImageSource` 支援 proxy base（TDD 兩種模式）

**Files:**
- Modify: `libs/services/pilgrimage/anitabi-image.ts`（在 P0 Task 4 產出的 `anitabiImageSource` 區塊）
- Test: `__tests__/unit/pilgrimage/anitabi-image.test.ts`（追加 `anitabiProxyUri` + proxy-mode describe）

**Interfaces:**
- Consumes（**P0 plan Task 4 逐字產物**，前置依賴 P0 已合併）：
  ```ts
  const ANITABI_IMAGE_HOST = 'image.anitabi.cn'; // module-local
  export const ANITABI_IMAGE_HEADERS: Record<string, string>; // Referer + mobile-Safari UA
  export function anitabiImageSource(url: string): { uri: string; headers?: Record<string, string> };
  ```
- Produces:
  - `export const ANITABI_PROXY_BASE: string`（''＝直連；Task 4 Branch A 填入確認後的 workers.dev origin，一行 diff）。
  - `export function anitabiProxyUri(url: string, base?: string): string | null` — anitabi CDN URL → `${base}/anitabi/img/<path><query>`；`base` 空或非 anitabi host 或無法 parse → `null`。
  - 修改後的 `anitabiImageSource`：`ANITABI_PROXY_BASE` 有值且是 anitabi host → 回 `{ uri: proxied }`（**無 headers**，proxy 端自己帶瀏覽器身分）；否則維持 P0 行為（anitabi host → `{ uri, headers }`；其餘 → `{ uri }`）。`<SpotImage>`（P0 Task 4 已把 source 換成 `anitabiImageSource(clean)`）**零改動**自動受惠。

- [ ] **Step 1: 寫 failing tests**（追加到 `__tests__/unit/pilgrimage/anitabi-image.test.ts` 底部）

先把頂部 import 擴充（P0 Task 4 已 import `anitabiImageSource`；本 task 再加 `anitabiProxyUri`, `ANITABI_PROXY_BASE`）：

```ts
import {
  anitabiImageSource,
  anitabiProxyUri,
  ANITABI_PROXY_BASE,
} from '../../../libs/services/pilgrimage/anitabi-image';
```

追加測試：

```ts
describe('anitabiProxyUri', () => {
  it('rewrites an anitabi CDN point url to the proxy path when a base is set', () => {
    expect(
      anitabiProxyUri(
        'https://image.anitabi.cn/points/115908/pt1.jpg?plan=h160',
        'https://proxy.example.workers.dev'
      )
    ).toBe('https://proxy.example.workers.dev/anitabi/img/points/115908/pt1.jpg?plan=h160');
  });

  it('rewrites an anitabi bangumi cover url', () => {
    expect(
      anitabiProxyUri(
        'https://image.anitabi.cn/bangumi/240038.jpg?plan=h160',
        'https://proxy.example.workers.dev'
      )
    ).toBe('https://proxy.example.workers.dev/anitabi/img/bangumi/240038.jpg?plan=h160');
  });

  it('returns null when the base is empty (direct mode)', () => {
    expect(anitabiProxyUri('https://image.anitabi.cn/points/1/a.jpg?plan=h160', '')).toBeNull();
  });

  it('returns null for non-anitabi hosts', () => {
    expect(
      anitabiProxyUri('https://lain.bgm.tv/x.jpg', 'https://proxy.example.workers.dev')
    ).toBeNull();
  });

  it('returns null for unparseable input', () => {
    expect(anitabiProxyUri('not-a-url', 'https://proxy.example.workers.dev')).toBeNull();
  });
});

describe('anitabiImageSource proxy wiring', () => {
  // Robust to both states: this test stays green whether ANITABI_PROXY_BASE is
  // still '' (direct) or Task 4 Branch A has filled in a real origin.
  it('honors the configured proxy base', () => {
    const url = 'https://image.anitabi.cn/points/1/a.jpg?plan=h160';
    const s = anitabiImageSource(url);
    if (ANITABI_PROXY_BASE) {
      expect(s.uri).toBe(anitabiProxyUri(url));
      expect(s.headers).toBeUndefined();
    } else {
      expect(s.uri).toBe(url);
      expect(s.headers?.Referer).toBe('https://anitabi.cn/');
    }
  });
});
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `bun test --preload ./test-setup.ts __tests__/unit/pilgrimage/anitabi-image.test.ts`
Expected: FAIL — `anitabiProxyUri` / `ANITABI_PROXY_BASE` 尚未匯出。

- [ ] **Step 3: 實作**（`libs/services/pilgrimage/anitabi-image.ts`）

在 P0 Task 4 的 `ANITABI_IMAGE_HOST` const 之後、`anitabiImageSource` 之前，插入：

```ts
/**
 * When non-empty, all anitabi CDN images are routed through our own Cloudflare
 * Workers proxy (`aniseeker_backend` GET /anitabi/img/*) instead of hitting
 * image.anitabi.cn directly. Empty string = direct connection with the P0
 * Referer+UA headers. Flip this on only after the Workers egress WAF probe
 * passes (see plan 2026-07-03-pilgrimage-p0b Task 4).
 */
export const ANITABI_PROXY_BASE = '';

/**
 * Rewrite an anitabi CDN url to the proxy path. Returns null when there is no
 * proxy base, the host is not the anitabi image CDN, or the input is not a URL —
 * callers then fall back to the direct source.
 */
export function anitabiProxyUri(url: string, base: string = ANITABI_PROXY_BASE): string | null {
  if (!base) return null;
  try {
    const u = new URL(url);
    if (u.host !== ANITABI_IMAGE_HOST) return null;
    return `${base}/anitabi/img${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}
```

把 P0 Task 4 的 `anitabiImageSource` 改成（proxy 分支優先）：

```ts
export function anitabiImageSource(url: string): { uri: string; headers?: Record<string, string> } {
  const proxied = anitabiProxyUri(url);
  if (proxied) return { uri: proxied };
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

（注意：`ANITABI_IMAGE_HOST` 為 P0 Task 4 的 module-local const；本 task 的 `anitabiProxyUri` 與既有 `anitabiImageSource` 同檔共用，不重複宣告。若 P0 實際命名有出入，以檔內既有名稱為準。）

- [ ] **Step 4: 全部驗證**

Run: `bun run test:unit && bunx tsc --noEmit`
Expected: PASS（含 P0 Task 4 既有的 `anitabiImageSource` 測試 — 直連模式下我的改動不影響其斷言：non-anitabi / unparseable 仍回 bare、anitabi host 仍帶 headers）。`tsc` 僅剩基線 2 個 TS2882。

- [ ] **Step 5: Commit**（在 aniseekr repo）

```bash
git add libs/services/pilgrimage/anitabi-image.ts __tests__/unit/pilgrimage/anitabi-image.test.ts
git commit -m "feat(pilgrimage): route anitabi CDN images through the proxy when ANITABI_PROXY_BASE is set"
```

---

### Task 4:【決策 gate】部署 + Workers egress WAF probe（spec §5 spike 1），兩分支

> 這是本 plan 唯一需要外部系統才能定案的 task（workers.dev origin 未知 + Workers egress 是否被 anitabi WAF 擋未知）。**proxy 本身就是 probe**（大綱建議的「直接部署 proxy 後打一次」最短路徑）。無新單元測試 — 產出是「已知狀態」與二選一的接線。

**Files（依分支）:**
- Branch A：Modify `libs/services/pilgrimage/anitabi-image.ts`（`ANITABI_PROXY_BASE` 一行填值）
- Branch B：Modify `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md`（§5 spike 1 記錄結果）

**前置：** 在 backend repo `bun install`（`wrangler` 是 devDep，deploy 需要）；`wrangler login` 或設好 `CLOUDFLARE_API_TOKEN`；帳號需對得上 `wrangler.toml` 的 `account_id = 406bc4a2914d6326365dfe2098003f7b`。

- [ ] **Step 1: 確認身分與帳號**

Run: `cd /Users/kidney/Workspace/Work/ani/aniseeker_backend && bun install && bunx wrangler whoami`
Expected: 印出登入的 email 與可用 account（含 `406bc4a2914d6326365dfe2098003f7b`）。若帳號對不上 → 先切換帳號／token，不要繼續。

- [ ] **Step 2: 部署並讀取公開 origin**

Run: `cd /Users/kidney/Workspace/Work/ani/aniseeker_backend && bun run deploy`
Expected: wrangler 印出部署完成與 URL，形如 `https://aniseeker-backend.<subdomain>.workers.dev`。**把這個 URL 記為 `<ORIGIN>`。**
（若輸出顯示 `workers_dev` 被停用或需要 route/custom domain：那是手動 dashboard 步驟，超出本 plan 自動化範圍 — 見「不做」；先在 dashboard 開 workers.dev 取得可打的 origin。）

- [ ] **Step 3: 打 proxy — egress WAF probe**

用 repo 測試已視為真實 anitabi 內容的 subject `240038` 的 cover（`anitabi-image.test.ts` 用它做 `?plan=h360` 保留測試 → 是真的 anitabi 圖）：

```bash
# 允許的 path → 期待 200 + image/* content-type（Branch A）或 502（Branch B）
curl -sS -D - -o /dev/null "https://<ORIGIN>/anitabi/img/bangumi/240038.jpg?plan=h160"

# open-proxy 防護 → 期待 404
curl -sS -o /dev/null -w "guard=%{http_code}\n" "https://<ORIGIN>/anitabi/img/evil/x.jpg"

# 第二次同一 URL → 期待 cf-cache-status: HIT（驗證邊緣快取）
curl -sS -D - -o /dev/null "https://<ORIGIN>/anitabi/img/bangumi/240038.jpg?plan=h160" | grep -i "cf-cache-status\|cache-control"
```

Expected（guard 必為 `guard=404`）。第一條的 status 決定分支：

- [ ] **Step 4a:【Branch A】egress 通（第一條回 200 + `Content-Type: image/*`）**

Workers egress 沒被 anitabi WAF 擋 → 啟用 proxy：

1. 在 aniseekr `libs/services/pilgrimage/anitabi-image.ts` 把 `ANITABI_PROXY_BASE` 填成 `<ORIGIN>`（無結尾斜線）：

   ```ts
   export const ANITABI_PROXY_BASE = 'https://aniseeker-backend.<subdomain>.workers.dev';
   ```

2. Run: `bun run test:unit && bunx tsc --noEmit`
   Expected: PASS（Task 3 的 `honors the configured proxy base` 測試自動切到 proxy 分支仍綠；`anitabiProxyUri` 純測試不變）。

3. Commit（在 aniseekr repo）：

   ```bash
   git add libs/services/pilgrimage/anitabi-image.ts
   git commit -m "chore(pilgrimage): enable anitabi image proxy (workers.dev origin confirmed, WAF egress passes)"
   ```

4. 真機／dev client 開 pilgrimage hub → featured/nearby/卡片縮圖經 proxy 顯示（或 Task 3/P0 的誠實錯誤 tile，不再沉默空白）。把「spike 1：Workers egress 通、proxy 上線」記到 spec §5（可與 Branch B 互斥、只記事實）。

- [ ] **Step 4b:【Branch B】egress 被擋（第一條回 502 `upstream_error`）**

Workers egress 同樣被 anitabi WAF 擋（上游回 403 → proxy 誠實回 502）→ **不啟用 proxy**：

1. aniseekr `ANITABI_PROXY_BASE` **維持 `''`** — app 保留 P0 Task 4 的直連＋Referer/UA fallback，不假裝已接上（Rule 8）。**不 commit aniseekr 程式碼**。

2. proxy 的**程式碼與部署照常保留**（有效資產）：等 anitabi WAF 放行 workers.dev egress、或改上游來源時，只要翻 `ANITABI_PROXY_BASE` 一行即生效。

3. 升級路徑（**超出本 plan、另出 plan**）：由 `Aniseekr-source` pipeline 把 anitabi 圖片鏡像進 Cloudflare R2（Phase 2 pipeline plan 處理），proxy 改指 R2。

4. 把結果寫進 `docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md` §5「開放決策」spike 1，例如追加一句：

   > **spike 1 結果（2026-07-03）**：Workers egress 打 `image.anitabi.cn` 仍被 CF WAF 擋（proxy 回 502 upstream_error）。header 繞法（Referer + mobile-Safari UA）在 Workers 出口 IP 段無效 → 屬 IP/TLS 指紋層級封鎖。proxy 程式碼與部署保留待命；圖片可靠性升級為「Aniseekr-source pipeline 鏡像至 R2」（Phase 2 pipeline plan）。

   Commit（在 aniseekr repo）：

   ```bash
   git add docs/superpowers/specs/2026-07-03-pilgrimage-ux-overhaul-design.md
   git commit -m "docs(pilgrimage): record spike 1 result — Workers egress WAF-blocked, escalate to R2 mirror"
   ```

---

## 不做（YAGNI，對齊 spec §6 與大綱）

- **R2 全量鏡像** — 只有 Branch B 失敗才升級，且另出 plan（Phase 2 pipeline）。本 plan 只做零儲存的 pure proxy。
- **rate limiting / auth** — 公開唯讀圖片、上游本身有 CF；proxy 只放行 `points/` 與 `bangumi/` path、只轉 `plan` query，已足夠防濫用。
- **custom domain / route 設定自動化** — Task 4 只記錄手動確認 origin 的步驟；custom domain 是 dashboard 手動事，不進 plan。
- **0.5 資料快照（抓 `/points`、隨 index release）** — 併入 Phase 2 pipeline plan。
- **backend repo 的 tsc gate / 完整測試框架** — 只建立本 feature 需要的第一批 `bun test`，不改造整個 repo 的 CI。

## 完成後整體驗收（對照 spec Phase 0 表 0.4 + §5 spike 1）

- [ ] backend `bun test src/routes/anitabi/imageProxy.test.ts` 全綠（allow-list、cache HIT、MISS→put+30d、403→502、throw→502、plan 轉發、path traversal 防護）。
- [ ] aniseekr `bun run test:unit` 全綠、`bunx tsc --noEmit` 僅剩基線 2 個 TS2882；`anitabiProxyUri` 兩模式 + `anitabiImageSource` proxy 接線測試皆過。
- [ ] `bun run deploy` 成功，`<ORIGIN>` 已記錄；`/anitabi/img/evil/x.jpg` 回 404（open-proxy 防護生效）。
- [ ] spike 1 有明確結論並記到 spec §5：
  - Branch A → `ANITABI_PROXY_BASE` 已填、hub 縮圖經 proxy 顯示、第二次請求 `cf-cache-status: HIT`；或
  - Branch B → `ANITABI_PROXY_BASE` 維持 `''`、proxy 待命、升級路徑（R2）已記錄。
- [ ] 無假資料：proxy 失敗回真 404/502 短 JSON，app 未啟用時走誠實 fallback，皆不出現占位假圖（Rule 8）。
</content>
</invoke>
