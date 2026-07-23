import { describe, expect, it } from 'bun:test';

import {
  buildGoogleMapsSearchUrl,
  getLocalityEventDetail,
  getLocalityEventListRows,
} from '../../../libs/services/pilgrimage/locality/event-detail';
import { localityRepository } from '../../../libs/services/pilgrimage/locality/locality-repository';
import type { EventId } from '../../../libs/services/pilgrimage/locality/types';

describe('canonical locality event detail', () => {
  it('PILG-056 wires a stamp campaign to every stop role, place, map target, and provenance', () => {
    const detail = getLocalityEventDetail('numazu-machiaruki-stamp' as EventId, localityRepository);

    expect(String(detail?.event.id)).toBe('numazu-machiaruki-stamp');
    expect(detail?.stops).toHaveLength(136);
    expect(detail?.stops.every((stop) => stop.role.kind === 'stamp_stop')).toBe(true);
    expect(detail?.stops.every((stop) => stop.place.id === stop.role.placeId)).toBe(true);
    expect(detail?.stops.every((stop) => stop.provenance.length > 0)).toBe(true);
    expect(detail?.stops.every((stop) => stop.mapsUrl?.includes('google.com/maps/search'))).toBe(
      true
    );
  });

  it('PILG-056 wires festival events only to their canonical festival venue roles', () => {
    const detail = getLocalityEventDetail('yuwaku-bonbori-matsuri' as EventId, localityRepository);

    expect(detail?.stops).toHaveLength(1);
    expect(detail?.stops[0].role.kind).toBe('festival_venue');
    expect(String(detail?.stops[0].place.id)).toBe('yuwaku-onsen');
  });

  it('PILG-056 builds the integrated list from all canonical events and surfaces all 201 stops', () => {
    const rows = getLocalityEventListRows(new Date('2026-07-18T00:00:00.000Z'), localityRepository);

    expect(rows).toHaveLength(9);
    expect(
      rows.flatMap((row) => row.stops).filter((stop) => stop.role.kind === 'stamp_stop')
    ).toHaveLength(201);
    expect(rows.at(-1)?.state.state).toBe('ended');
    const ongoing = rows.find((row) => row.event.id === 'numazu-machiaruki-stamp');
    expect(ongoing?.event.schedule.kind).toBe('ongoing');
    expect(ongoing?.stopCount).toBe(136);
    expect(ongoing?.primaryLocation).not.toBeNull();
  });

  it('PILG-056 opens Google Maps by exact geo first and address when geo is unavailable', () => {
    expect(buildGoogleMapsSearchUrl([35.123, 139.456], { ja: '住所' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=35.123,139.456'
    );
    expect(buildGoogleMapsSearchUrl(null, { ja: '東京都 千代田区' }, 'ja')).toBe(
      'https://www.google.com/maps/search/?api=1&query=%E6%9D%B1%E4%BA%AC%E9%83%BD%20%E5%8D%83%E4%BB%A3%E7%94%B0%E5%8C%BA'
    );
    expect(buildGoogleMapsSearchUrl(null, undefined)).toBeNull();
  });
});
