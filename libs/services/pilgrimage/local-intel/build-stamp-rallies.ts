import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import data from './local-intel.data.json';
import type { LocalIntelEvent, LocalIntelFile, LocalizedText, StampSpot } from './types';

type Geo = [number, number];

interface SourceSpot {
  name: LocalizedText;
  address: string;
  sourceUrl?: string;
}

interface RallySource {
  id: string;
  bangumiIds: number[];
  name: LocalizedText;
  description: LocalizedText;
  schedule: LocalIntelEvent['schedule'];
  sourceUrl: string;
  officialUrl?: string;
  spots: SourceSpot[];
}

interface GeocodeAudit {
  rallyId: string;
  spotName: string;
  address: string;
  prefecture: string | null;
  sourceUrl: string;
  geo: Geo | null;
  provider: 'gsi' | 'nominatim' | null;
  status:
    | 'ok'
    | 'blocked_network'
    | 'no_result'
    | 'prefecture_mismatch'
    | 'outside_japan'
    | 'ambiguous';
  matchedTitle?: string;
  error?: string;
}

const VERIFIED_AT = '2026-07-18';
const AUDIT_PATH = 'libs/services/pilgrimage/local-intel/stamp-spots.geocode-audit.json';
const DATA_PATH = 'libs/services/pilgrimage/local-intel/local-intel.data.json';
const SOURCE_ALL_YURU = 'https://yurumeguristamp.com/spot/';
const SOURCE_OARAI = 'https://www.oarai-info.jp/essay/postid_4868/';
const SOURCE_LL_JR = 'https://recommend.jr-central.co.jp/oshi-tabi/lovelive_sunshine/stamprally/';
const SOURCE_YOHANE = 'https://recommend.jr-central.co.jp/oshi-tabi/yohane/';
const SOURCE_JUJUTSU = 'https://recommend.jr-central.co.jp/oshi-tabi/jujutanbo03/nagoya.html';
const SOURCE_WATAKON = 'https://visit-chiyoda.tokyo/sakura/watakon/';
const SOURCE_OARAI_SEASIDE = 'https://www.oarai-info.jp/spot/postid_3126/';
const SOURCE_OARAI_GUP_GALLERY = 'https://www.oarai-info.jp/spot/postid_3157/';
const SOURCE_OARAI_MARINE_TOWER = 'https://www.oarai-info.jp/spot/postid_3127/';
const SOURCE_OARAI_HOTEL = 'https://www.oarai-info.jp/spot/postid_2896/';
const SOURCE_OARAI_AQUAWORLD = 'https://www.oarai-info.jp/spot/postid_3105/';
const SOURCE_OARAI_SHRINE = 'https://www.oarai-info.jp/spot/postid_2917/';
const SOURCE_OARAI_UMIMACHI = 'https://www.oarai-info.jp/spot/postid_3158/';
const SOURCE_KENSHIN_OARAI = 'https://www.kenshinbank.co.jp/area/kenou/index.html';

const RALLIES: RallySource[] = [
  {
    id: 'yuru-meguri-stamp',
    bangumiIds: [207195, 262897, 405785],
    name: {
      ja: 'ゆるキャン△／ゆる巡りスタンプ',
      en: 'Yuru Camp Yurumeguri Stamp Rally',
      zhHant: '搖曳露營△ ゆる巡り集章',
    },
    description: {
      ja: '『ゆるキャン△』ゆかりの山梨・静岡の施設を巡る公式スタンプ企画。',
      en: 'An official Yuru Camp stamp program across related facilities in Yamanashi and Shizuoka.',
      zhHant: '巡遊《搖曳露營△》相關山梨、靜岡設施的官方集章企劃。',
    },
    schedule: { kind: 'ongoing' },
    sourceUrl: SOURCE_ALL_YURU,
    officialUrl: SOURCE_ALL_YURU,
    spots: [
      ['身延山ロープウェイ', '山梨県南巨摩郡身延町身延字上の山4226-2'],
      ['浩庵キャンプ場', '山梨県南巨摩郡身延町中ノ倉2926'],
      ['笛吹川フルーツ公園', '山梨県山梨市江曽原1488番地'],
      ['富士山レーダードーム館', '山梨県富士吉田市新屋3-7-2'],
      ['道の駅 富士吉田', '山梨県富士吉田市新屋3-7-3'],
      ['常幸院', '山梨県南巨摩郡身延町常葉439'],
      ['川窪書店', '山梨県南巨摩郡身延町下山1837-4'],
      ['武州屋', '山梨県南巨摩郡身延町身延3850-1'],
      ['道の駅 しもべ', '山梨県南巨摩郡身延町古関4231'],
      ['セルバ みのぶ店', '山梨県南巨摩郡身延町飯富2309-200'],
      ['三沢屋石油', '山梨県南巨摩郡身延町常葉3264'],
      ['山梨水晶本店', '山梨県南巨摩郡身延町角打3124'],
      ['ニュー梅月', '山梨県南巨摩郡身延町常葉7023'],
      ['YAMANASHI BUNKA KAIKAN 1966 (YBS山梨放送)', '山梨県甲府市北口2-6-10 山日YBS本社2F'],
      ['山梨スズキ販売(株) スズキアリーナ甲府東', '山梨県甲府市和戸町166'],
      ['栄昇堂', '山梨県南巨摩郡身延町角打3024'],
      ['園林', '山梨県南巨摩郡身延町身延3722'],
      ['道の駅 とみざわ', '山梨県南巨摩郡南部町福士28507番地の1'],
      ['Black Smith Outdoorfield', '山梨県南巨摩郡南部町十島1111'],
      ['天竜浜名湖鉄道', '静岡県浜松市天竜区二俣町阿蔵114-2'],
      ['大井川鐵道', '静岡県島田市金谷東2丁目1844-1'],
      ['渚園キャンプ場', '静岡県浜松市中央区舞阪町弁天島5005-1'],
      ['南部町営 奥山温泉', '山梨県南巨摩郡南部町福士26842番地'],
      ['天城わさびの里', '静岡県伊豆市湯ヶ島892-6 道の駅「天城越え」内'],
      ['道の駅 くるら戸田', '静岡県沼津市戸田1294-3'],
      ['道の駅 開国下田みなと', '静岡県下田市外ヶ岡1-1'],
    ].map(([ja, address]) => ({ name: { ja }, address })),
  },
  {
    id: 'oarai-gup-mini-event-stamp',
    bangumiIds: [40310, 72266],
    name: {
      ja: '大洗ガルパン ミニイベント スタンプラリー',
      en: 'Oarai Girls und Panzer Mini Event Stamp Rally',
      zhHant: '大洗少女與戰車迷你活動集章',
    },
    description: {
      ja: '大洗町観光協会が案内する『ガールズ&パンツァー』8か所中6か所を巡るスタンプラリー。',
      en: 'An Oarai Tourism Association Girls und Panzer rally asking visitors to stamp 6 of 8 locations.',
      zhHant: '大洗觀光協會介紹的《少女與戰車》8 處中集滿 6 處的集章活動。',
    },
    schedule: { kind: 'ongoing', since: '2014-08-08' },
    sourceUrl: SOURCE_OARAI,
    officialUrl: SOURCE_OARAI,
    spots: [
      ['大洗シーサイドステーション', '茨城県東茨城郡大洗町港中央11-2', SOURCE_OARAI_SEASIDE],
      [
        '大洗ガルパンギャラリー',
        '茨城県東茨城郡大洗町港中央11-2 大洗シーサイドステーション2F',
        SOURCE_OARAI_GUP_GALLERY,
      ],
      ['大洗マリンタワー', '茨城県東茨城郡大洗町港中央10', SOURCE_OARAI_MARINE_TOWER],
      ['茨城県信用組合大洗支店', '茨城県東茨城郡大洗町磯浜町641-2', SOURCE_KENSHIN_OARAI],
      ['大洗ホテル', '茨城県東茨城郡大洗町磯浜町6881', SOURCE_OARAI_HOTEL],
      ['アクアワールド大洗', '茨城県東茨城郡大洗町磯浜町8252-3', SOURCE_OARAI_AQUAWORLD],
      ['大洗磯前神社', '茨城県東茨城郡大洗町磯浜町6890', SOURCE_OARAI_SHRINE],
      ['大洗駅（うみまちテラス）', '茨城県東茨城郡大洗町桜道301', SOURCE_OARAI_UMIMACHI],
    ].map(([ja, address, sourceUrl]) => ({ name: { ja }, address, sourceUrl })),
  },
  {
    id: 'll-sunshine-jr-central-stamp',
    bangumiIds: [165553, 210272, 234295],
    name: {
      ja: 'JR東海オリジナル ラブライブ！サンシャイン!! スタンプラリー',
      en: 'JR Central Love Live! Sunshine!! Original Stamp Rally',
      zhHant: 'JR東海 Love Live! Sunshine!! 原創集章',
    },
    description: {
      ja: '沼津の街で9つのJR東海オリジナル『ラブライブ！サンシャイン!!』スタンプを集める企画。',
      en: 'A Numazu walking campaign collecting nine JR Central original Love Live! Sunshine!! stamps.',
      zhHant: '在沼津市區收集 9 個 JR 東海原創《Love Live! Sunshine!!》印章的活動。',
    },
    schedule: { kind: 'ongoing' },
    sourceUrl: SOURCE_LL_JR,
    officialUrl: SOURCE_LL_JR,
    spots: [
      ['沼津観光案内所', '静岡県沼津市大手町1-1-1 アントレ2階'],
      ['シネマサンシャイン沼津', '静岡県沼津市大手町1-1-5 BiVi沼津4F'],
      ['プラサヴェルデ', '静岡県沼津市大手町1-1-4'],
      ['ゲーマーズ沼津店', '静岡県沼津市添地町72 青秀ビル1階'],
      ['沼津リバーサイドホテル', '静岡県沼津市上土町100-1'],
      ['沼津港大型展望水門 びゅうお', '静岡県沼津市本字千本1905-27'],
      ['沼津御用邸記念公園', '静岡県沼津市下香貫島郷2802-1'],
      ['あわしまマリンパーク', '静岡県沼津市内浦重寺186'],
      ['三の浦総合案内所', '静岡県沼津市内浦長浜83-124'],
    ].map(([ja, address]) => ({ name: { ja }, address })),
  },
  {
    id: 'yohane-jr-central-numazu-stamp',
    bangumiIds: [165553, 210272],
    name: {
      ja: '幻日のヨハネ 沼津周遊スタンプラリー',
      en: 'Yohane the Parhelion Numazu Stamp Rally',
      zhHant: '幻日夜羽 沼津周遊集章',
    },
    description: {
      ja: 'JR東海と『幻日のヨハネ』の期間限定コラボとして実施された沼津10か所のスタンプラリー。',
      en: 'A JR Central × Yohane the Parhelion limited-time collaboration stamp rally across 10 Numazu spots.',
      zhHant: 'JR東海與《幻日夜羽》期間限定合作的沼津 10 處集章活動。',
    },
    schedule: { kind: 'fixed', startsAt: '2023-11-03', endsAt: '2023-12-25' },
    sourceUrl: SOURCE_YOHANE,
    officialUrl: SOURCE_YOHANE,
    spots: [
      ['沼津駅北口（改札外）', '静岡県沼津市大手町1丁目1'],
      ['沼津観光案内所', '静岡県沼津市大手町1丁目1-1 沼津駅ビルアントレ2階'],
      ['シネマサンシャイン沼津', '静岡県沼津市大手町1丁目1-5 BiVi4F'],
      ['プラサヴェルデ', '静岡県沼津市大手町1丁目1-4'],
      ['ゲーマーズ沼津店', '静岡県沼津市添地町72 青秀ビル1階'],
      ['沼津リバーサイドホテル', '静岡県沼津市上土町100-1'],
      ['沼津港大型展望水門「びゅうお」', '静岡県沼津市千本1905-27'],
      ['沼津御用邸記念公園', '静岡県沼津市下香貫島郷2802-1'],
      ['あわしまマリンパーク', '静岡県沼津市内浦重寺186'],
      ['三の浦総合案内所', '静岡県沼津市内浦長浜83-124'],
    ].map(([ja, address]) => ({ name: { ja }, address })),
  },
  {
    id: 'jujutsu-jr-central-nagoya-stamp',
    bangumiIds: [238887, 369304],
    name: {
      ja: 'JR東海×呪術廻戦 じゅじゅ探訪 in 名古屋 デジタルスタンプラリー',
      en: 'JR Central × Jujutsu Kaisen Jujutanbo in Nagoya Stamp Rally',
      zhHant: 'JR東海×咒術迴戰 名古屋咒咒探訪數位集章',
    },
    description: {
      ja: 'JR東海「推し旅」の『呪術廻戦』名古屋市内デジタルスタンプラリー。',
      en: 'A JR Central Oshi-tabi Jujutsu Kaisen digital stamp rally around Nagoya.',
      zhHant: 'JR東海「推し旅」《咒術迴戰》名古屋市內數位集章活動。',
    },
    schedule: { kind: 'annual', typicalMonth: 5, confirmed: [] },
    sourceUrl: SOURCE_JUJUTSU,
    officialUrl: SOURCE_JUJUTSU,
    spots: [
      ['名古屋駅', '愛知県名古屋市中村区名駅一丁目1番4号'],
      ['名古屋城', '愛知県名古屋市中区本丸1番1号'],
      ['金シャチ横丁 義直ゾーン', '愛知県名古屋市中区三の丸1丁目2番3号'],
      ['名城公園', '愛知県名古屋市北区名城1丁目2-25'],
      ['上野天満宮', '愛知県名古屋市千種区赤坂町4-89'],
      ['中部電力ミライタワー', '愛知県名古屋市中区錦三丁目6番15号先'],
    ].map(([ja, address]) => ({ name: { ja }, address })),
  },
  {
    id: 'watakon-chiyoda-sakura-stamp-2026',
    bangumiIds: [377125, 551304],
    name: {
      ja: '千代田のさくらまつり×わたしの幸せな結婚 スタンプラリー',
      en: 'Chiyoda Sakura Festival × My Happy Marriage Stamp Rally',
      zhHant: '千代田櫻花祭×我的幸福婚約集章',
    },
    description: {
      ja: '千代田区観光協会主催、千代田区内5か所とゴールを巡る『わたしの幸せな結婚』コラボスタンプラリー。',
      en: 'A Chiyoda Tourism Association My Happy Marriage collaboration rally across five Chiyoda stamp points plus the goal.',
      zhHant: '千代田區觀光協會主辦，巡遊區內 5 個章點與終點的《我的幸福婚約》合作集章活動。',
    },
    schedule: { kind: 'fixed', startsAt: '2026-03-11', endsAt: '2026-04-22' },
    sourceUrl: SOURCE_WATAKON,
    officialUrl: SOURCE_WATAKON,
    spots: [
      ['飯田橋サクラテラス', '東京都千代田区富士見2-10-2'],
      ['エキュートエディション飯田橋', '東京都千代田区飯田橋4-17-27'],
      ['東京大神宮', '東京都千代田区富士見2-4-1'],
      ['九段会館テラス', '東京都千代田区九段南1-6-5'],
      ['国立公文書館', '東京都千代田区北の丸公園3-2'],
      ['千代田区観光案内所', '東京都千代田区九段南1-6-17'],
    ].map(([ja, address]) => ({ name: { ja }, address })),
  },
];

const PREFECTURES = [
  '北海道',
  '青森県',
  '岩手県',
  '宮城県',
  '秋田県',
  '山形県',
  '福島県',
  '茨城県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '富山県',
  '石川県',
  '福井県',
  '山梨県',
  '長野県',
  '岐阜県',
  '静岡県',
  '愛知県',
  '三重県',
  '滋賀県',
  '京都府',
  '大阪府',
  '兵庫県',
  '奈良県',
  '和歌山県',
  '鳥取県',
  '島根県',
  '岡山県',
  '広島県',
  '山口県',
  '徳島県',
  '香川県',
  '愛媛県',
  '高知県',
  '福岡県',
  '佐賀県',
  '長崎県',
  '熊本県',
  '大分県',
  '宮崎県',
  '鹿児島県',
  '沖縄県',
];

function prefectureOf(address: string): string | null {
  return PREFECTURES.find((prefecture) => address.startsWith(prefecture)) ?? null;
}

function inJapan([lat, lng]: Geo): boolean {
  return lat >= 24 && lat <= 46 && lng >= 122 && lng <= 146;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'aniseekr-local-intel-geocoder/1.0 (rule-8 audit)',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function auditResult(
  rallyId: string,
  spot: SourceSpot,
  provider: GeocodeAudit['provider'],
  raw: unknown
): GeocodeAudit {
  const prefecture = prefectureOf(spot.address);
  const result = Array.isArray(raw) ? raw[0] : null;
  if (!result) return baseAudit(rallyId, spot, 'no_result');

  const feature = result as {
    geometry?: { coordinates?: unknown };
    properties?: { title?: unknown };
    display_name?: unknown;
    lat?: unknown;
    lon?: unknown;
  };
  const title =
    typeof feature.properties?.title === 'string'
      ? feature.properties.title
      : typeof feature.display_name === 'string'
        ? feature.display_name
        : '';
  if (prefecture && title && !title.includes(prefecture)) {
    return { ...baseAudit(rallyId, spot, 'prefecture_mismatch'), provider, matchedTitle: title };
  }

  const coords = feature.geometry?.coordinates;
  let geo: Geo | null = null;
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    geo = [coords[1], coords[0]];
  } else if (typeof feature.lat === 'string' && typeof feature.lon === 'string') {
    geo = [Number(feature.lat), Number(feature.lon)];
  }
  if (!geo) return { ...baseAudit(rallyId, spot, 'no_result'), provider, matchedTitle: title };
  if (!inJapan(geo))
    return { ...baseAudit(rallyId, spot, 'outside_japan'), provider, matchedTitle: title };
  return { ...baseAudit(rallyId, spot, 'ok'), provider, geo, matchedTitle: title };
}

function baseAudit(
  rallyId: string,
  spot: SourceSpot,
  status: GeocodeAudit['status'],
  error?: string
): GeocodeAudit {
  return {
    rallyId,
    spotName: spot.name.ja,
    address: spot.address,
    prefecture: prefectureOf(spot.address),
    sourceUrl: spot.sourceUrl ?? sourceUrlForRally(rallyId),
    geo: null,
    provider: null,
    status,
    error,
  };
}

function sourceUrlForRally(rallyId: string): string {
  const source = RALLIES.find((rally) => rally.id === rallyId);
  if (!source) throw new Error(`unknown rally ${rallyId}`);
  return source.sourceUrl;
}

async function geocodeSpot(rallyId: string, spot: SourceSpot): Promise<GeocodeAudit> {
  const q = encodeURIComponent(spot.address);
  try {
    const gsi = await fetchJson(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${q}`);
    const audit = auditResult(rallyId, spot, 'gsi', gsi);
    if (audit.status === 'ok') return audit;
  } catch (error) {
    return baseAudit(
      rallyId,
      spot,
      'blocked_network',
      error instanceof Error ? error.message : String(error)
    );
  }

  await sleep(1000);
  try {
    const nominatim = await fetchJson(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&countrycodes=jp`
    );
    return auditResult(rallyId, spot, 'nominatim', nominatim);
  } catch (error) {
    return baseAudit(
      rallyId,
      spot,
      'blocked_network',
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function build(): Promise<void> {
  const audits: GeocodeAudit[] = [];
  const events: LocalIntelEvent[] = [];

  for (const rally of RALLIES) {
    const stampSpots: StampSpot[] = [];
    for (const spot of rally.spots) {
      const audit = await geocodeSpot(rally.id, spot);
      audits.push(audit);
      stampSpots.push({
        name: spot.name,
        address: spot.address,
        geo: audit.geo,
        sourceUrl: spot.sourceUrl ?? rally.sourceUrl,
      });
    }
    events.push({
      kind: 'event',
      id: rally.id,
      bangumiIds: rally.bangumiIds,
      category: 'stamp_rally',
      name: rally.name,
      description: rally.description,
      geo: null,
      schedule: rally.schedule,
      stampSpots,
      sourceUrl: rally.sourceUrl,
      officialUrl: rally.officialUrl,
      verifiedAt: VERIFIED_AT,
    });
  }

  const current = data as LocalIntelFile;
  const eventIds = new Set(events.map((event) => event.id));
  const entries = [...current.entries.filter((entry) => !eventIds.has(entry.id)), ...events];
  const next: LocalIntelFile = {
    ...current,
    generatedAt: Date.UTC(2026, 6, 18, 0, 0, 0),
    count: entries.length,
    entries,
  };

  writeFileSync(AUDIT_PATH, `${JSON.stringify({ generatedAt: VERIFIED_AT, audits }, null, 2)}\n`);
  writeFileSync(DATA_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
