// Pilgrimage data shapes returned by Anitabi (anitabi.cn) public API.
// See spec/pilgrimage_spec.md §3.

/**
 * A single anime scene/location point.
 */
export interface AnitabiPoint {
  /** Stable id within an anime, e.g. "abc123". */
  id: string;
  /** Optional Chinese name of the spot. */
  cn?: string;
  /** Japanese name (canonical). */
  name: string;
  /** Scene screenshot URL (CDN-served, sometimes slow on first load). */
  image: string;
  /** Episode number where the scene appears. */
  ep: number;
  /** Scene/second marker within the episode. */
  s: number;
  /** [latitude, longitude]. May be [0, 0] for incomplete entries. */
  geo: [number, number];
}

/**
 * Anime entry from Anitabi (the "container" wrapping the points list).
 */
export interface AnitabiBangumi {
  /** Bangumi subject ID — the cross-platform link key. */
  id: number;
  /** Chinese title. May be empty string. */
  cn: string;
  /** Japanese title (original). */
  title: string;
  /** Primary city/prefecture, e.g. "東京都". */
  city: string;
  /** Cover image URL. */
  cover: string;
  /** Dominant theme color hex string, e.g. "#8DC5D8". */
  color: string;
  /** Center coordinates [lat, lng]. */
  geo: [number, number];
  /** Recommended map zoom level (8–14). */
  zoom: number;
  /** Last-modified epoch (seconds or ms depending on server). */
  modified: number;
  /** Up to ~10 sample points used for cards. */
  litePoints: AnitabiPoint[];
  /** Total spot count across the whole anime. */
  pointsLength: number;
  /** Total scene image count. */
  imagesLength: number;
}

/**
 * Full point with extended fields, returned by /points/detail.
 * Extends {@link AnitabiPoint} with optional address & display data.
 */
export interface AnitabiPointDetail extends AnitabiPoint {
  origin?: { lat: number; lng: number; address: string };
  zoom?: number;
  ja?: string;
  haveImage?: boolean;
}
