import { afterEach, describe, expect, it } from 'bun:test';
import { Platform } from 'react-native';
import { getAdUnitId } from '../../../libs/services/ads/ad-config';

const ORIGINAL_ENV = {
  EXPO_PUBLIC_ADS_DISABLED: process.env.EXPO_PUBLIC_ADS_DISABLED,
  EXPO_PUBLIC_ADMOB_ANDROID_BANNER: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER,
  EXPO_PUBLIC_ADMOB_ANDROID_NATIVE: process.env.EXPO_PUBLIC_ADMOB_ANDROID_NATIVE,
  EXPO_PUBLIC_ADMOB_IOS_BANNER: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER,
  EXPO_PUBLIC_ADMOB_IOS_NATIVE: process.env.EXPO_PUBLIC_ADMOB_IOS_NATIVE,
};
const ORIGINAL_PLATFORM_OS = Platform.OS;

function restoreEnv(key: keyof typeof ORIGINAL_ENV): void {
  const value = ORIGINAL_ENV[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('ad-config', () => {
  afterEach(() => {
    restoreEnv('EXPO_PUBLIC_ADS_DISABLED');
    restoreEnv('EXPO_PUBLIC_ADMOB_ANDROID_BANNER');
    restoreEnv('EXPO_PUBLIC_ADMOB_ANDROID_NATIVE');
    restoreEnv('EXPO_PUBLIC_ADMOB_IOS_BANNER');
    restoreEnv('EXPO_PUBLIC_ADMOB_IOS_NATIVE');
    (Platform as { OS: typeof Platform.OS }).OS = ORIGINAL_PLATFORM_OS;
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
});
