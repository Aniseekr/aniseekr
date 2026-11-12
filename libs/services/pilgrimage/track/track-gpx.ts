// GPX 1.1 for a saved walk: one <trk> with a <trkseg> per recorded segment,
// and a <wpt> for each spot stamped on the way. Times are UTC, as GPX requires.
import { trackSegments, unpackPoint } from './track-math';
import type { SavedTrack } from './track-store';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const iso = (ms: number) => new Date(ms).toISOString();

export function buildGpx(track: SavedTrack, name: string): string {
  const waypoints = track.stampedSpots
    .map(
      (spot) =>
        `  <wpt lat="${spot.lat}" lon="${spot.lon}"><time>${iso(spot.at)}</time><name>${escapeXml(spot.name)}</name></wpt>`
    )
    .join('\n');
  const segments = trackSegments(track.points.map(unpackPoint))
    .map(
      (segment) =>
        `    <trkseg>\n${segment
          .map((p) => `      <trkpt lat="${p.lat}" lon="${p.lon}"><time>${iso(p.t)}</time></trkpt>`)
          .join('\n')}\n    </trkseg>`
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="AniSeekr" xmlns="http://www.topografix.com/GPX/1/1">',
    `  <metadata><name>${escapeXml(name)}</name><time>${iso(track.startedAt)}</time></metadata>`,
    ...(waypoints ? [waypoints] : []),
    '  <trk>',
    `    <name>${escapeXml(name)}</name>`,
    segments,
    '  </trk>',
    '</gpx>',
    '',
  ].join('\n');
}

/** File name for the export: `aniseekr-walk-20261113-0915.gpx` in local time. */
export function gpxFileName(startedAt: number): string {
  const d = new Date(startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `aniseekr-walk-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.gpx`;
}
