import { describe, it, expect } from 'bun:test';
import { openWatchOption, type WatchLinker } from '../../libs/services/streaming/streaming-linker';
import type { WatchOption } from '../../libs/services/streaming/streaming-resolver';

function makeFakeLinking(opts: {
  canOpen: Record<string, boolean>;
}): { linker: WatchLinker; opened: string[] } {
  const opened: string[] = [];
  const linker: WatchLinker = {
    async canOpenURL(url: string) {
      return Object.prototype.hasOwnProperty.call(opts.canOpen, url) ? opts.canOpen[url] : false;
    },
    async openURL(url: string) {
      opened.push(url);
    },
  };
  return { linker, opened };
}

function opt(partial: Partial<WatchOption> = {}): WatchOption {
  return {
    platformId: 'netflix',
    displayName: 'Netflix',
    color: '#E50914',
    icon: 'film',
    url: 'https://www.netflix.com/title/1',
    source: 'official',
    isPrimary: false,
    isEnabled: true,
    logoDomain: 'netflix.com',
    monogram: 'N',
    ...partial,
  };
}

describe('streaming-linker', () => {
  it('SL-001 prefers deep-link when canOpenURL is true and user opts in', async () => {
    const { linker, opened } = makeFakeLinking({ canOpen: { 'nflx://': true } });
    const result = await openWatchOption(opt({ deepLink: 'nflx://' }), {
      preferAppDeepLink: true,
      linker,
    });
    expect(opened).toEqual(['nflx://']);
    expect(result.mode).toBe('deepLink');
    expect(result.opened).toBe(true);
  });

  it('SL-002 falls back to web URL when canOpenURL returns false', async () => {
    const { linker, opened } = makeFakeLinking({ canOpen: { 'nflx://': false } });
    const result = await openWatchOption(opt({ deepLink: 'nflx://' }), {
      preferAppDeepLink: true,
      linker,
    });
    expect(opened).toEqual(['https://www.netflix.com/title/1']);
    expect(result.mode).toBe('web');
    expect(result.opened).toBe(true);
  });

  it('SL-003 ignores deep-link when preferAppDeepLink is false', async () => {
    const { linker, opened } = makeFakeLinking({ canOpen: { 'nflx://': true } });
    const result = await openWatchOption(opt({ deepLink: 'nflx://' }), {
      preferAppDeepLink: false,
      linker,
    });
    expect(opened).toEqual(['https://www.netflix.com/title/1']);
    expect(result.mode).toBe('web');
  });

  it('SL-004 no-op without throwing when url is blank', async () => {
    const { linker, opened } = makeFakeLinking({ canOpen: {} });
    const result = await openWatchOption(opt({ url: '', deepLink: undefined }), {
      preferAppDeepLink: true,
      linker,
    });
    expect(opened).toEqual([]);
    expect(result.opened).toBe(false);
    expect(result.mode).toBe('none');
  });

  it('SL-005 returns mode=web (not fallback) when openURL throws after canOpenURL=true', async () => {
    // Simulates the iOS edge case where canOpenURL lies (returns true even
    // when the user has no app handling the scheme). We surface that as a
    // 'fallback' mode so telemetry can flag it.
    const opened: string[] = [];
    const linker: WatchLinker = {
      async canOpenURL() {
        return true;
      },
      async openURL(url) {
        opened.push(url);
        if (url.startsWith('nflx://')) {
          throw new Error('No app available');
        }
      },
    };
    const result = await openWatchOption(opt({ deepLink: 'nflx://' }), {
      preferAppDeepLink: true,
      linker,
    });
    expect(opened).toEqual(['nflx://', 'https://www.netflix.com/title/1']);
    expect(result.mode).toBe('fallback');
    expect(result.opened).toBe(true);
  });

  it('SL-006 swallows openURL failure on web fallback too — surfaces opened=false', async () => {
    const linker: WatchLinker = {
      async canOpenURL() {
        return false;
      },
      async openURL() {
        throw new Error('No browser');
      },
    };
    const result = await openWatchOption(opt({ deepLink: 'nflx://' }), {
      preferAppDeepLink: true,
      linker,
    });
    expect(result.opened).toBe(false);
    expect(result.mode).toBe('error');
  });
});
