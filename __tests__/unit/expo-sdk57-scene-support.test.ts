import { describe, expect, it } from 'bun:test';

describe('Expo SDK 57 scene support', () => {
  it('keeps the UIKit scene lifecycle enabled for Xcode 27 / iOS 27 builds', async () => {
    const appConfig = await Bun.file('app.json').json();
    const buildProperties = appConfig.expo.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
    );

    expect(buildProperties).toEqual([
      'expo-build-properties',
      expect.objectContaining({
        ios: expect.objectContaining({ enableSceneSupport: true }),
      }),
    ]);
  });
});
