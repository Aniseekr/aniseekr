import { describe, expect, it } from 'bun:test';

import {
  decodeAnitabiStaticCatalog,
  decodeAnitabiStaticPage,
  toAnitabiIndexFile,
} from '../../../libs/services/pilgrimage/anitabi-static-data';

const MODIFIED = 1_784_017_364_302;
const catalogPayload = [
  [
    [
      7157,
      '缘之空',
      'Yosuga no Sora',
      'ヨスガノソラ',
      '足利市',
      '#1c398e',
      '/images/bangumi/7157.jpg',
      6.5,
      '游戏',
      36.364616,
      139.494498,
      12.1,
      ['point-a', 36.361787, 139.49489, 5, 'folder-a', 36.362, 139.495, 2],
    ],
  ],
  250,
  MODIFIED,
];

const pagePayload = [
  [
    7157,
    [],
    [
      [
        'point-a',
        '樺崎八幡宮',
        '桦崎八幡宫',
        0,
        0,
        12,
        '/images/points/7157/point-a.jpg',
        'folder-a',
        3,
        120,
        '',
        'Google Maps',
        'https://maps.example/point-a',
        0,
        5,
      ],
      [
        'folder-a',
        '足利市駅',
        '足利市站',
        1,
        0,
        0,
        '/images/points/7157/folder-a.jpg',
        0,
        null,
        '',
        '',
        0,
        0,
        0,
        2,
      ],
    ],
    MODIFIED + 1,
  ],
];

describe('Anitabi official static data', () => {
  it('decodes the official catalog into a searchable complete index', () => {
    const catalog = decodeAnitabiStaticCatalog(catalogPayload);
    const index = toAnitabiIndexFile(catalog);

    expect(catalog.pageSize).toBe(250);
    expect(index).toMatchObject({
      generatedAt: MODIFIED,
      source: 'https://www.anitabi.cn/d/g.json',
      fallbackUsed: false,
    });
    expect(index.entries[0]).toMatchObject({
      id: 7157,
      title: 'ヨスガノソラ',
      cn: '缘之空',
      titleEnglish: 'Yosuga no Sora',
      city: '足利市',
      lat: 36.364616,
      lng: 139.494498,
      pointsLength: 2,
      builtAt: MODIFIED,
    });
  });

  it('joins compact point metadata with coordinates from the catalog', () => {
    const catalog = decodeAnitabiStaticCatalog(catalogPayload);
    const decoded = decodeAnitabiStaticPage(catalog, pagePayload, 7157);

    expect(decoded.page).toBe(0);
    expect(decoded.anime).toMatchObject({
      id: 7157,
      title: 'ヨスガノソラ',
      pointsLength: 2,
      imagesLength: 2,
      modified: MODIFIED + 1,
    });
    expect(decoded.points[0]).toMatchObject({
      id: 'point-a',
      geo: [36.361787, 139.49489],
      fid: 'folder-a',
      ep: 3,
      s: 120,
      origin: 'Google Maps',
      originURL: 'https://maps.example/point-a',
    });
    expect(decoded.points[1]).toMatchObject({
      id: 'folder-a',
      geo: [36.362, 139.495],
      isFolder: true,
    });
  });
});
