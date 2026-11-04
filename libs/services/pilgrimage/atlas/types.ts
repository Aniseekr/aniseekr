export interface AtlasWork {
  key: string;
  ja: string;
  en: string | null;
  zh?: AtlasTitles | null;
  mal: number[];
  bgm?: number[];
  n: number;
  conf: { c: number; s: number; u: number };
  cities: string[];
}

export interface AtlasTitles {
  hans?: string | null;
  hant?: string | null;
}

export interface AtlasWorkIndex {
  dataVersion?: string;
  works: AtlasWork[];
}
export interface AtlasScene {
  episode: string;
  time?: string;
  timeBasis?: string;
  episodeBasis?: string;
}
export interface AtlasSpot {
  id: string;
  name_ja: string;
  address_ja: string;
  note_ja: string;
  confidence: 'confirmed' | 'single' | 'unverified';
  location: { lat: number; lon: number; precision?: string; muniCd?: string } | null;
  scenes: AtlasScene[];
  sources: { id: string; url: string; title?: string; site?: string; type?: string }[];
}
export interface AtlasWorkDetail {
  dataVersion: string;
  franchiseKey: string;
  titleJa: string;
  titleEn?: string | null;
  titleZh?: AtlasTitles | null;
  malIds?: number[];
  bangumiIds?: number[];
  bgmIds?: number[];
  spots: AtlasSpot[];
}
export interface AtlasSpotsLite {
  dataVersion: string;
  columns: string[];
  rows: [string, string, string, number, number, 'c' | 's' | 'u', number[]][];
}
export interface AtlasCity {
  muniCd: string;
  pref: string;
  name: string;
  lat: number;
  lon: number;
  spots: number;
  works: number;
}
export interface AtlasCitiesIndex {
  dataVersion: string;
  cities: AtlasCity[];
}
export interface AtlasMeta {
  dataVersion: string;
  paths: { works: string; spotsLite: string; work: string; moved?: string; cities?: string };
}
export type PilgrimageWork = AtlasWorkDetail;
export interface PilgrimageSpot {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  precision?: string;
  confidence: AtlasSpot['confidence'];
  scenes: AtlasScene[];
  sources: AtlasSpot['sources'];
}
