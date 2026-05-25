import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Platform } from 'react-native';
import { getAdUnitId } from '../../../libs/services/ads/ad-config';
import { FeatureFlags } from '../../../constants/FeatureFlags';

const ORIGINAL_ENV = {
  EXPO_PUBLIC_ADS_DISABLED: process.env.EXPO_PUBLIC_ADS_DISABLED,
  EXPO_PUBLIC_ADMOB_ANDROID_BANNER: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
  EXPO_PUBLIC_ADMOB_ANDROID_NATIVE: process.env.EXPO_PUBLIC_ADMOB_ANDROID_NATIVE,
  EXPO_PUBLIC_ADMOB_IOS_BANNER: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
  EXPO_PUBLIC_ADMOB_IOS_NATIVE: process.env.EXPO_PUBLIC_ADMOB_IOS_NATIVE,
};
const ORIGINAL_PLATFORM_OS = Platform.OS;
const ORIGINAL_ADS_ENABLED: boolean = FeatureFlags.ADS_ENABLED;

// FeatureFlags is `as const` so the literal types reject re-assignment.
// In tests we deliberately mutate the runtime object via an unknown cast
// to flip the kill switch around per-case.
type MutableFeatureFlags = { ADS_ENABLED: boolean };

function restoreEnv(key: keyof typeof ORIGINAL_ENV): void {
  const value = ORIGINAL_ENV[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('ad-config', () => {
  beforeEach(() => {
    // Tests below assert per-slot resolution. The free-version posture
    // (FeatureFlags.ADS_ENABLED=false) short-circuits everything to null,
    // so we flip it on per-test and restore afterwards.
    (FeatureFlags as unknown as MutableFeatureFlags).ADS_ENABLED = true;
  });

  afterEach(() => {
    restoreEnv('EXPO_PUBLIC_ADS_DISABLED');
    restoreEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER');
    restoreEnv('EXPO_PUBLIC_ADMOB_ANDROID_NATIVE');
    restoreEnv('EXPO_PUBLIC_ADMOB_IOS_BANNER');
    restoreEnv('EXPO_PUBLIC_ADMOB_IOS_NATIVE');
    (Platform as { OS: typeof Platform.OS }).OS = ORIGINAL_PLATFORM_OS;
    (FeatureFlags as unknown as MutableFeatureFlags).ADS_ENABLED = ORIGINAL_ADS_ENABLED;
  });

  it('uses the ios native advanced unit for the rate native slot in production', () => {
    (Platform as { OS: typeof Platform.OS }).OS = 'ios';
    delete process.env.EXPO_PUBLIC_ADS_DISABLED;
    process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER = 'ca-app-pub-5295818339973289/2164566273';
    process.env.EXPO_PUBLIC_ADMOB_IOS_NATIVE = 'ca-app-pub-5295818339973289/3635473770';

    expect(getAdUnitId('rate_native')).toBe('ca-app-pub-5295818339973289/3635473770');
  });

  it('uses the android native advanced unit for the rate native slot in production', () => {
    (Platform as { OS: typeof Platform.OS }).OS = 'android';
    delete process.env.EXPO_PUBLIC_ADS_DISABLED;
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER = 'ca-app-pub-5295818339973289/6952338614';
    process.env.EXPO_PUBLIC_ADMOB_ANDROID_NATIVE = 'ca-app-pub-5295818339973289/6293485767';

    expect(getAdUnitId('rate_native')).toBe('ca-app-pub-5295818339973289/6293485767');
  });

  it('does not fall back to a banner unit for the rate native slot', () => {
    (Platform as { OS: typeof Platform.OS }).OS = 'ios';
    delete process.env.EXPO_PUBLIC_ADS_DISABLED;
    process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER = 'ca-app-pub-5295818339973289/2164566273';
    delete process.env.EXPO_PUBLIC_ADMOB_IOS_NATIVE;

    expect(getAdUnitId('rate_native')).toBeNull();
  });

  it('returns null for every slot when FeatureFlags.ADS_ENABLED is false', () => {
    (FeatureFlags as unknown as MutableFeatureFlags).ADS_ENABLED = false;
    (Platform as { OS: typeof Platform.OS }).OS = 'ios';
    delete process.env.EXPO_PUBLIC_ADS_DISABLED;
    process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER = 'ca-app-pub-5295818339973289/2164566273';
    process.env.EXPO_PUBLIC_ADMOB_IOS_NATIVE = 'ca-app-pub-5295818339973289/3635473770';

    expect(getAdUnitId('home_banner')).toBeNull();
    expect(getAdUnitId('detail_banner')).toBeNull();
    expect(getAdUnitId('rate_native')).toBeNull();
    expect(getAdUnitId('interstitial')).toBeNull();
    expect(getAdUnitId('rewarded')).toBeNull();
  });
});
