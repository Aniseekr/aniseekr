import { describe, expect, it } from 'bun:test';
import {
  shareRatioForShot,
  shotContentFitForCell,
  shotOrientation,
} from '../../../libs/services/pilgrimage/share-aspect';

describe('shotOrientation', () => {
  it('classifies portrait, landscape, and square from real pixel dims', () => {
    expect(shotOrientation(3024, 4032)).toBe('portrait');
    expect(shotOrientation(4032, 3024)).toBe('landscape');
    expect(shotOrientation(1080, 1080)).toBe('square');
  });

  it('returns "unknown" when either dimension is missing or non-positive', () => {
    expect(shotOrientation(0, 4032)).toBe('unknown');
    expect(shotOrientation(3024, 0)).toBe('unknown');
    expect(shotOrientation(null, 4032)).toBe('unknown');
    expect(shotOrientation(3024, undefined)).toBe('unknown');
    expect(shotOrientation(Number.NaN, 4032)).toBe('unknown');
  });
});

describe('shareRatioForShot', () => {
  it('defaults a portrait shot to the 9:16 story ratio', () => {
    expect(shareRatioForShot(3024, 4032)).toBe('9:16');
  });

  it('defaults landscape and square shots to the 1:1 feed ratio', () => {
    expect(shareRatioForShot(4032, 3024)).toBe('1:1');
    expect(shareRatioForShot(1080, 1080)).toBe('1:1');
  });

  it('defaults to 1:1 when the shot dimensions are unknown', () => {
    expect(shareRatioForShot(0, 0)).toBe('1:1');
    expect(shareRatioForShot(null, null)).toBe('1:1');
    expect(shareRatioForShot(undefined, 4032)).toBe('1:1');
  });
});

describe('shotContentFitForCell', () => {
  it('letterboxes (contain) when the shot and cell orientations differ', () => {
    // Portrait shot in a landscape (16:9) cell.
    expect(shotContentFitForCell(3024 / 4032, 16 / 9)).toBe('contain');
    // Landscape shot in a portrait (9:16) cell.
    expect(shotContentFitForCell(4032 / 3024, 9 / 16)).toBe('contain');
  });

  it('fills (cover) when the shot and cell share an orientation', () => {
    // Portrait shot in a portrait cell.
    expect(shotContentFitForCell(3024 / 4032, 9 / 16)).toBe('cover');
    // Landscape shot in a landscape cell.
    expect(shotContentFitForCell(4032 / 3024, 16 / 9)).toBe('cover');
    // Both square (1:1 cell).
    expect(shotContentFitForCell(1, 1)).toBe('cover');
  });

  it('fills (cover) when either aspect is unknown — never invents a letterbox', () => {
    expect(shotContentFitForCell(null, 16 / 9)).toBe('cover');
    expect(shotContentFitForCell(3024 / 4032, undefined)).toBe('cover');
    expect(shotContentFitForCell(0, 1)).toBe('cover');
    expect(shotContentFitForCell(Number.NaN, 1)).toBe('cover');
  });
});
