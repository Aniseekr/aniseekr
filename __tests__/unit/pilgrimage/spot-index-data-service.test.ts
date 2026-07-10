import { describe, expect, test } from 'bun:test';
import {
  mapSpotEntries,
  type SpotEntry,
} from '../../../libs/services/pilgrimage/spot-index-data-service';

function entry(overrides: Partial<SpotEntry> = {}): SpotEntry {
  return {
    id: 'p1',
    b: 100,
    lat: 35.6,
    lng: 139.7,
    n: 'Shrine',
    c: '神社',
    img: '/img/p1.jpg',
    ...overrides,
  };
}

describe('mapSpotEntries', () => {
  test('maps compact release fields onto the SpotIndexRow shape', () => {
    const rows = mapSpotEntries([entry()]);
    expect(rows).toEqual([
      {
        pointId: 'p1',
        bangumiId: 100,
        lat: 35.6,
        lng: 139.7,
        name: 'Shrine',
        cn: '神社',
        image: '/img/p1.jpg',
      },
    ]);
  });

  test('drops entries with an empty id', () => {
    expect(mapSpotEntries([entry({ id: '' })])).toEqual([]);
  });

  test('drops entries with an empty image', () => {
    expect(mapSpotEntries([entry({ img: '' })])).toEqual([]);
  });

  test('drops entries with non-finite lat/lng', () => {
    expect(mapSpotEntries([entry({ lat: NaN })])).toEqual([]);
    expect(mapSpotEntries([entry({ lng: Infinity })])).toEqual([]);
  });

  test('drops entries with out-of-range lat/lng', () => {
    expect(mapSpotEntries([entry({ lat: 91 })])).toEqual([]);
    expect(mapSpotEntries([entry({ lat: -91 })])).toEqual([]);
    expect(mapSpotEntries([entry({ lng: 181 })])).toEqual([]);
    expect(mapSpotEntries([entry({ lng: -181 })])).toEqual([]);
  });

  test('drops the (0,0) missing-GPS sentinel but keeps a real single-zero axis', () => {
    expect(mapSpotEntries([entry({ lat: 0, lng: 0 })])).toEqual([]);
    expect(mapSpotEntries([entry({ lat: 0, lng: 6.6 })])).toHaveLength(1);
  });

  test('drops entries with an invalid bangumi id', () => {
    expect(mapSpotEntries([entry({ b: 0 })])).toEqual([]);
    expect(mapSpotEntries([entry({ b: NaN })])).toEqual([]);
  });

  test('keeps well-formed entries and drops malformed ones from the same batch', () => {
    const rows = mapSpotEntries([entry({ id: 'good' }), entry({ id: 'bad', lat: NaN })]);
    expect(rows.map((r) => r.pointId)).toEqual(['good']);
  });

  test('empty input maps to empty output', () => {
    expect(mapSpotEntries([])).toEqual([]);
  });
});
