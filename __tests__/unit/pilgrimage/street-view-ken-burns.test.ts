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
      fromTranslateX: -6,
      toTranslateX: 6,
      durationMs: 18_000,
      imageWidthMultiplier: 1,
    });
  });

  it('clamps the drift so the scaled image always covers the card', () => {
    // At width 80 the desired 2% drift (2px rounded) exceeds the covered
    // margin at the minimum scale (floor(80 × (1/2 − 1/2.1)) = 1px).
    const motion = resolveMapillaryKenBurnsMotion({
      isPano: false,
      width: 80,
      reducedMotion: false,
    });

    expect(motion.toTranslateX).toBe(1);
    expect(motion.fromTranslateX).toBe(-1);

    // Containment invariant across representative widths: |shift| must never
    // exceed imageWidth/2 − cardWidth/(2·fromScale).
    for (const width of [80, 160, 320, 480]) {
      for (const isPano of [false, true]) {
        const m = resolveMapillaryKenBurnsMotion({ isPano, width, reducedMotion: false });
        const maxSafe = width * (m.imageWidthMultiplier / 2 - 1 / (2 * m.fromScale));
        expect(Math.abs(m.toTranslateX)).toBeLessThanOrEqual(maxSafe);
      }
    }
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
