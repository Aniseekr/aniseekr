// Pins the per-kind marker visual spec (size/anchor/badge/visited/star) so the
// MapLibre NativeMapMarker renders balloons / gold-88 pins / spot dots
// consistently.
import { describe, expect, it } from 'bun:test';
import type { MapMarker } from '../../../libs/services/pilgrimage/map-engine/types';
import { resolveMarkerVisual } from '../../../libs/services/pilgrimage/map-engine/marker-style';

const base = (over: Partial<MapMarker>): MapMarker => ({
  id: 'x',
  lat: 35,
  lng: 135,
  kind: 'spot',
  title: 't',
  color: '#33AACC',
  ...over,
});

describe('resolveMarkerVisual — city88 gold pin', () => {
  it('is a 36x45 gold pin with a #id badge + star, anchored at the tip', () => {
    const v = resolveMarkerVisual(base({ kind: 'city88', color: '#D4AF37', eightyEightId: 7 }));
    expect(v.shape).toBe('gold88');
    expect(v.width).toBe(36);
    expect(v.height).toBe(45);
    expect(v.anchor).toBe('bottom');
    expect(v.badge).toEqual({ text: '#7', kind: 'id88' });
    expect(v.showStar).toBe(true);
    expect(v.visited).toBe(false);
  });
});

describe('resolveMarkerVisual — spot bubble', () => {
  it('is a 48x57 balloon with an EP badge, anchored at the tail tip', () => {
    const v = resolveMarkerVisual(
      base({ kind: 'spot', episode: 2, markerMode: 'bubble', visited: true })
    );
    expect(v.shape).toBe('balloon');
    expect(v.width).toBe(48);
    expect(v.height).toBe(57);
    expect(v.anchor).toBe('bottom');
    expect(v.badge).toEqual({ text: 'EP 2', kind: 'ep' });
    expect(v.visited).toBe(true);
    expect(v.showStar).toBe(false);
  });
});

describe('resolveMarkerVisual — spot dot', () => {
  it('is a centred 24x24 dot with no badge', () => {
    const v = resolveMarkerVisual(base({ kind: 'spot', markerMode: 'dot', visited: true }));
    expect(v.shape).toBe('dot');
    expect(v.width).toBe(24);
    expect(v.height).toBe(24);
    expect(v.anchor).toBe('center');
    expect(v.badge).toBeNull();
    expect(v.visited).toBe(true);
  });
});

describe('resolveMarkerVisual — spot honours the surface default mode', () => {
  it('falls back to the default markerMode when the marker omits one', () => {
    expect(resolveMarkerVisual(base({ kind: 'spot', episode: 1 }), 'dot').shape).toBe('dot');
    expect(resolveMarkerVisual(base({ kind: 'spot', episode: 1 }), 'bubble').shape).toBe('balloon');
  });
});

describe('resolveMarkerVisual — anime balloon', () => {
  it('is a 48x57 balloon with a points-count badge', () => {
    const v = resolveMarkerVisual(base({ kind: 'anime', color: '#FF5577', pointsLength: 12 }));
    expect(v.shape).toBe('balloon');
    expect(v.badge).toEqual({ text: '12', kind: 'pts' });
    expect(v.showStar).toBe(false);
    expect(v.visited).toBe(false);
  });
  it('shows no badge when pointsLength is absent', () => {
    expect(resolveMarkerVisual(base({ kind: 'anime', color: '#FF5577' })).badge).toBeNull();
  });
  it('anime centroid honors the visited flag (green progress ring)', () => {
    const visual = resolveMarkerVisual({
      id: 'bgm:115908',
      kind: 'anime',
      lat: 34.9,
      lng: 135.8,
      title: '響け！ユーフォニアム',
      color: '#4a90d9',
      pointsLength: 577,
      visited: true,
    } as MapMarker);
    expect(visual.visited).toBe(true);
    expect(visual.shape).toBe('balloon');
  });
});

describe('resolveMarkerVisual — city88 never shows visited', () => {
  it('city88 markers never show visited', () => {
    const visual = resolveMarkerVisual({
      id: '88:1',
      kind: 'city88',
      lat: 35,
      lng: 139,
      title: 'x',
      color: '#caa64b',
      visited: true,
    } as MapMarker);
    expect(visual.visited).toBe(false);
  });
});

describe('resolveMarkerVisual — canonical locality roles and areas', () => {
  it('PILG-058 gives stamp, shop, festival, and area markers distinct shapes', () => {
    expect(resolveMarkerVisual(base({ kind: 'stamp' })).shape).toBe('stamp');
    expect(resolveMarkerVisual(base({ kind: 'shop' })).shape).toBe('shop');
    expect(resolveMarkerVisual(base({ kind: 'festival' })).shape).toBe('festival');
    expect(resolveMarkerVisual(base({ kind: 'area' })).shape).toBe('area');
  });

  it('PILG-058 lets stamp pins reflect collected progress but never marks areas visited', () => {
    expect(resolveMarkerVisual(base({ kind: 'stamp', visited: true })).visited).toBe(true);
    expect(resolveMarkerVisual(base({ kind: 'area', visited: true })).visited).toBe(false);
  });
});
