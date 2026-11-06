// Regression: since Atlas replaced anitabi, spots have no scene image, so a shot
// taken from a spot card reached the preview with imageUrl '' and was filed in
// the free bucket ("去過的場景 0"). The camera's targetSpotId must decide.
import { describe, expect, it } from 'bun:test';

import {
  buildPreviewCaptureRecord,
  previewReferenceFromParams,
} from '../../../libs/services/pilgrimage/preview-capture';
import type { CaptureSessionShot } from '../../../libs/services/pilgrimage/capture-session';

const shot: CaptureSessionShot = {
  id: 's1',
  uri: 'file:///shot.jpg',
  width: 3000,
  height: 4000,
  captureMode: 'single',
  source: 'manual',
  createdAt: 1_700_000_000_000,
  heading: null,
  distanceMeters: null,
  headingDeltaDeg: null,
  tilt: null,
  userLocation: null,
};

function bucketFor(params: Record<string, string>) {
  const reference = previewReferenceFromParams(params, { fallbackColor: '#000000' });
  return buildPreviewCaptureRecord({ shot, reference });
}

describe('preview capture filing', () => {
  it('files a shot from a spot card under that spot without a scene image', () => {
    const record = bucketFor({
      spotId: 'atlas-1',
      targetSpotId: 'atlas-1',
      imageUrl: '',
      name: '加茂荘花鳥園',
      ep: '4',
    });
    expect(record.bucket).toBe('spot');
    expect(record.capture.spotId).toBe('atlas-1');
    expect(record.capture.spotName).toBe('加茂荘花鳥園');
  });

  it('keeps a shot with no spot and no reference in the free bucket', () => {
    expect(bucketFor({ spotId: 'free-1', imageUrl: '' }).bucket).toBe('free');
  });
});
