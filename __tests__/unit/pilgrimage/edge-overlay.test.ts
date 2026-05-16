import { describe, expect, it } from 'bun:test';
import {
  EDGE_INTENSITIES,
  edgeIntensityLabel,
  getEdgeOverlayConfig,
  type EdgeIntensity,
} from '../../../libs/services/pilgrimage/edge-overlay';

describe('edge overlay intensity', () => {
  it('exposes low, mid, and high in UI order', () => {
    expect(EDGE_INTENSITIES).toEqual(['low', 'mid', 'high']);
  });

  it('maps low to Edge+ with a faint reference backdrop', () => {
    expect(edgeIntensityLabel('low')).toBe('Edge+');
    expect(getEdgeOverlayConfig('low')).toEqual({
      threshold: 0.12,
      inkOpacity: 0.72,
      sourceOpacity: 0.18,
    });
  });

  it('maps mid and high to progressively stronger edge-only overlays', () => {
    const mid = getEdgeOverlayConfig('mid');
    const high = getEdgeOverlayConfig('high');

    expect(edgeIntensityLabel('mid')).toBe('Edge');
    expect(edgeIntensityLabel('high')).toBe('Edge Max');
    expect(mid.sourceOpacity).toBe(0);
    expect(high.sourceOpacity).toBe(0);
    expect(high.inkOpacity).toBeGreaterThan(mid.inkOpacity);
    expect(high.threshold).toBeLessThan(mid.threshold);
  });

  it('falls back to low for unknown persisted values', () => {
    expect(getEdgeOverlayConfig('other' as EdgeIntensity)).toEqual(getEdgeOverlayConfig('low'));
  });
});
