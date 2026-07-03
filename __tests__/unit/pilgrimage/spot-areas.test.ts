import { describe, expect, test } from 'bun:test';
import { groupSpotsIntoAreas } from '../../../libs/services/pilgrimage/spot-areas';
import type { AnitabiSpot } from '../../../libs/services/pilgrimage/types';

function spot(id: string, lat: number, lng: number): AnitabiSpot {
  return { id, name: id, geo: [lat, lng], image: `https://x/${id}.jpg`, scenes: [] };
}

describe('groupSpotsIntoAreas', () => {
  test('collapses spots within one cell into a single area', () => {
    // ~200m apart at lat 35 — well inside a 2km cell
    const areas = groupSpotsIntoAreas([spot('a', 35.0000, 139.0000), spot('b', 35.0018, 139.0018)]);
    expect(areas).toHaveLength(1);
    expect(areas[0].spots.map((s) => s.id)).toEqual(['a', 'b']);
  });

  test('splits spots that fall in different cells', () => {
    const areas = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('z', 35.9, 139.9)]);
    expect(areas).toHaveLength(2);
  });

  test('preserves input order for area ordering (first appearance wins)', () => {
    const areas = groupSpotsIntoAreas([spot('far', 35.9, 139.9), spot('near', 35.0, 139.0)]);
    expect(areas[0].spots[0].id).toBe('far');
  });

  test('computes bounds enclosing every spot in the area', () => {
    const areas = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('b', 35.0018, 139.0018)]);
    const b = areas[0].bounds;
    expect(b.south).toBeCloseTo(35.0, 4);
    expect(b.north).toBeCloseTo(35.0018, 4);
    expect(b.west).toBeCloseTo(139.0, 4);
    expect(b.east).toBeCloseTo(139.0018, 4);
  });

  test('drops spots with no usable geo and returns [] for empty input', () => {
    expect(groupSpotsIntoAreas([])).toEqual([]);
    const areas = groupSpotsIntoAreas([spot('nogeo', 0, 0), spot('ok', 35.0, 139.0)]);
    expect(areas).toHaveLength(1);
    expect(areas[0].spots[0].id).toBe('ok');
  });

  test('cellKm widens buckets (two 3km-apart spots merge at cellKm=5)', () => {
    const a = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('b', 35.027, 139.0)]);
    const b = groupSpotsIntoAreas([spot('a', 35.0, 139.0), spot('b', 35.027, 139.0)], { cellKm: 5 });
    expect(a.length).toBe(2);
    expect(b.length).toBe(1);
  });
});
