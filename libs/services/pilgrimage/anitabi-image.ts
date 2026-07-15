// Anitabi serves scene images with a `?plan=hXXX` size token —
// `?plan=h160` is the default ~284×160 thumbnail used in lists, maps, and
// card decks (~12 KB). Dropping the param returns the original 1920×1080
// frame (~200 KB). Higher `plan=` values like `h720`/`h1080` are NOT served
// (verified — CDN returns 404). So "go big" means "drop the param".
//
// Use this ONLY for the compare overlay / comparison preview — the one place
// where the user actually frames a real-world shot against the anime still
// and pixelation is visible. Everywhere else keeps the thumbnail.

import { normalizeBangumiImage } from '../../clients/bangumi-client';

// This is the image origin selected by Anitabi's own frontend on
// www.anitabi.cn. The legacy image.anitabi.cn origin is WAF-blocked in Japan.
const ANITABI_IMAGE_ORIGIN = 'https://img-tc.anitabi.cn';
const BLOCKED_IMAGE_ORIGIN = 'https://image.anitabi.cn';
const INVALID_WEBSITE_IMAGE_ORIGIN = 'https://www.anitabi.cn';
const INVALID_WEBSITE_IMAGE_PREFIX = '/images';
const DEFAULT_THUMBNAIL_PLAN = 'h160';

export function normalizeAnitabiImageUrl(
  url: string | null | undefined,
  bangumiId: number
): string {
  const normalized = normalizeBangumiImage(url);
  if (!normalized) return withDefaultPlan(`${ANITABI_IMAGE_ORIGIN}/bangumi/${bangumiId}.jpg`);
  if (normalized.startsWith('//')) {
    return withDefaultPlan(rewriteUnavailableImageUrl(`https:${normalized}`));
  }
  if (normalized.startsWith('/images/')) {
    return withDefaultPlan(
      `${ANITABI_IMAGE_ORIGIN}${normalized.slice(INVALID_WEBSITE_IMAGE_PREFIX.length)}`
    );
  }
  if (normalized.startsWith('/')) {
    return withDefaultPlan(`${ANITABI_IMAGE_ORIGIN}${normalized}`);
  }
  if (normalized.startsWith(ANITABI_IMAGE_ORIGIN)) return withDefaultPlan(normalized);
  const rewritten = rewriteUnavailableImageUrl(normalized);
  return rewritten === normalized ? normalized : withDefaultPlan(rewritten);
}

export function toFullResImageUrl(url: string): string {
  if (!url) return url;
  const accessibleUrl = rewriteUnavailableImageUrl(url);
  const idx = accessibleUrl.search(/[?&]plan=/);
  if (idx < 0) return accessibleUrl;
  const sepChar = accessibleUrl[idx];
  const after = accessibleUrl.indexOf('&', idx + 1);
  const tail = after < 0 ? '' : accessibleUrl.slice(after);
  const head = accessibleUrl.slice(0, idx);
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

const LEGACY_ANITABI_IMAGE_HOST = 'image.anitabi.cn';

/**
 * When non-empty, legacy anitabi CDN images are routed through our Cloudflare
 * Workers proxy (`aniseeker_backend` GET /anitabi/img/*) instead of hitting
 * image.anitabi.cn directly. The proxy remains disabled because its upstream
 * is also WAF-blocked; normal rendering uses Anitabi's img-tc origin above.
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
    if (u.host !== LEGACY_ANITABI_IMAGE_HOST) return null;
    // Tolerate a trailing slash in the pasted origin — a double slash in the
    // proxy path would silently 404 every image.
    return `${base.replace(/\/+$/, '')}/anitabi/img${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export function anitabiImageSource(url: string): { uri: string; headers?: Record<string, string> } {
  const accessibleUrl = rewriteUnavailableImageUrl(url);
  const proxied = anitabiProxyUri(accessibleUrl);
  if (proxied) return { uri: proxied };
  return { uri: accessibleUrl };
}

function rewriteUnavailableImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin === BLOCKED_IMAGE_ORIGIN) {
      return `${ANITABI_IMAGE_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (
      parsed.origin === INVALID_WEBSITE_IMAGE_ORIGIN &&
      parsed.pathname.startsWith(`${INVALID_WEBSITE_IMAGE_PREFIX}/`)
    ) {
      return `${ANITABI_IMAGE_ORIGIN}${parsed.pathname.slice(INVALID_WEBSITE_IMAGE_PREFIX.length)}${parsed.search}${parsed.hash}`;
    }
    return url;
  } catch {
    return url;
  }
}
