import { describe, expect, test } from 'bun:test';
import { composeAreaRows, groupSpotsIntoAreas } from '../../../libs/services/pilgrimage/spot-areas';
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

describe('composeAreaRows', () => {
  // Regression: rowData in PilgrimageDetailSheet used to concatenate only
  // `area.spots`, so any spot `groupSpotsIntoAreas` dropped (no usable geo —
  // a real, expected state SpotRow already renders gracefully) silently
  // vanished from the list in rows mode with ≥2 areas (CLAUDE.md Rule 8).

  test('<2 areas: returns every input spot flat, including geo-less, no headers', () => {
    const spots = [spot('a', 35.0, 139.0), spot('b', 35.0002, 139.0002), spot('nogeo', 0, 0)];
    const areas = groupSpotsIntoAreas(spots);
    expect(areas.length).toBeLessThan(2);
    const rows = composeAreaRows(spots, areas);
    expect(rows.filter((r) => r.kind === 'header')).toHaveLength(0);
    const spotRows = rows.filter((r) => r.kind === 'spot');
    expect(spotRows).toHaveLength(spots.length);
    expect(spotRows.map((r) => (r as { spot: AnitabiSpot }).spot.id)).toEqual([
      'a',
      'b',
      'nogeo',
    ]);
  });

  test('>=2 areas: geo-less spots are appended as trailing rows after every section, none dropped', () => {
    const spots = [
      spot('near', 35.0, 139.0),
      spot('far', 35.9, 139.9),
      spot('nogeo1', 0, 0),
      spot('nogeo2', NaN, NaN),
    ];
    const areas = groupSpotsIntoAreas(spots);
    expect(areas.length).toBeGreaterThanOrEqual(2);
    const rows = composeAreaRows(spots, areas);

    // Invariant: composed row spot-count === input spot count.
    const spotRows = rows.filter((r) => r.kind === 'spot') as { kind: 'spot'; spot: AnitabiSpot }[];
    expect(spotRows).toHaveLength(spots.length);
    expect(new Set(spotRows.map((r) => r.spot.id))).toEqual(
      new Set(['near', 'far', 'nogeo1', 'nogeo2'])
    );

    // Geo-less spots land after the last header (trailing, unsectioned).
    const lastHeaderIndex = rows.reduce(
      (acc, r, i) => (r.kind === 'header' ? i : acc),
      -1
    );
    const nogeoIndices = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.kind === 'spot' && (r.spot.id === 'nogeo1' || r.spot.id === 'nogeo2'))
      .map(({ i }) => i);
    for (const i of nogeoIndices) expect(i).toBeGreaterThan(lastHeaderIndex);
  });

  test('header rows carry a precomputed, sequential 1-indexed areaNumber', () => {
    const spots = [spot('near', 35.0, 139.0), spot('far', 35.9, 139.9)];
    const areas = groupSpotsIntoAreas(spots);
    const rows = composeAreaRows(spots, areas);
    const headers = rows.filter((r) => r.kind === 'header') as {
      kind: 'header';
      areaNumber: number;
    }[];
    expect(headers.map((h) => h.areaNumber)).toEqual(areas.map((_, i) => i + 1));
  });

  test('invariant holds across mixed valid/invalid geo for both <2 and >=2 area cases', () => {
    const fixtures: AnitabiSpot[][] = [
      // all invalid geo, single implicit "area" (none)
      [spot('x', 0, 0), spot('y', NaN, NaN)],
      // one real area + geo-less
      [spot('a', 35.0, 139.0), spot('b', 35.0001, 139.0001), spot('nogeo', 0, 0)],
      // multiple areas + geo-less
      [
        spot('near1', 35.0, 139.0),
        spot('near2', 35.0001, 139.0001),
        spot('far', 35.9, 139.9),
        spot('nogeo', 0, 0),
      ],
    ];
    for (const spots of fixtures) {
      const areas = groupSpotsIntoAreas(spots);
      const rows = composeAreaRows(spots, areas);
      const spotRows = rows.filter((r) => r.kind === 'spot');
      expect(spotRows).toHaveLength(spots.length);
    }
  });
});
