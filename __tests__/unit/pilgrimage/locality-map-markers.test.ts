import { describe, expect, it } from 'bun:test';

import { get88EntriesWithCoords } from '../../../libs/services/pilgrimage/anime88-repository';
import {
  buildAnime88AreaMarkers,
  buildCanonicalLocalityMarkers,
} from '../../../libs/services/pilgrimage/locality/map-markers';
import { localityRepository } from '../../../libs/services/pilgrimage/locality/locality-repository';
import type { EventId } from '../../../libs/services/pilgrimage/locality/types';

const PALETTE = {
  stamp: 'stamp-accent',
  shop: 'shop-accent',
  festival: 'festival-accent',
  area: 'area-accent',
} as const;

describe('canonical locality map markers', () => {
  it('PILG-058 projects the canonical role overlay with all three exact marker kinds', () => {
    const markers = buildCanonicalLocalityMarkers(localityRepository, PALETTE, {
      language: 'en',
    });
    const kinds = new Set(markers.map((marker) => marker.kind));

    expect(kinds).toEqual(new Set(['stamp', 'shop', 'festival']));
    expect(markers.every((marker) => marker.precision === 'exact')).toBe(true);
    expect(markers.every((marker) => marker.roleId && marker.placeId)).toBe(true);
  });

  it('PILG-058 projects exact campaign stops as typed stamp pins with event navigation', () => {
    const markers = buildCanonicalLocalityMarkers(localityRepository, PALETTE, {
      eventId: 'numazu-machiaruki-stamp' as EventId,
      language: 'en',
    });

    expect(markers).toHaveLength(136);
    expect(markers.every((marker) => marker.kind === 'stamp')).toBe(true);
    expect(markers.every((marker) => marker.eventId === 'numazu-machiaruki-stamp')).toBe(true);
    expect(markers.every((marker) => marker.precision === 'exact')).toBe(true);
  });

  it('PILG-058 keeps Anime88 canonical areas visually labelled and non-visitable', () => {
    const entries = get88EntriesWithCoords();
    const markers = buildAnime88AreaMarkers(entries, PALETTE.area);

    expect(entries).toHaveLength(124);
    expect(markers).toHaveLength(124);
    expect(markers.every((marker) => marker.kind === 'area')).toBe(true);
    expect(markers.every((marker) => marker.precision === 'area')).toBe(true);
    expect(markers.every((marker) => marker.placeId === undefined)).toBe(true);
    expect(markers.every((marker) => marker.title.length > 0)).toBe(true);
  });
});
