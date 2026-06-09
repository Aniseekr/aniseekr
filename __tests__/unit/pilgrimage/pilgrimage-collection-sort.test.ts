import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_PILGRIMAGE_SORT_KEY,
  resolveEffectivePilgrimageSortKey,
  resolvePilgrimageSortKeys,
  sortPilgrimageAnimes,
} from '../../../libs/services/pilgrimage/pilgrimage-collection-sort';
import type { AnitabiBangumi } from '../../../libs/services/pilgrimage/types';

function anime(
  id: number,
  pointsLength: number,
  title: string,
  extra: Partial<AnitabiBangumi> = {}
): AnitabiBangumi {
  return {
    id,
    title,
    cn: '',
    city: '',
    cover: '',
    color: '#FF9F0A',
    geo: [35, 139],
    zoom: 12,
    modified: 1,
    litePoints: [],
    pointsLength,
    imagesLength: 1,
    ...extra,
  };
}

describe('sortPilgrimageAnimes', () => {
  it('orders by spot count descending for the spots key', () => {
    const sorted = sortPilgrimageAnimes(
      [anime(1, 5, 'B'), anime(2, 20, 'A'), anime(3, 12, 'C')],
      'spots'
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('breaks spot-count ties alphabetically by title', () => {
    const sorted = sortPilgrimageAnimes(
      [anime(1, 10, 'Charlie'), anime(2, 10, 'Alpha'), anime(3, 10, 'Bravo')],
      'spots'
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('orders alphabetically by display title for the title key', () => {
    const sorted = sortPilgrimageAnimes(
      [anime(1, 1, 'Yuru Camp'), anime(2, 1, 'Aria'), anime(3, 1, 'Bocchi')],
      'title'
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('uses the provided getTitle selector instead of the default fields', () => {
    const sorted = sortPilgrimageAnimes(
      // Default would sort by `title` (Z before A is wrong way round); the
      // selector overrides it so the displayed label drives the order.
      [anime(1, 1, 'Zzz'), anime(2, 1, 'Aaa')],
      'title',
      { getTitle: (a) => (a.id === 1 ? 'Apple' : 'Banana') }
    );
    expect(sorted.map((a) => a.id)).toEqual([1, 2]);
  });

  it('falls back to the Japanese title then the Chinese title by default', () => {
    const sorted = sortPilgrimageAnimes(
      [anime(1, 1, '', { cn: 'Beta' }), anime(2, 1, 'Alpha')],
      'title'
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 1]);
  });

  it('orders nearest first for the distance key, pushing unknown distances last', () => {
    const distances = new Map<number, number>([
      [1, 50],
      [2, 10],
      // id 3 has no known distance.
    ]);
    const sorted = sortPilgrimageAnimes(
      [anime(1, 5, 'A'), anime(2, 5, 'B'), anime(3, 8, 'C')],
      'distance',
      { distanceKmOf: (a) => distances.get(a.id) }
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 1, 3]);
  });

  it('orders unknown distances among themselves by spot count', () => {
    const sorted = sortPilgrimageAnimes(
      [anime(1, 5, 'A'), anime(2, 20, 'B'), anime(3, 12, 'C')],
      'distance',
      { distanceKmOf: () => undefined }
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it('ignores non-finite distances and treats them as unknown', () => {
    const sorted = sortPilgrimageAnimes(
      [anime(1, 5, 'A'), anime(2, 9, 'B')],
      'distance',
      { distanceKmOf: (a) => (a.id === 1 ? NaN : 4) }
    );
    expect(sorted.map((a) => a.id)).toEqual([2, 1]);
  });

  it('does not mutate the input array', () => {
    const input = [anime(1, 5, 'A'), anime(2, 20, 'B')];
    const before = input.map((a) => a.id);
    sortPilgrimageAnimes(input, 'spots');
    expect(input.map((a) => a.id)).toEqual(before);
  });
});

describe('resolvePilgrimageSortKeys', () => {
  it('offers distance only when a location is available', () => {
    expect(resolvePilgrimageSortKeys(true)).toEqual(['distance', 'spots', 'title']);
    expect(resolvePilgrimageSortKeys(false)).toEqual(['spots', 'title']);
  });
});

describe('resolveEffectivePilgrimageSortKey', () => {
  it('collapses distance to spots when there is no location', () => {
    expect(resolveEffectivePilgrimageSortKey('distance', false)).toBe('spots');
    expect(resolveEffectivePilgrimageSortKey('distance', true)).toBe('distance');
    expect(resolveEffectivePilgrimageSortKey('title', false)).toBe('title');
    expect(resolveEffectivePilgrimageSortKey('spots', false)).toBe('spots');
  });
});

describe('DEFAULT_PILGRIMAGE_SORT_KEY', () => {
  it('defaults to nearest-first', () => {
    expect(DEFAULT_PILGRIMAGE_SORT_KEY).toBe('distance');
  });
});
