// The route of a trip (a date range in the journal): the recorded walks when
// there are any, otherwise the on-site stamps joined in the order they were
// pressed. The second kind is a visit order, not a path — it has no distance.
import type { Stamp } from '../stamp-details';
import { distanceMeters } from '../stamp-grade';
import { simplifyTrack, trackSegments, unpackPoint } from './track-math';
import type { SavedTrack } from './track-store';

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface TripRoute {
  /** 'track' = recorded GPS line; 'order' = stamps joined by visit time. */
  kind: 'track' | 'order';
  lines: RoutePoint[][];
  /** On-site stamps in the range that have coordinates, oldest first. */
  stops: (RoutePoint & { name: string })[];
  /** Null for a visit order: nobody measured that. */
  meters: number | null;
  movingMs: number | null;
  /** Walks behind a 'track' route, oldest first. */
  trackIds: string[];
}

const SHARE_TOLERANCE_METERS = 8;
/** A stamp this close to a recorded point belongs on the walk's drawing. */
const ROUTE_STOP_RADIUS_METERS = 150;

export function buildTripRoute(
  tracks: readonly SavedTrack[],
  stamps: readonly Stamp[],
  from: number,
  to: number
): TripRoute | null {
  const stops = stamps
    .filter(
      (stamp) =>
        stamp.onsiteAt !== null &&
        stamp.onsiteAt >= from &&
        stamp.onsiteAt <= to &&
        typeof stamp.meta?.lat === 'number' &&
        typeof stamp.meta?.lon === 'number'
    )
    .sort((a, b) => (a.onsiteAt as number) - (b.onsiteAt as number))
    .map((stamp) => ({
      lat: stamp.meta?.lat as number,
      lon: stamp.meta?.lon as number,
      name: stamp.meta?.name ?? '',
    }));
  const walked = tracks
    .filter((track) => track.startedAt >= from && track.startedAt <= to)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (walked.length > 0) {
    const walkedPoints = walked.map((track) => track.points.map(unpackPoint));
    const lines = walkedPoints.flatMap((points) =>
      trackSegments(simplifyTrack(points, SHARE_TOLERANCE_METERS))
        .filter((segment) => segment.length >= 2)
        .map((segment) => segment.map(({ lat, lon }) => ({ lat, lon })))
    );
    if (lines.length > 0) {
      return {
        kind: 'track',
        lines,
        // Only the stamps on the walk: one pressed across town would shrink the drawing.
        stops: stops.filter((stop) =>
          walkedPoints.some((points) =>
            points.some(
              (p) =>
                distanceMeters(
                  { latitude: p.lat, longitude: p.lon },
                  { latitude: stop.lat, longitude: stop.lon }
                ) <= ROUTE_STOP_RADIUS_METERS
            )
          )
        ),
        meters: walked.reduce((sum, track) => sum + track.meters, 0),
        movingMs: walked.reduce((sum, track) => sum + track.movingMs, 0),
        trackIds: walked.map((track) => track.id),
      };
    }
  }
  if (stops.length < 2) return null;
  return {
    kind: 'order',
    lines: [stops.map(({ lat, lon }) => ({ lat, lon }))],
    stops,
    meters: null,
    movingMs: null,
    trackIds: [],
  };
}

export interface RouteDrawing {
  /** One SVG path per line. */
  paths: string[];
  stops: { x: number; y: number }[];
  start: { x: number; y: number } | null;
  end: { x: number; y: number } | null;
}

/** Fits the route into a width × height box (north up), keeping its proportions. */
export function drawRoute(
  route: Pick<TripRoute, 'lines' | 'stops'>,
  width: number,
  height: number,
  padding: number
): RouteDrawing {
  const all = [...route.lines.flat(), ...route.stops];
  if (all.length === 0) return { paths: [], stops: [], start: null, end: null };
  const midLat = (Math.min(...all.map((p) => p.lat)) + Math.max(...all.map((p) => p.lat))) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = all.map((p) => p.lon * kx);
  const ys = all.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = maxY - Math.min(...ys);
  const boxW = width - padding * 2;
  const boxH = height - padding * 2;
  // A single point (or a straight north–south / east–west line) has no span on an axis.
  const scale = Math.min(spanX > 0 ? boxW / spanX : Infinity, spanY > 0 ? boxH / spanY : Infinity);
  const k = Number.isFinite(scale) ? scale : 1;
  const offX = padding + (boxW - spanX * k) / 2;
  const offY = padding + (boxH - spanY * k) / 2;
  const at = (p: RoutePoint) => ({
    x: Math.round((offX + (p.lon * kx - minX) * k) * 10) / 10,
    y: Math.round((offY + (maxY - p.lat) * k) * 10) / 10,
  });
  const lines = route.lines.map((line) => line.map(at));
  const first = lines[0]?.[0] ?? null;
  const lastLine = lines[lines.length - 1];
  return {
    paths: lines.map((line) => line.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')),
    stops: route.stops.map(at),
    start: first,
    end: lastLine?.[lastLine.length - 1] ?? null,
  };
}
