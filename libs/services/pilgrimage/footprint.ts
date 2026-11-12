// Where the user has been, by prefecture and municipality, from spot stamps.
// A stamp counts only when its snapshot carries the spot's municipality code;
// the rest are reported as `unplaced` rather than guessed at.
import type { Stamp } from './stamp-details';

export interface FootprintPlace {
  muniCd: string;
  workKey: string;
  spots: number;
  onsite: number;
}

export interface FootprintPrefecture {
  /** JIS prefecture code, '01'–'47'. */
  code: string;
  spots: number;
  onsite: number;
  /** One row per municipality and work, most spots first. */
  places: FootprintPlace[];
}

export interface Footprint {
  /** Visited prefectures, most spots first. */
  prefectures: FootprintPrefecture[];
  cityCount: number;
  /** Stamps whose municipality is not known (yet). */
  unplaced: number;
}

/** The first two digits of a JIS municipality code are its prefecture. */
export function prefectureOf(muniCd: string | undefined): string | null {
  if (!muniCd || !/^\d{5}$/.test(muniCd)) return null;
  const code = muniCd.slice(0, 2);
  const n = Number(code);
  return n >= 1 && n <= 47 ? code : null;
}

export function buildFootprint(stamps: readonly Stamp[]): Footprint {
  const byPref = new Map<string, FootprintPrefecture>();
  const cities = new Set<string>();
  let unplaced = 0;
  for (const stamp of stamps) {
    const muniCd = stamp.meta?.muniCd;
    const code = prefectureOf(muniCd);
    if (!code || !muniCd || !stamp.meta) {
      unplaced += 1;
      continue;
    }
    cities.add(muniCd);
    let pref = byPref.get(code);
    if (!pref) {
      pref = { code, spots: 0, onsite: 0, places: [] };
      byPref.set(code, pref);
    }
    const workKey = stamp.meta.workKey;
    let place = pref.places.find((p) => p.muniCd === muniCd && p.workKey === workKey);
    if (!place) {
      place = { muniCd, workKey, spots: 0, onsite: 0 };
      pref.places.push(place);
    }
    const onsite = stamp.onsiteAt !== null ? 1 : 0;
    place.spots += 1;
    place.onsite += onsite;
    pref.spots += 1;
    pref.onsite += onsite;
  }
  const prefectures = [...byPref.values()].sort(
    (a, b) => b.spots - a.spots || a.code.localeCompare(b.code)
  );
  for (const pref of prefectures) {
    pref.places.sort(
      (a, b) =>
        b.spots - a.spots || a.muniCd.localeCompare(b.muniCd) || a.workKey.localeCompare(b.workKey)
    );
  }
  return { prefectures, cityCount: cities.size, unplaced };
}

/**
 * Japan as a tile grid: one square per prefecture, laid out roughly by
 * geography (x grows east, y grows south). Our own arrangement — no boundary
 * data involved. `short` is the two-character label that fits a tile.
 */
export const PREFECTURE_TILES: readonly {
  code: string;
  /** Japanese name, as written locally. */
  name: string;
  en: string;
  short: string;
  x: number;
  y: number;
}[] = [
  { code: '01', name: '北海道', en: 'Hokkaido', short: '北海', x: 13, y: 0 },
  { code: '02', name: '青森県', en: 'Aomori', short: '青森', x: 13, y: 1 },
  { code: '05', name: '秋田県', en: 'Akita', short: '秋田', x: 12, y: 2 },
  { code: '03', name: '岩手県', en: 'Iwate', short: '岩手', x: 13, y: 2 },
  { code: '06', name: '山形県', en: 'Yamagata', short: '山形', x: 12, y: 3 },
  { code: '04', name: '宮城県', en: 'Miyagi', short: '宮城', x: 13, y: 3 },
  { code: '17', name: '石川県', en: 'Ishikawa', short: '石川', x: 9, y: 4 },
  { code: '16', name: '富山県', en: 'Toyama', short: '富山', x: 10, y: 4 },
  { code: '15', name: '新潟県', en: 'Niigata', short: '新潟', x: 11, y: 4 },
  { code: '07', name: '福島県', en: 'Fukushima', short: '福島', x: 12, y: 4 },
  { code: '32', name: '島根県', en: 'Shimane', short: '島根', x: 4, y: 5 },
  { code: '31', name: '鳥取県', en: 'Tottori', short: '鳥取', x: 5, y: 5 },
  { code: '28', name: '兵庫県', en: 'Hyogo', short: '兵庫', x: 6, y: 5 },
  { code: '26', name: '京都府', en: 'Kyoto', short: '京都', x: 7, y: 5 },
  { code: '18', name: '福井県', en: 'Fukui', short: '福井', x: 8, y: 5 },
  { code: '21', name: '岐阜県', en: 'Gifu', short: '岐阜', x: 9, y: 5 },
  { code: '20', name: '長野県', en: 'Nagano', short: '長野', x: 10, y: 5 },
  { code: '10', name: '群馬県', en: 'Gunma', short: '群馬', x: 11, y: 5 },
  { code: '09', name: '栃木県', en: 'Tochigi', short: '栃木', x: 12, y: 5 },
  { code: '08', name: '茨城県', en: 'Ibaraki', short: '茨城', x: 13, y: 5 },
  { code: '42', name: '長崎県', en: 'Nagasaki', short: '長崎', x: 0, y: 6 },
  { code: '41', name: '佐賀県', en: 'Saga', short: '佐賀', x: 1, y: 6 },
  { code: '40', name: '福岡県', en: 'Fukuoka', short: '福岡', x: 2, y: 6 },
  { code: '35', name: '山口県', en: 'Yamaguchi', short: '山口', x: 3, y: 6 },
  { code: '34', name: '広島県', en: 'Hiroshima', short: '広島', x: 4, y: 6 },
  { code: '33', name: '岡山県', en: 'Okayama', short: '岡山', x: 5, y: 6 },
  { code: '27', name: '大阪府', en: 'Osaka', short: '大阪', x: 7, y: 6 },
  { code: '25', name: '滋賀県', en: 'Shiga', short: '滋賀', x: 8, y: 6 },
  { code: '23', name: '愛知県', en: 'Aichi', short: '愛知', x: 9, y: 6 },
  { code: '19', name: '山梨県', en: 'Yamanashi', short: '山梨', x: 10, y: 6 },
  { code: '11', name: '埼玉県', en: 'Saitama', short: '埼玉', x: 11, y: 6 },
  { code: '13', name: '東京都', en: 'Tokyo', short: '東京', x: 12, y: 6 },
  { code: '12', name: '千葉県', en: 'Chiba', short: '千葉', x: 13, y: 6 },
  { code: '43', name: '熊本県', en: 'Kumamoto', short: '熊本', x: 1, y: 7 },
  { code: '44', name: '大分県', en: 'Oita', short: '大分', x: 2, y: 7 },
  { code: '38', name: '愛媛県', en: 'Ehime', short: '愛媛', x: 4, y: 7 },
  { code: '37', name: '香川県', en: 'Kagawa', short: '香川', x: 5, y: 7 },
  { code: '30', name: '和歌山県', en: 'Wakayama', short: '和歌', x: 7, y: 7 },
  { code: '29', name: '奈良県', en: 'Nara', short: '奈良', x: 8, y: 7 },
  { code: '24', name: '三重県', en: 'Mie', short: '三重', x: 9, y: 7 },
  { code: '22', name: '静岡県', en: 'Shizuoka', short: '静岡', x: 10, y: 7 },
  { code: '14', name: '神奈川県', en: 'Kanagawa', short: '神奈', x: 12, y: 7 },
  { code: '46', name: '鹿児島県', en: 'Kagoshima', short: '鹿児', x: 1, y: 8 },
  { code: '45', name: '宮崎県', en: 'Miyazaki', short: '宮崎', x: 2, y: 8 },
  { code: '39', name: '高知県', en: 'Kochi', short: '高知', x: 4, y: 8 },
  { code: '36', name: '徳島県', en: 'Tokushima', short: '徳島', x: 5, y: 8 },
  { code: '47', name: '沖縄県', en: 'Okinawa', short: '沖縄', x: 0, y: 9 },
];

export const PREFECTURE_GRID = { columns: 14, rows: 10 } as const;
