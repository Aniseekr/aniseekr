import { describe, expect, it } from 'bun:test';
import {
  buildAdditionalExif,
  type ExifMetadataInput,
} from '../../libs/services/pilgrimage/build-exif-metadata';

const FIXED_TS = Date.UTC(2026, 4, 15, 12, 34, 56); // 2026-05-15 12:34:56 UTC

function baseInput(overrides: Partial<ExifMetadataInput> = {}): ExifMetadataInput {
  return {
    spotId: 'spot-1',
    spotName: '修学院駅',
    capturedAt: FIXED_TS,
    ...overrides,
  };
}

describe('buildAdditionalExif — minimal input', () => {
  it('emits only identity + capture-time tags when no GPS/heading/anime data is present', () => {
    const exif = buildAdditionalExif({
      spotId: '',
      spotName: '',
      capturedAt: FIXED_TS,
    });

    expect(exif.Software).toBe('Aniseekr');
    expect(exif.Artist).toBe('Aniseekr Pilgrimage');
    expect(typeof exif.UserComment).toBe('string');
    expect(typeof exif.DateTimeOriginal).toBe('string');

    // No GPS / heading / description keys when sources are empty.
    expect('GPSLatitude' in exif).toBe(false);
    expect('GPSLatitudeRef' in exif).toBe(false);
    expect('GPSLongitude' in exif).toBe(false);
    expect('GPSLongitudeRef' in exif).toBe(false);
    expect('GPSAltitude' in exif).toBe(false);
    expect('GPSImgDirection' in exif).toBe(false);
    expect('GPSImgDirectionRef' in exif).toBe(false);
    expect('ImageDescription' in exif).toBe(false);
  });

  it('defaults capturedAt to Date.now() when omitted', () => {
    const before = Date.now();
    const exif = buildAdditionalExif({ spotId: '', spotName: '' });
    const after = Date.now();

    const parsed = JSON.parse(exif.UserComment);
    expect(typeof parsed.capturedAt).toBe('number');
    expect(parsed.capturedAt).toBeGreaterThanOrEqual(before);
    expect(parsed.capturedAt).toBeLessThanOrEqual(after);
  });
});

describe('buildAdditionalExif — full input', () => {
  it('emits all expected keys with correct refs', () => {
    const exif = buildAdditionalExif(
      baseInput({
        spotId: 'spot-42',
        spotName: '修学院駅',
        animeId: 'anime-1',
        animeTitle: 'K-On!',
        episode: '2',
        userLocation: { latitude: 35.0432, longitude: 135.7991, altitude: 90 },
        heading: 217.4,
        tilt: -3.2,
      })
    );

    expect(exif.GPSLatitude).toBeCloseTo(35.0432, 5);
    expect(exif.GPSLatitudeRef).toBe('N');
    expect(exif.GPSLongitude).toBeCloseTo(135.7991, 5);
    expect(exif.GPSLongitudeRef).toBe('E');
    expect(exif.GPSAltitude).toBe(90);
    expect(exif.GPSImgDirection).toBeCloseTo(217.4, 5);
    expect(exif.GPSImgDirectionRef).toBe('T');
    expect(exif.Software).toBe('Aniseekr');
    expect(exif.Artist).toBe('Aniseekr Pilgrimage');
    expect(exif.ImageDescription).toBe('修学院駅 — K-On! EP2');

    const parsed = JSON.parse(exif.UserComment);
    expect(parsed.spotId).toBe('spot-42');
    expect(parsed.spotName).toBe('修学院駅');
    expect(parsed.animeId).toBe('anime-1');
    expect(parsed.animeTitle).toBe('K-On!');
    expect(parsed.episode).toBe('2');
    expect(parsed.heading).toBeCloseTo(217.4, 5);
    expect(parsed.tilt).toBeCloseTo(-3.2, 5);
    expect(parsed.capturedAt).toBe(FIXED_TS);
  });
});

describe('buildAdditionalExif — GPS reference flipping', () => {
  it('sets GPSLatitudeRef to S for negative latitude', () => {
    const exif = buildAdditionalExif(
      baseInput({ userLocation: { latitude: -33.8688, longitude: 151.2093 } })
    );
    expect(exif.GPSLatitudeRef).toBe('S');
    expect(exif.GPSLatitude).toBeCloseTo(33.8688, 5);
    expect(exif.GPSLongitudeRef).toBe('E');
  });

  it('sets GPSLongitudeRef to W for negative longitude', () => {
    const exif = buildAdditionalExif(
      baseInput({ userLocation: { latitude: 40.7128, longitude: -74.006 } })
    );
    expect(exif.GPSLongitudeRef).toBe('W');
    expect(exif.GPSLongitude).toBeCloseTo(74.006, 5);
    expect(exif.GPSLatitudeRef).toBe('N');
  });

  it('omits GPSAltitude when altitude is null', () => {
    const exif = buildAdditionalExif(
      baseInput({ userLocation: { latitude: 0, longitude: 0, altitude: null } })
    );
    expect('GPSAltitude' in exif).toBe(false);
    expect(exif.GPSLatitude).toBe(0);
    expect(exif.GPSLatitudeRef).toBe('N');
  });

  it('omits GPSAltitude when altitude is undefined', () => {
    const exif = buildAdditionalExif(
      baseInput({ userLocation: { latitude: 1, longitude: 1 } })
    );
    expect('GPSAltitude' in exif).toBe(false);
  });

  it('omits all GPS keys when userLocation is null', () => {
    const exif = buildAdditionalExif(baseInput({ userLocation: null }));
    expect('GPSLatitude' in exif).toBe(false);
    expect('GPSLatitudeRef' in exif).toBe(false);
    expect('GPSLongitude' in exif).toBe(false);
    expect('GPSLongitudeRef' in exif).toBe(false);
    expect('GPSAltitude' in exif).toBe(false);
  });
});

describe('buildAdditionalExif — heading', () => {
  it('omits GPSImgDirection when heading is non-finite', () => {
    const exif = buildAdditionalExif(baseInput({ heading: Number.NaN }));
    expect('GPSImgDirection' in exif).toBe(false);
    expect('GPSImgDirectionRef' in exif).toBe(false);
  });

  it('omits GPSImgDirection when heading is null', () => {
    const exif = buildAdditionalExif(baseInput({ heading: null }));
    expect('GPSImgDirection' in exif).toBe(false);
    expect('GPSImgDirectionRef' in exif).toBe(false);
  });

  it('omits GPSImgDirection when heading is Infinity', () => {
    const exif = buildAdditionalExif(baseInput({ heading: Number.POSITIVE_INFINITY }));
    expect('GPSImgDirection' in exif).toBe(false);
  });

  it('includes GPSImgDirection with true-north ref when heading is finite (incl. 0)', () => {
    const exif = buildAdditionalExif(baseInput({ heading: 0 }));
    expect(exif.GPSImgDirection).toBe(0);
    expect(exif.GPSImgDirectionRef).toBe('T');
  });
});

describe('buildAdditionalExif — ImageDescription composition', () => {
  it('uses only spotName when no anime data is provided', () => {
    const exif = buildAdditionalExif(baseInput({ spotName: '修学院駅' }));
    expect(exif.ImageDescription).toBe('修学院駅');
  });

  it('appends anime title with em-dash separator', () => {
    const exif = buildAdditionalExif(
      baseInput({ spotName: '修学院駅', animeTitle: 'K-On!' })
    );
    expect(exif.ImageDescription).toBe('修学院駅 — K-On!');
  });

  it('appends EP segment after anime title', () => {
    const exif = buildAdditionalExif(
      baseInput({ spotName: '修学院駅', animeTitle: 'K-On!', episode: '2' })
    );
    expect(exif.ImageDescription).toBe('修学院駅 — K-On! EP2');
  });

  it('omits anime segment when only episode is provided', () => {
    const exif = buildAdditionalExif(baseInput({ spotName: '修学院駅', episode: '2' }));
    expect(exif.ImageDescription).toBe('修学院駅 EP2');
  });

  it('drops ImageDescription entirely when every text source is empty', () => {
    const exif = buildAdditionalExif({ spotId: '', spotName: '', capturedAt: FIXED_TS });
    expect('ImageDescription' in exif).toBe(false);
  });

  it('uses anime title alone when spotName is empty', () => {
    const exif = buildAdditionalExif(
      baseInput({ spotName: '', animeTitle: 'K-On!', episode: '2' })
    );
    expect(exif.ImageDescription).toBe('K-On! EP2');
  });
});

describe('buildAdditionalExif — UserComment payload', () => {
  it('omits keys whose source is missing or non-finite', () => {
    const exif = buildAdditionalExif({
      spotId: 'spot-1',
      spotName: 'X',
      heading: Number.NaN,
      tilt: undefined,
      capturedAt: FIXED_TS,
    });
    const parsed = JSON.parse(exif.UserComment);
    expect(parsed.spotId).toBe('spot-1');
    expect(parsed.spotName).toBe('X');
    expect('animeId' in parsed).toBe(false);
    expect('animeTitle' in parsed).toBe(false);
    expect('episode' in parsed).toBe(false);
    expect('heading' in parsed).toBe(false);
    expect('tilt' in parsed).toBe(false);
    expect(parsed.capturedAt).toBe(FIXED_TS);
  });
});

describe('buildAdditionalExif — DateTimeOriginal', () => {
  it('renders YYYY:MM:DD HH:MM:SS for the provided capturedAt', () => {
    // Use a local-time anchor so this passes regardless of TZ.
    const local = new Date(2026, 4, 15, 9, 7, 5).getTime();
    const exif = buildAdditionalExif({ spotId: '', spotName: '', capturedAt: local });
    expect(exif.DateTimeOriginal).toBe('2026:05:15 09:07:05');
  });
});
