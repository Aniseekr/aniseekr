// Pure builder for the share-route params object. `preview.tsx` hands over the
// already-resolved focused-shot values; this module stringifies them into the
// router-safe `Record<string, string>` the share screen reads back. The shot's
// captured width/height are ALWAYS forwarded (the orientation truth the share
// pipeline letterboxes against); the optional sensor/score fields are only
// included when present so the share screen can tell "absent" from "0".

export type ShareRouteParamsInput = {
  spotId: string;
  imageUrl: string;
  shotUri: string;
  name: string;
  ep: string | null;
  animeId: string | null;
  animeTitle: string | null;
  themeColor: string;
  spotLat: string | null;
  spotLng: string | null;
  /** Captured shot pixel dimensions — the orientation truth, always forwarded. */
  shotWidth: number;
  shotHeight: number;
  /** Optional capture-time sensor snapshot (forwarded only when measured). */
  tilt?: number | null;
  headingDeltaDeg?: number | null;
  /** Optional analysis results (forwarded only when computed). */
  matchScore?: number | null;
  frameValid?: boolean | null;
  frameReason?: string | null;
  positionScore?: number | null;
};

export function buildShareRouteParams(input: ShareRouteParamsInput): Record<string, string> {
  const params: Record<string, string> = {
    spotId: input.spotId,
    imageUrl: input.imageUrl,
    shotUri: input.shotUri,
    name: input.name,
    ep: input.ep ?? '',
    animeId: input.animeId ?? '',
    animeTitle: input.animeTitle ?? '',
    themeColor: input.themeColor,
    spotLat: input.spotLat ?? '',
    spotLng: input.spotLng ?? '',
    // Orientation truth — always carried so the share pipeline can letterbox.
    shotWidth: String(input.shotWidth),
    shotHeight: String(input.shotHeight),
  };
  if (input.tilt != null) params.tilt = String(input.tilt);
  if (input.headingDeltaDeg != null) params.headingDeltaDeg = String(input.headingDeltaDeg);
  if (input.matchScore != null) params.matchScore = String(input.matchScore);
  if (input.frameValid != null) params.frameValid = input.frameValid ? '1' : '0';
  if (input.frameReason != null && input.frameReason.length > 0) {
    params.frameReason = input.frameReason;
  }
  if (input.positionScore != null) params.positionScore = String(input.positionScore);
  return params;
}
