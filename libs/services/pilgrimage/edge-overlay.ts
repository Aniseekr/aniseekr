export type EdgeIntensity = 'low' | 'mid' | 'high';

export interface EdgeOverlayConfig {
  threshold: number;
  inkOpacity: number;
  sourceOpacity: number;
}

export const EDGE_INTENSITIES: readonly EdgeIntensity[] = ['low', 'mid', 'high'] as const;

const CONFIG: Record<EdgeIntensity, EdgeOverlayConfig> = {
  low: { threshold: 0.12, inkOpacity: 0.72, sourceOpacity: 0.18 },
  mid: { threshold: 0.18, inkOpacity: 0.88, sourceOpacity: 0 },
  high: { threshold: 0.1, inkOpacity: 1, sourceOpacity: 0 },
};

const LABEL: Record<EdgeIntensity, string> = {
  low: 'Edge+',
  mid: 'Edge',
  high: 'Edge Max',
};

export function isEdgeIntensity(value: unknown): value is EdgeIntensity {
  return value === 'low' || value === 'mid' || value === 'high';
}

export function getEdgeOverlayConfig(value: EdgeIntensity): EdgeOverlayConfig {
  return CONFIG[isEdgeIntensity(value) ? value : 'low'];
}

export function edgeIntensityLabel(value: EdgeIntensity): string {
  return LABEL[isEdgeIntensity(value) ? value : 'low'];
}
