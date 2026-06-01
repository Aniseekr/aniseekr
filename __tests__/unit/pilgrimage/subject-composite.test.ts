import { describe, expect, it } from 'bun:test';
import {
  resolveSubjectCompositePlan,
  shouldCompositeSubjectOverlay,
} from '../../../libs/services/pilgrimage/subject-composite-plan';

describe('subject composite capture planning', () => {
  it('only composites when subject mode and the user enabled it', () => {
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'subject',
        enabled: true,
        subjectReady: true,
      })
    ).toBe(true);
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'subject',
        enabled: false,
        subjectReady: true,
      })
    ).toBe(false);
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'edge',
        enabled: true,
        subjectReady: true,
      })
    ).toBe(false);
    expect(
      shouldCompositeSubjectOverlay({
        mode: 'subject',
        enabled: true,
        subjectReady: false,
      })
    ).toBe(false);
  });

  it('fits the subject reference into the captured photo and scales screen translation', () => {
    const plan = resolveSubjectCompositePlan({
      photoWidth: 4000,
      photoHeight: 3000,
      previewWidth: 2000,
      previewHeight: 1500,
      subjectWidth: 1920,
      subjectHeight: 1080,
      opacity: 0.35,
      transform: {
        scale: 1.5,
        translateX: 50,
        translateY: -24,
        rotationRad: Math.PI / 6,
        flipScaleX: -1,
      },
    });

    expect(plan).toEqual({
      srcRect: { x: 0, y: 0, width: 1920, height: 1080 },
      dstRect: { x: 0, y: 375, width: 4000, height: 2250 },
      centerX: 2000,
      centerY: 1500,
      translateX: 100,
      translateY: -48,
      scale: 1.5,
      rotationDeg: 30,
      flipScaleX: -1,
      opacity: 0.35,
    });
  });

  it('maps through the cover crop (uniform scale) when screen aspect ≠ capture aspect', () => {
    // Portrait 1:2 preview over a 4:3 photo: the preview is cover-cropped, so
    // the visible photo region is 1500×3000 (centred), and the overlay must be
    // scaled by the single uniform k=1.5 — NOT the old per-axis 4000/1000=4 on X.
    const plan = resolveSubjectCompositePlan({
      photoWidth: 4000,
      photoHeight: 3000,
      previewWidth: 1000,
      previewHeight: 2000,
      subjectWidth: 600,
      subjectHeight: 600,
      opacity: 1,
      transform: {
        scale: 1,
        translateX: 100,
        translateY: 40,
        rotationRad: 0,
        flipScaleX: 1,
      },
    });

    expect(plan).not.toBeNull();
    // k = min(4000/1000, 3000/2000) = 1.5 → square subject fits the 1500-wide
    // visible region, centred in the full 4000×3000 photo.
    expect(plan?.dstRect).toEqual({ x: 1250, y: 750, width: 1500, height: 1500 });
    expect(plan?.translateX).toBe(150); // 100 * 1.5 (uniform), not 100 * 4
    expect(plan?.translateY).toBe(60); // 40 * 1.5
  });

  it('rejects invalid dimensions instead of inventing a placement', () => {
    expect(
      resolveSubjectCompositePlan({
        photoWidth: 0,
        photoHeight: 3000,
        previewWidth: 2000,
        previewHeight: 1500,
        subjectWidth: 1920,
        subjectHeight: 1080,
        opacity: 0.35,
        transform: {
          scale: 1,
          translateX: 0,
          translateY: 0,
          rotationRad: 0,
          flipScaleX: 1,
        },
      })
    ).toBeNull();
  });
});
