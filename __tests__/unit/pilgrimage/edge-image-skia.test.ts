import { describe, expect, it, mock } from 'bun:test';
import type { SkImage } from '@shopify/react-native-skia';

const fromUriCalls: string[] = [];
const downloadedUri = 'file:///cache/edge-src-direct.jpg';
const decodedImage = { width: () => 1920, height: () => 1080 } as unknown as SkImage;

mock.module('@shopify/react-native-skia', () => ({
  TileMode: { Clamp: 'Clamp' },
  FilterMode: { Linear: 'Linear' },
  MipmapMode: { None: 'None' },
  Skia: {
    Data: {
      fromURI: async (uri: string) => {
        fromUriCalls.push(uri);
        return uri === downloadedUri ? { uri } : null;
      },
    },
    Image: {
      MakeImageFromEncoded: (data: { uri?: string } | null) =>
        data?.uri === downloadedUri ? decodedImage : null,
    },
  },
}));

mock.module('expo-image', () => ({
  Image: {
    prefetch: async () => true,
    getCachePathAsync: async () => '/expo-image-cache/undecodable-entry',
  },
}));

mock.module('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async () => ({ exists: false }),
  downloadAsync: async () => ({ uri: downloadedUri }),
}));

const { loadOverlaySourceImage } = await import(
  '../../../libs/services/pilgrimage/edge-image-skia'
);

describe('loadOverlaySourceImage', () => {
  it('falls back to a direct download when the expo-image cache path cannot be decoded', async () => {
    fromUriCalls.length = 0;

    const image = await loadOverlaySourceImage('https://image.anitabi.cn/points/demo.jpg');

    expect(image).toBe(decodedImage);
    expect(fromUriCalls).toEqual(['file:///expo-image-cache/undecodable-entry', downloadedUri]);
  });
});
