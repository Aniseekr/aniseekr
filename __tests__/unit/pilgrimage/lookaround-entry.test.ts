import { afterEach, describe, expect, it, mock } from 'bun:test';
import { Platform } from 'react-native';

mock.module('expo-modules-core', () => ({
  requireOptionalNativeModule: () => null,
}));

const { hasScene, lookAroundProvider, present } = await import('../../../modules/lookaround/src/index');

const ORIGINAL_PLATFORM_OS = Platform.OS;

describe('lookaround module JS entry', () => {
  afterEach(() => {
    (Platform as { OS: typeof Platform.OS }).OS = ORIGINAL_PLATFORM_OS;
  });

  it('resolves false when the native Look Around module is unavailable', async () => {
    (Platform as { OS: typeof Platform.OS }).OS = 'ios';

    await expect(hasScene(35.658, 139.701)).resolves.toBe(false);
    await expect(lookAroundProvider.hasScene(35.658, 139.701)).resolves.toBe(false);
  });

  it('no-ops present off iOS so Android and web callers can import safely', async () => {
    (Platform as { OS: typeof Platform.OS }).OS = 'android';

    await expect(present(35.658, 139.701)).resolves.toBeUndefined();
  });
});
