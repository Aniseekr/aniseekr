/**
 * Open a `WatchOption` in the user's preferred way.
 *
 * Logic:
 *   1. If `preferAppDeepLink` is on AND the option has a `deepLink`, probe
 *      with `canOpenURL`. If installed, try to open it.
 *   2. If the deep-link launch throws (canOpenURL can lie on iOS when an app
 *      that previously handled the scheme has been removed), fall back to the
 *      web URL.
 *   3. If `preferAppDeepLink` is off, or no `deepLink`, open the web URL.
 *
 * The injected `WatchLinker` exists for testability — production callers pass
 * React Native's `Linking` (or any wrapper that matches the shape).
 */

import type { WatchOption } from './streaming-resolver';

export interface WatchLinker {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
}

export type OpenWatchMode = 'deepLink' | 'web' | 'fallback' | 'none' | 'error';

export interface OpenWatchResult {
  opened: boolean;
  mode: OpenWatchMode;
  url?: string;
}

interface OpenWatchOptions {
  preferAppDeepLink: boolean;
  linker: WatchLinker;
}

export async function openWatchOption(
  option: WatchOption,
  options: OpenWatchOptions
): Promise<OpenWatchResult> {
  const { preferAppDeepLink, linker } = options;
  const webUrl = (option.url ?? '').trim();
  const deepLink = preferAppDeepLink ? option.deepLink?.trim() || '' : '';

  if (!webUrl && !deepLink) {
    return { opened: false, mode: 'none' };
  }

  if (deepLink) {
    let canOpen = false;
    try {
      canOpen = await linker.canOpenURL(deepLink);
    } catch {
      canOpen = false;
    }
    if (canOpen) {
      try {
        await linker.openURL(deepLink);
        return { opened: true, mode: 'deepLink', url: deepLink };
      } catch {
        // canOpenURL lied (common on iOS post-uninstall). Fall through to web.
        if (webUrl) {
          try {
            await linker.openURL(webUrl);
            return { opened: true, mode: 'fallback', url: webUrl };
          } catch {
            return { opened: false, mode: 'error' };
          }
        }
        return { opened: false, mode: 'error' };
      }
    }
  }

  if (!webUrl) {
    return { opened: false, mode: 'none' };
  }
  try {
    await linker.openURL(webUrl);
    return { opened: true, mode: 'web', url: webUrl };
  } catch {
    return { opened: false, mode: 'error' };
  }
}
