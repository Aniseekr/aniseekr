import { describe, expect, it } from 'bun:test';

import {
  disposeSceneImageFiles,
  getSceneImageResize,
  SCENE_IMAGE_MAX_UPLOAD_WIDTH,
} from '../../../libs/services/pilgrimage/scene-id/scene-image-policy';

describe('scene image upload policy', () => {
  it('PILG-036 caps wide images without upscaling and deletes temporary files best-effort', () => {
    expect(getSceneImageResize(1920)).toEqual({
      width: SCENE_IMAGE_MAX_UPLOAD_WIDTH,
      height: null,
    });
    expect(getSceneImageResize(SCENE_IMAGE_MAX_UPLOAD_WIDTH)).toBeNull();
    expect(getSceneImageResize(320)).toBeNull();
    expect(getSceneImageResize(Number.NaN)).toBeNull();

    const deleted: string[] = [];
    disposeSceneImageFiles([
      { exists: true, delete: () => deleted.push('first') },
      { exists: false, delete: () => deleted.push('missing') },
      {
        exists: true,
        delete: () => {
          throw new Error('locked');
        },
      },
      { exists: true, delete: () => deleted.push('after-error') },
    ]);

    expect(deleted).toEqual(['first', 'after-error']);
  });
});
