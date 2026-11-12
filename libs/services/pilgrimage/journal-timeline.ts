// The journal as a time flow: shots grouped into days, days into trips (a run
// of days with at most one empty day between them). A trip is what "整理成巡禮
// 相簿" turns into an album, chaptered by work. Labels come only from real
// data: a day's places are the spots its shots were filed under. A day also
// exists when it only has a recorded walk or a stamp pressed on site.
import type { PilgrimageAlbumEntry } from './album-captures';
import { getPilgrimageAnimeTitles, getPilgrimageSpotTitles } from './pilgrimage-localization';
import type { PilgrimageWork } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days apart (start to start) that still count as the same trip. */
const MAX_TRIP_GAP_DAYS = 2;

/** A recorded walk, as the timeline needs it. */
export interface TimelineWalk {
  id: string;
  startedAt: number;
  meters: number;
  movingMs: number;
}

/** A stamp pressed on site, as the timeline needs it. */
export interface TimelineStamp {
  spotId: string;
  name: string;
  at: number;
}

export interface TimelineExtras {
  walks?: readonly TimelineWalk[];
  stamps?: readonly TimelineStamp[];
}

export interface TimelineDay {
  /** Local midnight of the day (epoch ms). */
  start: number;
  /** Newest first. */
  entries: PilgrimageAlbumEntry[];
  /** Spot names in the order they were visited that day. */
  places: string[];
  /** Oldest first. */
  walks: TimelineWalk[];
  /** On-site stamps of the day. */
  stamps: number;
}

export interface TimelineTrip {
  /** Local midnight of the first day. */
  from: number;
  /** Last millisecond of the last day. */
  to: number;
  /** Newest first. */
  days: TimelineDay[];
  photos: number;
  works: number;
  /** Totals of the walks recorded on these days; 0 when there are none. */
  walkMeters: number;
  walkMovingMs: number;
  /** On-site stamps on these days. */
  stamps: number;
}

export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysBetween(laterStart: number, earlierStart: number): number {
  return Math.round((laterStart - earlierStart) / DAY_MS);
}

function endOfLocalDay(start: number): number {
  const d = new Date(start);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

function spotPlaces(entries: readonly PilgrimageAlbumEntry[]): string[] {
  const names: string[] = [];
  for (const entry of [...entries].sort((a, b) => a.capture.capturedAt - b.capture.capturedAt)) {
    if (!entry.spot) continue;
    const name = getPilgrimageSpotTitles(entry.spot).primary;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

export function buildTimeline(
  entries: readonly PilgrimageAlbumEntry[],
  extras: TimelineExtras = {}
): TimelineTrip[] {
  const byDay = new Map<
    number,
    { entries: PilgrimageAlbumEntry[]; walks: TimelineWalk[]; stamps: TimelineStamp[] }
  >();
  const dayOf = (ms: number) => {
    const start = startOfLocalDay(ms);
    let day = byDay.get(start);
    if (!day) {
      day = { entries: [], walks: [], stamps: [] };
      byDay.set(start, day);
    }
    return day;
  };
  for (const entry of entries) {
    if (!entry.capture.legacy) dayOf(entry.capture.capturedAt).entries.push(entry);
  }
  for (const walk of extras.walks ?? []) dayOf(walk.startedAt).walks.push(walk);
  for (const stamp of extras.stamps ?? []) dayOf(stamp.at).stamps.push(stamp);
  const days: TimelineDay[] = [...byDay.entries()]
    .sort(([a], [b]) => b - a)
    .map(([start, day]) => {
      const places = spotPlaces(day.entries);
      for (const stamp of [...day.stamps].sort((a, b) => a.at - b.at)) {
        if (stamp.name && !places.includes(stamp.name)) places.push(stamp.name);
      }
      return {
        start,
        entries: day.entries.sort((a, b) => b.capture.capturedAt - a.capture.capturedAt),
        places,
        walks: day.walks.sort((a, b) => a.startedAt - b.startedAt),
        stamps: day.stamps.length,
      };
    });

  const trips: TimelineTrip[] = [];
  for (const day of days) {
    const current = trips[trips.length - 1];
    const oldest = current?.days[current.days.length - 1];
    if (current && oldest && daysBetween(oldest.start, day.start) <= MAX_TRIP_GAP_DAYS) {
      current.days.push(day);
      current.from = day.start;
    } else {
      trips.push({
        from: day.start,
        to: endOfLocalDay(day.start),
        days: [day],
        photos: 0,
        works: 0,
        walkMeters: 0,
        walkMovingMs: 0,
        stamps: 0,
      });
    }
  }
  for (const trip of trips) {
    const tripEntries = trip.days.flatMap((day) => day.entries);
    trip.photos = tripEntries.length;
    trip.works = new Set(tripEntries.flatMap((e) => (e.anime ? [e.anime.key] : []))).size;
    for (const day of trip.days) {
      trip.stamps += day.stamps;
      for (const walk of day.walks) {
        trip.walkMeters += walk.meters;
        trip.walkMovingMs += walk.movingMs;
      }
    }
  }
  return trips;
}

export interface AlbumSpot {
  name: string;
  photos: number;
}

export interface AlbumChapter {
  /** null for the shots that are not at a known spot. */
  work: PilgrimageWork | null;
  title: string | null;
  spots: AlbumSpot[];
  /** Oldest first, the order they were taken. */
  entries: PilgrimageAlbumEntry[];
}

export interface TripAlbum {
  chapters: AlbumChapter[];
  photos: number;
  works: number;
  spots: number;
}

/** Chapter a date range by work, in the order the works were first visited. */
export function buildTripAlbum(
  entries: readonly PilgrimageAlbumEntry[],
  from: number,
  to: number
): TripAlbum {
  const inRange = entries
    .filter((e) => !e.capture.legacy && e.capture.capturedAt >= from && e.capture.capturedAt <= to)
    .sort((a, b) => a.capture.capturedAt - b.capture.capturedAt);
  const chapters = new Map<string, AlbumChapter>();
  const casual: AlbumChapter = { work: null, title: null, spots: [], entries: [] };
  const spotIds = new Set<string>();
  for (const entry of inRange) {
    if (!entry.anime) {
      casual.entries.push(entry);
      continue;
    }
    let chapter = chapters.get(entry.anime.key);
    if (!chapter) {
      chapter = {
        work: entry.anime,
        title: getPilgrimageAnimeTitles(entry.anime).primary,
        spots: [],
        entries: [],
      };
      chapters.set(entry.anime.key, chapter);
    }
    chapter.entries.push(entry);
    if (entry.spot) {
      spotIds.add(entry.spot.id);
      const name = getPilgrimageSpotTitles(entry.spot).primary;
      const spot = chapter.spots.find((s) => s.name === name);
      if (spot) spot.photos += 1;
      else chapter.spots.push({ name, photos: 1 });
    }
  }
  const ordered = [...chapters.values()];
  if (casual.entries.length) ordered.push(casual);
  return { chapters: ordered, photos: inRange.length, works: chapters.size, spots: spotIds.size };
}
