// Anitabi serves scene images via its CDN with a `?plan=hXXX` size token —
// `?plan=h160` is the default ~284×160 thumbnail used in lists, maps, and
// card decks (~12 KB). Dropping the param returns the original 1920×1080
// frame (~200 KB). Higher `plan=` values like `h720`/`h1080` are NOT served
// (verified — CDN returns 404). So "go big" means "drop the param".
//
// Use this ONLY for the compare overlay / comparison preview — the one place
// where the user actually frames a real-world shot against the anime still
// and pixelation is visible. Everywhere else keeps the thumbnail.

import { normalizeBangumiImage } from '../../clients/bangumi-client';

const ANITABI_IMAGE_BASE = 'https://image.anitabi.cn';
const DEFAULT_THUMBNAIL_PLAN = 'h160';

export function normalizeAnitabiImageUrl(
  url: string | null | undefined,
  bangumiId: number
): string {
  const normalized = normalizeBangumiImage(url);
  if (!normalized) return withDefaultPlan(`${ANITABI_IMAGE_BASE}/bangumi/${bangumiId}.jpg`);
  if (normalized.startsWith('//')) return withDefaultPlan(`https:${normalized}`);
  if (normalized.startsWith('/images/')) {
    return withDefaultPlan(`${ANITABI_IMAGE_BASE}${normalized.slice('/images'.length)}`);
  }
  if (normalized.startsWith('/')) {
    return withDefaultPlan(`${ANITABI_IMAGE_BASE}${normalized}`);
  }
  if (normalized.startsWith(ANITABI_IMAGE_BASE)) return withDefaultPlan(normalized);
  return normalized;
}

export function toFullResImageUrl(url: string): string {
  if (!url) return url;
  const idx = url.search(/[?&]plan=/);
  if (idx < 0) return url;
  const sepChar = url[idx];
  const after = url.indexOf('&', idx + 1);
  const tail = after < 0 ? '' : url.slice(after);
  const head = url.slice(0, idx);
  if (sepChar === '?') {
    return tail ? head + '?' + tail.slice(1) : head;
  }
  return head + tail;
}

function withDefaultPlan(url: string): string {
  if (!url || /[?&]plan=/.test(url)) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}plan=${DEFAULT_THUMBNAIL_PLAN}`;
}

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
    // Tolerate a trailing slash in the pasted origin — a double slash in the
    // proxy path would silently 404 every image.
    return `${base.replace(/\/+$/, '')}/anitabi/img${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

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
