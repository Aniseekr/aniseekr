// Cluster rules for the MapLibre engine's supercluster bubbles: when a
// cluster is a dot, how counts read, and what a tap does.
import { describe, expect, it } from 'bun:test';
import {
  clusterMaxZoom,
  isDotCluster,
  formatClusterCount,
  dominantColor,
  clusterTapAction,
} from '../../../libs/services/pilgrimage/map-engine/cluster-style';

describe('clusterMaxZoom (supercluster maxZoom = disableClusteringAtZoom - 1)', () => {
  it('is one below the surface disable-at zoom', () => {
    expect(clusterMaxZoom(16)).toBe(15);
    expect(clusterMaxZoom(12)).toBe(11);
  });
});

describe('isDotCluster (zoom <= 8 || n < 10)', () => {
  it('is a dot when zoomed out far', () => {
    expect(isDotCluster(8, 500)).toBe(true);
    expect(isDotCluster(5, 1000)).toBe(true);
  });
  it('is a dot when the count is small', () => {
    expect(isDotCluster(12, 9)).toBe(true);
  });
  it('is a numbered bubble when zoomed in with enough members', () => {
    expect(isDotCluster(9, 10)).toBe(false);
    expect(isDotCluster(12, 10)).toBe(false);
  });
});

describe('formatClusterCount (>=1000 → "1.2k")', () => {
  it('shows the raw count below 1000', () => {
    expect(formatClusterCount(5)).toBe('5');
    expect(formatClusterCount(999)).toBe('999');
  });
  it('compacts thousands to one decimal + k', () => {
    expect(formatClusterCount(1000)).toBe('1.0k');
    expect(formatClusterCount(1234)).toBe('1.2k');
    expect(formatClusterCount(1999)).toBe('1.9k');
    expect(formatClusterCount(12345)).toBe('12.3k');
  });
});

describe('dominantColor (most-common region colour, fallback otherwise)', () => {
  it('picks the colour with the highest tally', () => {
    expect(dominantColor({ '#aa0000': 3, '#00bb00': 1 }, '#zzz')).toBe('#aa0000');
  });
  it('falls back when the tally is empty', () => {
    expect(dominantColor({}, '#fallback')).toBe('#fallback');
  });
});

describe('clusterTapAction (n > pickerThreshold → zoom, else picker)', () => {
  it('zooms into big clusters and opens a picker for small ones', () => {
    expect(clusterTapAction(13)).toBe('zoom');
    expect(clusterTapAction(12)).toBe('picker');
    expect(clusterTapAction(5)).toBe('picker');
  });
});

