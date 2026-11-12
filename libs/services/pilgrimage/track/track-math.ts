// Pure maths for a recorded pilgrimage walk: which GPS points to keep, how far
// and how long the walk was, and a lighter line for drawing.
import { distanceMeters } from '../stamp-grade';

export interface TrackPoint {
  lat: number;
  lon: number;
  /** Epoch ms the OS took the fix. */
  t: number;
  /** Horizontal accuracy in metres, or null when the OS gave none. */
  acc: number | null;
  /** First point after a start or resume: no line and no distance from the one before. */
  start?: true;
}

/** Stored form: [lat, lon, t, acc, 1 when it starts a segment]. */
export type PackedPoint = [number, number, number, number | null, (0 | 1)?];

export const TRACK_MAX_ACCURACY_METERS = 50;
export const TRACK_MIN_STEP_METERS = 8;
/** Faster than any train: a jump this quick is a bad fix, not travel. */
export const TRACK_MAX_SPEED_MPS = 100;
/** A longer gap between two kept points was a stop, not movement. */
export const TRACK_MOVING_GAP_MS = 2 * 60_000;

export type PointVerdict = 'accept' | 'inaccurate' | 'stale' | 'still' | 'jump';

/** Whether `next` belongs on the track after `prev` (the last kept point). */
export function judgePoint(prev: TrackPoint | null, next: TrackPoint): PointVerdict {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lon)) return 'inaccurate';
  if (next.acc !== null && next.acc > TRACK_MAX_ACCURACY_METERS) return 'inaccurate';
  if (!prev) return 'accept';
  const dt = next.t - prev.t;
  if (dt <= 0) return 'stale';
  if (next.start) return 'accept';
  const step = distanceMeters(
    { latitude: prev.lat, longitude: prev.lon },
    { latitude: next.lat, longitude: next.lon }
  );
  if (step < TRACK_MIN_STEP_METERS) return 'still';
  if (step / (dt / 1000) > TRACK_MAX_SPEED_MPS) return 'jump';
  return 'accept';
}

/** Distance and moving time `next` adds after `prev`; nothing across a segment start. */
export function stepBetween(
  prev: TrackPoint | null,
  next: TrackPoint
): { meters: number; movingMs: number } {
  if (!prev || next.start) return { meters: 0, movingMs: 0 };
  const dt = next.t - prev.t;
  return {
    meters: distanceMeters(
      { latitude: prev.lat, longitude: prev.lon },
      { latitude: next.lat, longitude: next.lon }
    ),
    movingMs: dt > 0 && dt <= TRACK_MOVING_GAP_MS ? dt : 0,
  };
}

export function trackTotals(points: readonly TrackPoint[]): { meters: number; movingMs: number } {
  let meters = 0;
  let movingMs = 0;
  for (let i = 1; i < points.length; i += 1) {
    const step = stepBetween(points[i - 1] ?? null, points[i] as TrackPoint);
    meters += step.meters;
    movingMs += step.movingMs;
  }
  return { meters, movingMs };
}

export interface TrackBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function trackBounds(points: readonly TrackPoint[]): TrackBounds | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** The track as separate lines, split wherever recording started or resumed. */
export function trackSegments(points: readonly TrackPoint[]): TrackPoint[][] {
  const segments: TrackPoint[][] = [];
  for (const point of points) {
    const current = segments[segments.length - 1];
    if (!current || point.start) segments.push([point]);
    else current.push(point);
  }
  return segments;
}

/** Metres from `p` to the line a→b, on a flat local projection (fine at walk scale). */
function offLineMeters(p: TrackPoint, a: TrackPoint, b: TrackPoint): number {
  const k = 111_320;
  const cos = Math.cos((a.lat * Math.PI) / 180);
  const px = (p.lon - a.lon) * k * cos;
  const py = (p.lat - a.lat) * k;
  const bx = (b.lon - a.lon) * k * cos;
  const by = (b.lat - a.lat) * k;
  const len2 = bx * bx + by * by;
  const u = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - u * bx, py - u * by);
}

function simplifySegment(points: readonly TrackPoint[], tolerance: number): TrackPoint[] {
  if (points.length <= 2) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop() as [number, number];
    let worst = 0;
    let at = -1;
    for (let i = from + 1; i < to; i += 1) {
      const d = offLineMeters(
        points[i] as TrackPoint,
        points[from] as TrackPoint,
        points[to] as TrackPoint
      );
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (at !== -1 && worst > tolerance) {
      keep[at] = 1;
      stack.push([from, at], [at, to]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Drops points that sit within `toleranceMeters` of the line; segment ends are kept. */
export function simplifyTrack(
  points: readonly TrackPoint[],
  toleranceMeters: number
): TrackPoint[] {
  return trackSegments(points).flatMap((segment) => simplifySegment(segment, toleranceMeters));
}

export function packPoint(p: TrackPoint): PackedPoint {
  const lat = Math.round(p.lat * 1e6) / 1e6;
  const lon = Math.round(p.lon * 1e6) / 1e6;
  const acc = p.acc === null ? null : Math.round(p.acc);
  return p.start ? [lat, lon, p.t, acc, 1] : [lat, lon, p.t, acc];
}

export function unpackPoint(p: PackedPoint): TrackPoint {
  const point: TrackPoint = { lat: p[0], lon: p[1], t: p[2], acc: p[3] };
  if (p[4] === 1) point.start = true;
  return point;
}

/** 75 s → "1:15", 3 725 s → "1:02:05". */
export function formatTrackDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
