// Local intel layer entity types (spec §13).
//
// Curated locality data around pilgrimage spots: anime-tied shops, collab
// events, and best-viewing hints. Every entry is human-verified and carries
// provenance — the loader drops entries missing it, so nothing in this layer
// can present unverified data as fact.

/**
 * Inline multi-language text. `ja` is canonical (all P0 entries are Japanese
 * businesses/events). `zhHans` converts to Traditional at resolution time
 * when `zhHant` is absent.
 */
export interface LocalizedText {
  ja: string;
  en?: string;
  zhHant?: string;
  zhHans?: string;
}

/** Provenance — required on every entry. Entries without it are dropped. */
export interface IntelProvenance {
  /** URL where the fact was verified at authoring time. */
  sourceUrl: string;
  /** Business/event official site when different from sourceUrl. */
  officialUrl?: string;
  /** ISO date (YYYY-MM-DD) of human verification. */
  verifiedAt: string;
}

/**
 * Link to an Anitabi point. Point ids are only stable within one anime, so
 * references are always qualified by the Bangumi subject id.
 */
export interface SpotRef {
  bangumiId: number;
  pointId: string;
}

export interface StampSpot {
  name: LocalizedText;
  /** Official street address when the source lists one. Omitted for spots
   *  sourced from an official Google My Maps (coords only, no address). */
  address?: string;
  geo: [number, number] | null;
  sourceUrl: string;
}

interface LocalIntelEntryBase extends IntelProvenance {
  /** Stable slug, e.g. 'yasudaya-ryokan'. Survives server-sync migration. */
  id: string;
  /** All related Bangumi subjects (a work can span seasons/movies). */
  bangumiIds: number[];
  name: LocalizedText;
  description: LocalizedText;
  /** [lat, lng]; null only for area-wide events with no single venue. */
  geo: [number, number] | null;
  /** Exact Anitabi point anchors. Beats geo proximity when present. */
  spotRefs?: SpotRef[];
  /** IANA timezone. Defaults to Asia/Tokyo when absent. */
  timezone?: string;
}

export type ShopCategory = 'restaurant' | 'cafe' | 'goods' | 'museum' | 'hotel' | 'other';

export interface LocalIntelShop extends LocalIntelEntryBase {
  kind: 'shop';
  category: ShopCategory;
  /** WHY the business is anime-tied ("model of Chika's home", …). */
  animeConnection: LocalizedText;
  /** Free-text opening hours, sourced. */
  hours?: string;
}

export type EventCategory = 'stamp_rally' | 'festival' | 'collab_cafe' | 'exhibition' | 'other';

/** One dated edition of an event. Dates are ISO YYYY-MM-DD in the event tz. */
export interface EventOccurrence {
  year: number;
  startsAt: string;
  endsAt: string;
}

export type EventSchedule =
  | { kind: 'fixed'; startsAt: string; endsAt: string }
  | {
      kind: 'annual';
      /** 1–12. Displayed when no occurrence is confirmed ("held annually in N"). */
      typicalMonth: number;
      /** Officially announced editions. May be empty — dates are never invented. */
      confirmed: EventOccurrence[];
      discontinued?: boolean;
    }
  | {
      /** Permanent program with no end date (e.g. Numazu まちあるきスタンプ). */
      kind: 'ongoing';
      /** ISO date the program started, when sourced. */
      since?: string;
    };

export interface LocalIntelEvent extends LocalIntelEntryBase {
  kind: 'event';
  category: EventCategory;
  schedule: EventSchedule;
  stampSpots?: StampSpot[];
  venue?: LocalizedText;
}

export type ViewingHintKind =
  | 'sunset'
  | 'sunrise'
  | 'golden_hour'
  | 'blue_hour'
  | 'night'
  | 'seasonal';

export interface LocalIntelViewingHint extends LocalIntelEntryBase {
  kind: 'viewing_hint';
  hint: ViewingHintKind;
  /** Months (1–12) when the view is at its best, when sourced. */
  bestMonths?: number[];
  /** Curated seasonal/climate note. Sourced — never speculative. */
  note: LocalizedText;
  /** Geo-near matching radius in metres. Default 250. */
  radiusM?: number;
}

export type LocalIntelEntry = LocalIntelShop | LocalIntelEvent | LocalIntelViewingHint;

/** Dataset envelope — same shape family as the other bundled `*.data.json`. */
export interface LocalIntelFile {
  $schema?: string;
  generatedAt: number;
  source: string;
  count: number;
  entries: LocalIntelEntry[];
}

export const DEFAULT_SPOT_TIMEZONE = 'Asia/Tokyo';
export const DEFAULT_VIEWING_HINT_RADIUS_M = 250;

/** Where a card tap should land: official site first, else the verification source. */
export function intelLinkUrl(entry: IntelProvenance): string {
  return entry.officialUrl ?? entry.sourceUrl;
}
