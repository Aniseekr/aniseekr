import { describe, it, expect, beforeEach } from 'bun:test';
import {
  DEFAULT_STREAMING_PREFS,
  loadUserPrefs,
  patchStreamingPrefs,
  saveUserPrefs,
  USER_PREFS_STORAGE_KEY,
  normalizeStreamingPrefs,
} from '../../libs/services/user-prefs';

interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  clear(): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage')
  .default as AsyncStorageLike;

describe('UserPrefs: streaming platform preferences', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('SP-PREFS-001 defaults are sensible: empty enabled list, no primary, deep link allowed', () => {
    expect(DEFAULT_STREAMING_PREFS).toEqual({
      enabled: [],
      primary: null,
      preferAppDeepLink: true,
    });
  });

  it('SP-PREFS-002 a fresh install returns DEFAULT_STREAMING_PREFS', async () => {
    const prefs = await loadUserPrefs();
    expect(prefs.streamingPlatforms).toEqual(DEFAULT_STREAMING_PREFS);
  });

  it('SP-PREFS-003 patchStreamingPrefs persists enabled + primary independently', async () => {
    const next = await patchStreamingPrefs({
      enabled: ['netflix', 'crunchyroll', 'bahamut'],
      primary: 'bahamut',
    });
    expect(next.enabled).toEqual(['netflix', 'crunchyroll', 'bahamut']);
    expect(next.primary).toBe('bahamut');
    // Persists across loads.
    const loaded = await loadUserPrefs();
    expect(loaded.streamingPlatforms.enabled).toEqual(['netflix', 'crunchyroll', 'bahamut']);
    expect(loaded.streamingPlatforms.primary).toBe('bahamut');
    expect(loaded.streamingPlatforms.preferAppDeepLink).toBe(true);
  });

  it('SP-PREFS-004 normalizeStreamingPrefs drops unknown ids and deduplicates', () => {
    const got = normalizeStreamingPrefs({
      enabled: [
        'netflix',
        'netflix', // duplicate
        'not-a-real-platform',
        '',
        'bahamut',
      ] as string[],
      primary: 'not-a-real-platform',
      preferAppDeepLink: false,
    });
    expect(got.enabled).toEqual(['netflix', 'bahamut']);
    // Primary fell back to first enabled because the supplied one was invalid.
    expect(got.primary).toBe('netflix');
    expect(got.preferAppDeepLink).toBe(false);
  });

  it('SP-PREFS-005 normalize keeps primary null when enabled is empty', () => {
    const got = normalizeStreamingPrefs({ enabled: [], primary: 'netflix', preferAppDeepLink: true });
    expect(got.enabled).toEqual([]);
    expect(got.primary).toBeNull();
  });

  it('SP-PREFS-006 normalize promotes an explicit primary that exists in enabled', () => {
    const got = normalizeStreamingPrefs({
      enabled: ['netflix', 'bahamut'],
      primary: 'bahamut',
      preferAppDeepLink: true,
    });
    expect(got.primary).toBe('bahamut');
  });

  it('SP-PREFS-007 patchStreamingPrefs only touches the streamingPlatforms field', async () => {
    await saveUserPrefs({
      ...(await loadUserPrefs()),
      cardHeightPercent: 73,
    });
    await patchStreamingPrefs({ enabled: ['netflix'] });
    const loaded = await loadUserPrefs();
    // Other fields survived.
    expect(loaded.cardHeightPercent).toBe(73);
    expect(loaded.streamingPlatforms.enabled).toEqual(['netflix']);
  });

  it('SP-PREFS-008 legacy prefs JSON without streamingPlatforms migrates cleanly', async () => {
    // Simulate an older app version that wrote prefs without the new field.
    await AsyncStorage.setItem(
      USER_PREFS_STORAGE_KEY,
      JSON.stringify({
        cardHeightPercent: 90,
        allowAdultContent: false,
      })
    );
    const prefs = await loadUserPrefs();
    expect(prefs.streamingPlatforms).toEqual(DEFAULT_STREAMING_PREFS);
    expect(prefs.cardHeightPercent).toBe(90);
  });
});
