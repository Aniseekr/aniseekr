import { describe, expect, it } from 'bun:test';

import { buildTimeline } from '../../../libs/services/pilgrimage/journal-timeline';
import { buildSpotGrid, spotsWithin } from '../../../libs/services/pilgrimage/track/spot-grid';
import { buildGpx } from '../../../libs/services/pilgrimage/track/track-gpx';
import type { SavedTrack } from '../../../libs/services/pilgrimage/track/track-store';
import { buildTripRoute, drawRoute } from '../../../libs/services/pilgrimage/track/trip-route';
import {
  judgePoint,
  packPoint,
  simplifyTrack,
  trackTotals,
  unpackPoint,
  type TrackPoint,
} from '../../../libs/services/pilgrimage/track/track-math';

// 0.0001° of latitude is about 11.1 m.
const T0 = 1_800_000_000_000;
const at = (lat: number, t: number, extra: Partial<TrackPoint> = {}): TrackPoint => ({
  lat,
  lon: 137.25,
  t: T0 + t * 1000,
  acc: 5,
  ...extra,
});

describe('pilgrimage track recording', () => {
  it('PILG-121 keeps only trustworthy points and measures the walk without counting stops or pauses', () => {
    const start = at(36.14, 0);
    expect(judgePoint(null, start)).toBe('accept');
    expect(judgePoint(null, at(36.14, 0, { acc: 80 }))).toBe('inaccurate');
    expect(judgePoint(start, at(36.14005, 5))).toBe('still'); // ~5.5 m
    expect(judgePoint(start, at(36.1402, 10))).toBe('accept'); // ~22 m
    expect(judgePoint(start, at(36.15, 2))).toBe('jump'); // ~1.1 km in 2 s
    expect(judgePoint(start, at(36.1402, -3))).toBe('stale');
    // A resume point is kept even when it has not moved.
    expect(judgePoint(start, at(36.14, 60, { start: true }))).toBe('accept');

    const walk = [
      at(36.14, 0, { start: true }),
      at(36.1401, 10),
      at(36.1402, 20),
      at(36.1403, 20 + 600), // stood still for ten minutes, then moved on
      at(36.2, 2000, { start: true }), // resumed elsewhere after a pause
      at(36.2001, 2010),
    ];
    const totals = trackTotals(walk);
    expect(Math.round(totals.meters)).toBe(44); // 4 × 11.1 m; the pause gap is not walked
    expect(totals.movingMs).toBe(30_000); // the ten-minute stop and the pause are not moving time

    // A straight line collapses to its ends; both segments survive.
    expect(simplifyTrack(walk, 5).map((p) => p.t - T0)).toEqual([0, 620_000, 2_000_000, 2_010_000]);
    expect(unpackPoint(packPoint(walk[4] as TrackPoint))).toEqual(walk[4] as TrackPoint);
  });

  it('PILG-122 finds the spots a recorded point is standing at', () => {
    const grid = buildSpotGrid([
      ['near', 'hyouka', '橋', 36.1403, 137.25, 'c', [1]],
      ['edge', 'hyouka', '角', 36.1404, 137.25, 's', []], // ~44 m, across a cell border
      ['far', 'other', '駅', 36.141, 137.25, 'c', []], // ~111 m
      ['nowhere', 'other', '無', 0, 0, 'u', []],
    ]);
    expect(grid.size).toBe(3);
    expect(spotsWithin(grid, 36.14, 137.25).map((s) => s.id)).toEqual(['near', 'edge']);
    expect(spotsWithin(grid, 35, 139)).toEqual([]);
  });

  const savedWalk = (startedAt: number): SavedTrack => ({
    id: 'w1',
    startedAt,
    endedAt: startedAt + 60_000,
    meters: 22,
    movingMs: 20_000,
    count: 3,
    stamped: 1,
    bounds: null,
    points: [
      [36.14, 137.25, startedAt, 5, 1],
      [36.1401, 137.25, startedAt + 10_000, 5],
      [36.2, 137.3, startedAt + 40_000, 5, 1],
      [36.2001, 137.3001, startedAt + 50_000, 5],
    ],
    stampedSpots: [
      {
        spotId: 's1',
        workKey: 'hyouka',
        name: '橋 & <川>',
        lat: 36.14,
        lon: 137.25,
        at: startedAt,
      },
    ],
    passed: [],
  });

  it('PILG-123 a day with only a walk or an on-site stamp still appears in the timeline', () => {
    const day1 = new Date(2026, 9, 5, 10).getTime();
    const day2 = new Date(2026, 9, 6, 15).getTime();
    const later = new Date(2026, 9, 20, 9).getTime();
    const trips = buildTimeline([], {
      walks: [{ id: 'w1', startedAt: day1, meters: 1200, movingMs: 900_000 }],
      stamps: [
        { spotId: 'a', name: '花里跨線橋', at: day2 },
        { spotId: 'b', name: '鍛冶橋', at: later },
      ],
    });
    expect(trips.map((trip) => trip.days.length)).toEqual([1, 2]); // newest trip first
    const [recent, first] = trips;
    expect(recent?.stamps).toBe(1);
    expect(first).toMatchObject({ photos: 0, walkMeters: 1200, walkMovingMs: 900_000, stamps: 1 });
    expect(first?.days.map((day) => [day.walks.length, day.places])).toEqual([
      [0, ['花里跨線橋']],
      [1, []],
    ]);
  });

  it('PILG-124 a trip route is the recorded walk, else the stamps in visit order with no distance', () => {
    const from = new Date(2026, 9, 5).getTime();
    const to = from + 86_400_000 - 1;
    const stamp = (spotId: string, lat: number, at: number | null) => ({
      spotId,
      at: from,
      onsiteAt: at,
      via: null,
      meta: { workKey: 'hyouka', name: spotId, lat, lon: 137.25 },
    });
    const stamps = [
      stamp('late', 36.15, from + 7200_000),
      stamp('early', 36.14, from + 3600_000),
      stamp('manual', 36.2, null),
    ];

    const walked = buildTripRoute([savedWalk(from + 1000)], stamps, from, to);
    expect(walked).toMatchObject({ kind: 'track', meters: 22, movingMs: 20_000, trackIds: ['w1'] });
    expect(walked?.lines.length).toBe(2); // the pause splits the line
    // Only the stamp on the walk is drawn; 'late' was pressed a kilometre away.
    expect(walked?.stops.map((s) => s.name)).toEqual(['early']);

    const ordered = buildTripRoute([savedWalk(from - 86_400_000)], stamps, from, to);
    expect(ordered).toMatchObject({ kind: 'order', meters: null, movingMs: null, trackIds: [] });
    expect(ordered?.lines).toEqual([
      [
        { lat: 36.14, lon: 137.25 },
        { lat: 36.15, lon: 137.25 },
      ],
    ]);
    expect(buildTripRoute([], [stamps[0] as (typeof stamps)[number]], from, to)).toBeNull();

    // North is up and the drawing stays inside the box.
    const drawing = drawRoute(ordered as NonNullable<typeof ordered>, 200, 100, 10);
    expect(drawing.start).toEqual({ x: 100, y: 90 });
    expect(drawing.end).toEqual({ x: 100, y: 10 });
  });

  it('PILG-125 a walk exports as GPX 1.1 with one segment per recorded stretch and escaped names', () => {
    const startedAt = Date.UTC(2026, 9, 5, 1, 0, 0);
    const gpx = buildGpx(savedWalk(startedAt), '10/5 巡禮');
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1"')).toBe(true);
    expect(gpx.match(/<trkseg>/g)?.length).toBe(2);
    expect(gpx.match(/<trkpt /g)?.length).toBe(4);
    expect(gpx).toContain(
      '<trkpt lat="36.14" lon="137.25"><time>2026-10-05T01:00:00.000Z</time></trkpt>'
    );
    expect(gpx).toContain('<name>橋 &amp; &lt;川&gt;</name>');
  });
});
