import type { AtlasScene, AtlasSpot, AtlasTitles, AtlasWork } from './atlas/types';

export type PilgrimageSpotConfidence = AtlasSpot['confidence'];

export interface PilgrimageSpot {
  id: string;
  workKey: string;
  name: string;
  address: string;
  note: string;
  lat: number | null;
  lon: number | null;
  precision?: string | null;
  confidence: PilgrimageSpotConfidence;
  scenes: AtlasScene[];
  sources: AtlasSpot['sources'];
}

export interface PilgrimageWork extends AtlasWork {
  dataVersion: string;
  titleJa: string;
  titleEn: string;
  titleZh?: AtlasTitles;
  spots: PilgrimageSpot[];
  /** Set only when this work was read from a downloaded offline trip pack
   *  because Atlas was unreachable; the UI labels it "offline copy · date". */
  offlineCopy?: { downloadedAt: number };
}
