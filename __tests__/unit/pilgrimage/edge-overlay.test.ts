import { describe, expect, it } from 'bun:test';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  getEdgeOverlayConfig,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';
import { translate } from '../../../libs/i18n/engine';

describe('edge overlay intensity', () => {
  it('exposes low, mid, and high in UI order', () => {
    expect(EDGE_INTENSITIES).toEqual(['low', 'mid', 'high']);
  });

  it('maps low to Edge+ with a faint reference backdrop and sparse lines', () => {
    expect(edgeIntensityLabel('low')).toBe('pilgrimageUi.edgeIntensityLow');
    expect(translate('en', edgeIntensityLabel('low'))).toBe('Edge+');
    expect(getEdgeOverlayConfig('low')).toEqual({
      threshold: 0.24,
      inkOpacity: 0.42,
      sourceOpacity: 0.24,
    });
  });

  it('maps mid and high to progressively denser but still pale edge-only overlays', () => {
    const low = getEdgeOverlayConfig('low');
    const mid = getEdgeOverlayConfig('mid');
    const high = getEdgeOverlayConfig('high');

    expect(translate('en', edgeIntensityLabel('mid'))).toBe('Edge');
    expect(translate('en', edgeIntensityLabel('high'))).toBe('Edge Max');
    expect(mid.sourceOpacity).toBe(0);
    expect(high.sourceOpacity).toBe(0);
    expect(low.threshold).toBeGreaterThan(mid.threshold);
    expect(mid.threshold).toBeGreaterThan(high.threshold);
    expect(low.inkOpacity).toBeLessThan(mid.inkOpacity);
    expect(high.inkOpacity).toBeGreaterThan(mid.inkOpacity);
    expect(high.inkOpacity).toBeLessThanOrEqual(0.68);
  });

  it('falls back to low for unknown persisted values', () => {
    expect(getEdgeOverlayConfig('other' as EdgeIntensity)).toEqual(getEdgeOverlayConfig('low'));
    expect(edgeIntensityLabel('other' as EdgeIntensity)).toBe(edgeIntensityLabel('low'));
  });
});
