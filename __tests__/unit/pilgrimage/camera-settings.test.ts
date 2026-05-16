import { describe, expect, it } from 'bun:test';
import { resolvePictureSize } from '../../../libs/services/pilgrimage/camera-settings';

describe('resolvePictureSize', () => {
  const FOUR_SIZES = ['1280x720', '1920x1080', '2560x1440', '3840x2160'];

  it('maps the 4K tier to the largest device size', () => {
    expect(resolvePictureSize('4k', FOUR_SIZES)).toBe('3840x2160');
  });

  it('maps the 2K tier to the largest size within the FHD/QHD range', () => {
    expect(resolvePictureSize('2k', FOUR_SIZES)).toBe('2560x1440');
  });

  it('falls back to the smallest size for 2K when every size exceeds the range', () => {
    expect(resolvePictureSize('2k', ['3840x2160', '4096x2304'])).toBe('3840x2160');
  });

  it('ignores non-numeric presets and returns undefined when nothing parses', () => {
    expect(resolvePictureSize('4k', ['photo', 'high', 'medium'])).toBeUndefined();
    expect(resolvePictureSize('2k', [])).toBeUndefined();
  });

  it('parses the unicode × separator', () => {
    expect(resolvePictureSize('4k', ['1920×1080', '3840×2160'])).toBe('3840×2160');
  });

  it('uses the only available size for both tiers', () => {
    expect(resolvePictureSize('4k', ['1920x1080'])).toBe('1920x1080');
    expect(resolvePictureSize('2k', ['1920x1080'])).toBe('1920x1080');
  });
});
