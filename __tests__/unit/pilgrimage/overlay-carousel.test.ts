import { describe, expect, it } from 'bun:test';
import {
  OVERLAY_CAROUSEL_ITEMS,
  overlayCarouselIndex,
  overlaySelectionForIndex,
  clampOverlayIndex,
  nextOverlayIndex,
  prevOverlayIndex,
  overlayCarouselItemAt,
} from '../../../libs/services/pilgrimage/overlay-carousel';

describe('overlay carousel model', () => {
  it('orders the five items Off · Anime · Edge · Sketch · Subject', () => {
    expect(OVERLAY_CAROUSEL_ITEMS.map((i) => i.id)).toEqual(['off', 'anime', 'edge', 'sketch', 'subject']);
  });

  it('carries an icon and an i18n label key for every item', () => {
    for (const item of OVERLAY_CAROUSEL_ITEMS) {
      expect(typeof item.icon).toBe('string');
      expect(item.icon.length).toBeGreaterThan(0);
      expect(typeof item.labelKey).toBe('string');
      expect(item.labelKey.length).toBeGreaterThan(0);
    }
  });

  it('maps a hidden overlay to the Off slot regardless of the retained mode', () => {
    expect(overlayCarouselIndex({ overlayVisible: false, overlayMode: 'edge' })).toBe(0);
    expect(overlayCarouselIndex({ overlayVisible: false, overlayMode: 'subject' })).toBe(0);
  });

  it('maps a visible overlay to its mode slot', () => {
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'anime' })).toBe(1);
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'edge' })).toBe(2);
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'sketch' })).toBe(3);
    expect(overlayCarouselIndex({ overlayVisible: true, overlayMode: 'subject' })).toBe(4);
  });

  it('turns the Off slot into a visibility-off patch that keeps the previous mode', () => {
    expect(overlaySelectionForIndex(0)).toEqual({ overlayVisible: false });
  });

  it('turns a mode slot into a visible + mode patch', () => {
    expect(overlaySelectionForIndex(2)).toEqual({ overlayVisible: true, overlayMode: 'edge' });
    expect(overlaySelectionForIndex(4)).toEqual({ overlayVisible: true, overlayMode: 'subject' });
  });

  it('clamps indices into range and rejects non-finite input', () => {
    expect(clampOverlayIndex(-3)).toBe(0);
    expect(clampOverlayIndex(99)).toBe(4);
    expect(clampOverlayIndex(2.6)).toBe(3);
    expect(clampOverlayIndex(Number.NaN)).toBe(0);
  });

  it('steps next/prev with clamping (no wrap at the ends)', () => {
    expect(nextOverlayIndex(0)).toBe(1);
    expect(nextOverlayIndex(4)).toBe(4);
    expect(prevOverlayIndex(4)).toBe(3);
    expect(prevOverlayIndex(0)).toBe(0);
  });

  it('looks up the item at a clamped index', () => {
    expect(overlayCarouselItemAt(0).id).toBe('off');
    expect(overlayCarouselItemAt(99).id).toBe('subject');
  });
});
