import { describe, expect, it } from 'bun:test';

import { FREE_FOLDER_ANIME_ID } from '../../../libs/services/pilgrimage/album-captures';
import type { PilgrimageAlbumEntry } from '../../../libs/services/pilgrimage/album-captures';
import {
  buildCaptureSessionShotFromRoute,
  resolvePreviewShots,
} from '../../../libs/services/pilgrimage/capture-preview-route';
import type { CaptureSessionShot } from '../../../libs/services/pilgrimage/capture-session';
import type { PilgrimageCapture } from '../../../libs/services/pilgrimage/captures';
import {
  buildCameraPreviewParams,
  buildJournalPreviewParams,
  buildPreviewCaptureRecord,
  isFiledUnder,
  previewReferenceFromParams,
  withoutTargetFields,
  type PreviewReference,
} from '../../../libs/services/pilgrimage/preview-capture';
import {
  buildImportedCompareParams,
  type CompareRouteParams,
} from '../../../libs/services/pilgrimage/reference-route';
import type { AnitabiBangumi, AnitabiPoint } from '../../../libs/services/pilgrimage/types';

function shot(overrides: Partial<CaptureSessionShot> = {}): CaptureSessionShot {
  return {
    id: 's1',
    uri: 'file:///shot.jpg',
    width: 4032,
    height: 3024,
    captureMode: 'single',
    source: 'manual',
    createdAt: 1_700_000_000_000,
    heading: 181,
    distanceMeters: 12.5,
    headingDeltaDeg: -4,
    tilt: 2,
    userLocation: { latitude: 35.1, longitude: 138.9 },
    ...overrides,
  };
}

const scene: CompareRouteParams = {
  spotId: 'pt-1',
  imageUrl: 'https://image.anitabi.cn/points/1.jpg',
  name: '沼津駅',
  ep: '3',
  animeId: '165553',
  animeTitle: 'ラブライブ！サンシャイン!!',
  themeColor: '#FF9F0A',
  spotLat: '35.1',
  spotLng: '138.86',
};

describe('camera → preview params', () => {
  it('PILG-073 an imported-reference session forwards referenceKind so the shot is filed free', () => {
    const imported = buildImportedCompareParams('file:///ref.jpg', {
      label: '匯入的參考圖',
      themeColor: '#FF9F0A',
      now: 9,
      nonce: 1,
    });
    const params = buildCameraPreviewParams(shot(), imported);
    expect(params.referenceKind).toBe('imported');
    expect(params.origin).toBe('camera');

    const record = buildPreviewCaptureRecord({
      shot: buildCaptureSessionShotFromRoute(params)!,
      reference: previewReferenceFromParams(params, { fallbackColor: '#000' }),
    });
    expect(record.bucket).toBe('free');
    expect(record.capture.referenceUri).toBe('file:///ref.jpg');
    expect(record.capture.spotId).toBe('ref-9-1');
  });

  it('PILG-073 the shot travels with its own shutter-time sensors', () => {
    const params = buildCameraPreviewParams(shot({ source: 'auto', note: '西口' }), scene);
    expect(params).toMatchObject({
      spotId: 'pt-1',
      shotUri: 'file:///shot.jpg',
      heading: '181',
      distanceMeters: '12.5',
      headingDeltaDeg: '-4',
      tilt: '2',
      shotSource: 'auto',
      note: '西口',
      userLat: '35.1',
      userLng: '138.9',
    });
    expect('referenceKind' in params).toBe(false);
  });
});

function point(overrides: Partial<AnitabiPoint> = {}): AnitabiPoint {
  return {
    id: 'pt-1',
    name: '沼津駅',
    image: 'https://image.anitabi.cn/points/1.jpg',
    ep: 3,
    s: 42,
    geo: [35.1, 138.86],
    ...overrides,
  };
}

function anime(overrides: Partial<AnitabiBangumi> = {}): AnitabiBangumi {
  return {
    id: 165553,
    title: 'ラブライブ！サンシャイン!!',
    cn: '',
    city: '沼津',
    cover: '',
    color: '#33AAFF',
    geo: [35.1, 138.86],
    zoom: 12,
    modified: 0,
    litePoints: [],
    pointsLength: 0,
    imagesLength: 0,
    ...overrides,
  };
}

const storedCapture: PilgrimageCapture = {
  spotId: 'pt-1',
  uri: 'file:///shot.jpg',
  capturedAt: 1_700_000_000_000,
  heading: 181,
  sensorSnapshot: { distanceMeters: 12.5, headingDeltaDeg: -4, tilt: 2, frameMatch: 0.7 },
  compositeUri: 'file:///composite.png',
  source: 'auto',
  note: '西口',
};

describe('journal → preview params', () => {
  it('PILG-074 a filed scene shot opens with its stored sensors and auto source', () => {
    const entry: PilgrimageAlbumEntry = {
      capture: storedCapture,
      spot: point(),
      anime: anime(),
      matchPercent: 70,
    };
    const params = buildJournalPreviewParams(entry, {
      importedLabel: '匯入的參考圖',
      fallbackColor: '#000',
    });
    expect(params).toMatchObject({
      origin: 'journal',
      spotId: 'pt-1',
      heading: '181',
      distanceMeters: '12.5',
      headingDeltaDeg: '-4',
      tilt: '2',
      shotSource: 'auto',
      note: '西口',
      spotLat: '35.1',
      spotLng: '138.86',
      themeColor: '#33AAFF',
    });
  });

  it('PILG-074 display fallbacks for title and episode are not sent to be persisted', () => {
    const params = buildJournalPreviewParams(
      {
        capture: { spotId: 'pt-9', uri: 'file:///x.jpg', capturedAt: 1 },
        spot: point({ id: 'pt-9', ep: 0 }),
        anime: anime({ id: 999_999_991, title: 'Bangumi #999999991' }),
        matchPercent: null,
      },
      { importedLabel: 'x', fallbackColor: '#000' }
    );
    expect(params.animeTitle).toBe('');
    expect(params.ep).toBe('');
  });

  it('PILG-074 a spot without geo sends no coordinates', () => {
    const params = buildJournalPreviewParams(
      { capture: storedCapture, spot: point({ geo: [0, 0] }), anime: anime(), matchPercent: null },
      { importedLabel: 'x', fallbackColor: '#000' }
    );
    expect('spotLat' in params).toBe(false);
  });

  it('PILG-074 a free shot opens alone, or against its imported reference', () => {
    const free = (referenceUri?: string): PilgrimageAlbumEntry => ({
      capture: {
        spotId: 'free-1',
        uri: 'file:///f.jpg',
        capturedAt: 1,
        ...(referenceUri ? { referenceUri } : {}),
      },
      spot: point({ id: 'free-1', image: referenceUri ?? '' }),
      anime: anime({ id: FREE_FOLDER_ANIME_ID }),
      matchPercent: null,
      isFree: true,
    });
    const ctx = { importedLabel: '匯入的參考圖', fallbackColor: '#000' };
    expect(buildJournalPreviewParams(free(), ctx)).toMatchObject({
      spotId: 'free-1',
      imageUrl: '',
      name: '',
      animeId: '',
    });
    expect(buildJournalPreviewParams(free('file:///ref.jpg'), ctx)).toMatchObject({
      imageUrl: 'file:///ref.jpg',
      name: '匯入的參考圖',
      referenceKind: 'imported',
    });
  });
});

describe('preview shots', () => {
  it('PILG-074 a leftover camera session is not the album of a Journal shot', () => {
    const leftover = [
      shot({ id: 'a', uri: 'file:///a.jpg' }),
      shot({ id: 'b', uri: 'file:///b.jpg' }),
    ];
    const journal = shot({ id: 'route', uri: 'file:///journal.jpg' });
    expect(resolvePreviewShots(leftover, journal, 'journal')).toEqual([journal]);
    // Even when the Journal shot is still in the leftover session.
    const inSession = shot({ id: 'r', uri: 'file:///b.jpg' });
    expect(resolvePreviewShots(leftover, inSession, 'journal')).toEqual([inSession]);
  });

  it('PILG-074 a camera preview is the session album, even after its opened shot is deleted', () => {
    const remaining = [
      shot({ id: 'b', uri: 'file:///b.jpg' }),
      shot({ id: 'a', uri: 'file:///a.jpg' }),
    ];
    const opened = shot({ id: 'route', uri: 'file:///c.jpg' });
    expect(resolvePreviewShots(remaining, opened, 'camera')).toBe(remaining);
    expect(resolvePreviewShots([], opened, 'camera')).toEqual([opened]);
    expect(resolvePreviewShots(remaining, null, null)).toBe(remaining);
  });

  it('PILG-074 a route shot keeps its id when the reference params change', () => {
    const base = { shotUri: 'file:///x.jpg', capturedAt: '5', note: 'n' };
    const a = buildCaptureSessionShotFromRoute({ ...base, spotId: 'pt-1' });
    const b = buildCaptureSessionShotFromRoute({ ...base, spotId: 'ref-2-2' });
    expect(a?.id).toBe(b?.id);
  });
});

const sceneReference: PreviewReference = {
  spotId: 'pt-1',
  imageUrl: 'https://image.anitabi.cn/points/1.jpg',
  referenceKind: null,
  sceneName: '沼津駅',
  animeId: 165553,
  animeTitle: 'Sunshine',
  themeColor: '#33AAFF',
  ep: 3,
  spotGeo: [35.1, 138.86],
};

describe('preview capture record', () => {
  it('PILG-075 a scene shot is filed under its spot with the scene metadata', () => {
    const { bucket, capture } = buildPreviewCaptureRecord({
      shot: shot(),
      reference: sceneReference,
      frame: { total: 0.8, valid: true, reason: null },
      compositeUri: 'file:///c.png',
      note: '  西口  ',
    });
    expect(bucket).toBe('spot');
    expect(capture).toEqual({
      spotId: 'pt-1',
      uri: 'file:///shot.jpg',
      capturedAt: 1_700_000_000_000,
      compositeUri: 'file:///c.png',
      heading: 181,
      sensorSnapshot: {
        distanceMeters: 12.5,
        headingDeltaDeg: -4,
        tilt: 2,
        frameMatch: 0.8,
        frameValid: true,
        frameReason: null,
      },
      userLocation: { latitude: 35.1, longitude: 138.9 },
      note: '西口',
      source: 'camera',
      animeId: 165553,
      animeTitle: 'Sunshine',
      animeColor: '#33AAFF',
      spotName: '沼津駅',
      spotImage: 'https://image.anitabi.cn/points/1.jpg',
      spotEp: 3,
      spotGeo: [35.1, 138.86],
    });
  });

  it('PILG-075 an untouched note is left out so the stored one survives; an emptied note clears', () => {
    const untouched = buildPreviewCaptureRecord({ shot: shot(), reference: sceneReference });
    expect('note' in untouched.capture).toBe(false);
    const cleared = buildPreviewCaptureRecord({
      shot: shot(),
      reference: sceneReference,
      note: ' ',
    });
    expect(cleared.capture.note).toBe('');
  });

  it('PILG-075 a lone shot has no comparison composite and lands in the free bucket', () => {
    const { bucket, capture } = buildPreviewCaptureRecord({
      shot: shot(),
      reference: { ...sceneReference, spotId: 'free-1', imageUrl: '', sceneName: null },
      compositeUri: 'file:///c.png',
    });
    expect(bucket).toBe('free');
    expect(capture.compositeUri).toBeUndefined();
    expect(capture.referenceUri).toBeUndefined();
    expect(capture.animeId).toBeUndefined();
  });

  it('PILG-075 other lenses keep the photo but not the frame match or composite', () => {
    const { capture } = buildPreviewCaptureRecord({
      shot: shot({ lensType: 'ultra-wide-angle' }),
      reference: sceneReference,
      frame: { total: 0.8, valid: true },
      compositeUri: 'file:///c.png',
    });
    expect(capture.compositeUri).toBeUndefined();
    expect(capture.sensorSnapshot && 'frameMatch' in capture.sensorSnapshot).toBe(false);
  });

  it('PILG-075 no finished analysis (pending or failed offline) writes no frame fields', () => {
    for (const frame of [null, { total: null, valid: false, reason: 'analysisFailed' as const }]) {
      const { capture } = buildPreviewCaptureRecord({
        shot: shot(),
        reference: sceneReference,
        frame,
      });
      expect(capture.sensorSnapshot).toEqual({
        distanceMeters: 12.5,
        headingDeltaDeg: -4,
        tilt: 2,
      });
    }
  });

  it('PILG-075 a record is filed under a reference only when writing it would not move it', () => {
    const filed = { spotId: 'pt-1', uri: 'file:///shot.jpg', capturedAt: 1 };
    expect(isFiledUnder(filed, sceneReference)).toBe(true);
    expect(isFiledUnder(filed, { ...sceneReference, spotId: 'pt-2' })).toBe(false);
    const imported: PreviewReference = {
      ...sceneReference,
      spotId: 'ref-1-1',
      imageUrl: 'file:///ref.jpg',
      referenceKind: 'imported',
    };
    expect(
      isFiledUnder({ ...filed, spotId: 'ref-1-1', referenceUri: 'file:///ref.jpg' }, imported)
    ).toBe(true);
    expect(isFiledUnder(filed, imported)).toBe(false);
  });

  it('PILG-075 a re-paired shot drops distance and heading offset to the old target', () => {
    const moved = withoutTargetFields(shot());
    expect(moved).toMatchObject({ distanceMeters: null, headingDeltaDeg: null, tilt: 2 });
    const { capture } = buildPreviewCaptureRecord({ shot: moved, reference: sceneReference });
    expect(capture.sensorSnapshot).toMatchObject({
      distanceMeters: null,
      headingDeltaDeg: null,
      tilt: 2,
    });
  });

  it('PILG-075 params parse into the same reference the record is filed against', () => {
    const reference = previewReferenceFromParams(
      { ...scene, name: '沼津駅', spotLat: '', spotLng: '' },
      { fallbackColor: '#000', resolveImageUrl: (url) => `${url}#full` }
    );
    expect(reference).toEqual({
      spotId: 'pt-1',
      imageUrl: 'https://image.anitabi.cn/points/1.jpg#full',
      referenceKind: null,
      sceneName: '沼津駅',
      animeId: 165553,
      animeTitle: 'ラブライブ！サンシャイン!!',
      themeColor: '#FF9F0A',
      ep: 3,
    });
  });
});
