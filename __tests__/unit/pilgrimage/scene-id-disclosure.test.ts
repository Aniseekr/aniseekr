import { beforeEach, describe, expect, it } from 'bun:test';

import {
  acceptSceneIdDisclosure,
  hasAcceptedSceneIdDisclosure,
} from '../../../libs/services/pilgrimage/scene-id/disclosure';
import { __resetAppStorageForTests } from '../../../libs/services/storage/app-storage';

describe('scene identification disclosure', () => {
  beforeEach(() => __resetAppStorageForTests());

  it('PILG-037 persists acknowledgement under the versioned disclosure key', () => {
    expect(hasAcceptedSceneIdDisclosure()).toBeFalse();
    acceptSceneIdDisclosure();
    expect(hasAcceptedSceneIdDisclosure()).toBeTrue();
  });
});
