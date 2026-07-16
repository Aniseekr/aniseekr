import { kvGet, kvSet } from '../../storage/app-storage';
import { SCENE_ID_DISCLOSURE_STORAGE_KEY } from '../../storage/keys';

const ACCEPTED_VALUE = 'accepted';

export function hasAcceptedSceneIdDisclosure(): boolean {
  return kvGet(SCENE_ID_DISCLOSURE_STORAGE_KEY) === ACCEPTED_VALUE;
}

export function acceptSceneIdDisclosure(): void {
  kvSet(SCENE_ID_DISCLOSURE_STORAGE_KEY, ACCEPTED_VALUE);
}
