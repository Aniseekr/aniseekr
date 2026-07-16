import { describe, expect, it } from 'bun:test';

import { resolveMapillaryKenBurnsMotion } from '../../../components/pilgrimage/street-view/ken-burns';

describe('resolveMapillaryKenBurnsMotion', () => {
  it('uses subtle scale and drift for normal images', () => {
    expect(
      resolveMapillaryKenBurnsMotion({
        isPano: false,
        width: 320,
        reducedMotion: false,
      })
    ).toEqual({
      shouldAnimate: true,
      fromScale: 1.05,
      toScale: 1.12,
      fromTranslateX: -13,
      toTranslateX: 13,
      durationMs: 18_000,
      imageWidthMultiplier: 1,
    });
  });

  it('widens pano images and favors horizontal drift', () => {
    expect(
      resolveMapillaryKenBurnsMotion({
        isPano: true,
        width: 320,
        reducedMotion: false,
      })
    ).toEqual({
      shouldAnimate: true,
      fromScale: 1.05,
      toScale: 1.12,
      fromTranslateX: -51,
      toTranslateX: 51,
      durationMs: 24_000,
      imageWidthMultiplier: 1.32,
    });
  });

  it('keeps the crop stable when reduced motion is enabled', () => {
    expect(
      resolveMapillaryKenBurnsMotion({
        isPano: true,
        width: 320,
        reducedMotion: true,
      })
    ).toEqual({
      shouldAnimate: false,
      fromScale: 1.05,
      toScale: 1.05,
      fromTranslateX: 0,
      toTranslateX: 0,
      durationMs: 0,
      imageWidthMultiplier: 1.32,
    });
  });
});
