// Behavioural pin for the map-theme override.
// - Default must stay 'light' — most users prefer Google-Maps-Light style and
//   we ship that as the out-of-box experience even when app theme is dark.
// - resolveMapMode must collapse the user pref + global mode into the binary
//   the tile picker expects, and 'auto' must defer to the global mode.
// - Subscribers must fire on set so the 3 map screens repaint live.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  DEFAULT_MAP_THEME,
  MAP_THEME_STORAGE_KEY,
  __resetMapThemePrefCacheForTests,
  loadMapThemePref,
  resolveMapMode,
  setMapThemePref,
  subscribeMapThemePref,
} from '../../../libs/services/pilgrimage/map-theme-prefs';

beforeEach(async () => {
  __resetMapThemePrefCacheForTests();
  await AsyncStorage.removeItem?.(MAP_THEME_STORAGE_KEY);
});

afterEach(() => {
  __resetMapThemePrefCacheForTests();
});

describe('DEFAULT_MAP_THEME', () => {
  it('defaults to light so the out-of-box map looks like Google Maps Light', () => {
    expect(DEFAULT_MAP_THEME).toBe('light');
  });
});

describe('resolveMapMode', () => {
  it('returns the explicit pref when not auto', () => {
    expect(resolveMapMode('light', 'dark')).toBe('light');
    expect(resolveMapMode('dark', 'light')).toBe('dark');
  });

  it('falls back to effectiveMode when pref is auto', () => {
    expect(resolveMapMode('auto', 'light')).toBe('light');
    expect(resolveMapMode('auto', 'dark')).toBe('dark');
  });

  it('lets a light app keep a light map even when the user picked dark', () => {
    expect(resolveMapMode('dark', 'light')).toBe('dark');
  });
});

describe('loadMapThemePref / setMapThemePref', () => {
  it('persists the latest set value across loads', async () => {
    await setMapThemePref('dark');
    __resetMapThemePrefCacheForTests();
    expect(await loadMapThemePref()).toBe('dark');
  });

  it('falls back to default when storage is empty', async () => {
    expect(await loadMapThemePref()).toBe(DEFAULT_MAP_THEME);
  });
});

describe('subscribeMapThemePref', () => {
  it('notifies subscribers on change', async () => {
    const received: string[] = [];
    const unsub = subscribeMapThemePref((next) => {
      received.push(next);
    });
    await setMapThemePref('auto');
    unsub();
    expect(received).toEqual(['auto']);
  });

  it('stops notifying after unsubscribe', async () => {
    let calls = 0;
    const unsub = subscribeMapThemePref(() => {
      calls += 1;
    });
    await setMapThemePref('dark');
    unsub();
    await setMapThemePref('light');
    expect(calls).toBe(1);
  });
});
