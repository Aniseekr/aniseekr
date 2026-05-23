import { describe, expect, it } from 'bun:test';
import {
  normalizeJpegQualityPercent,
  pathToFileUri,
  persistPhotoForSkiaPipeline,
} from '../../../libs/services/pilgrimage/vision-camera-photo';

describe('vision-camera photo persistence', () => {
  it('normalizes native filesystem paths to file URIs', () => {
    expect(pathToFileUri('/tmp/capture.jpg')).toBe('file:///tmp/capture.jpg');
    expect(pathToFileUri('tmp/capture.jpg')).toBe('file:///tmp/capture.jpg');
    expect(pathToFileUri('file:///tmp/capture.jpg')).toBe('file:///tmp/capture.jpg');
  });

  it('maps output quality from app-scale 0..1 to NitroImage JPEG percent', () => {
    expect(normalizeJpegQualityPercent(0.7)).toBe(70);
    expect(normalizeJpegQualityPercent(0.92)).toBe(92);
    expect(normalizeJpegQualityPercent(1)).toBe(100);
    expect(normalizeJpegQualityPercent(85)).toBe(85);
    expect(normalizeJpegQualityPercent(Number.NaN)).toBe(92);
  });

  it('bakes VisionCamera orientation into pixels before saving for the Skia pipeline', async () => {
    const calls: string[] = [];
    const image = {
      width: 3024,
      height: 4032,
      saveToTemporaryFileAsync: async (format: 'jpg', quality?: number) => {
        calls.push(`image:save:${format}:${quality}`);
        return '/tmp/baked.jpg';
      },
      dispose: () => {
        calls.push('image:dispose');
      },
    };
    const photo = {
      width: 4032,
      height: 3024,
      toImageAsync: async () => {
        calls.push('photo:toImage');
        return image;
      },
      saveToTemporaryFileAsync: async () => {
        calls.push('photo:saveRaw');
        return '/tmp/raw.jpg';
      },
    };

    const result = await persistPhotoForSkiaPipeline(photo, {
      quality: 0.92,
      targetResolution: { width: 4032, height: 3024 },
    });

    expect(result).toEqual({ uri: 'file:///tmp/baked.jpg', width: 3024, height: 4032 });
    expect(calls).toEqual(['photo:toImage', 'image:save:jpg:92', 'image:dispose']);
  });
});
