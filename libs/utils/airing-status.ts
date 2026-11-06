import type { useT } from '../i18n';
import type { TranslationKey } from '../i18n/types';

// AniList MediaStatus enum → UI copy. Any other source's value is shown as-is.
const AIRING_STATUS_KEYS: Record<string, TranslationKey> = {
  FINISHED: 'anime.detail.airingStatus.finished',
  RELEASING: 'anime.detail.airingStatus.releasing',
  NOT_YET_RELEASED: 'anime.detail.airingStatus.notYetReleased',
  CANCELLED: 'anime.detail.airingStatus.cancelled',
  HIATUS: 'anime.detail.airingStatus.hiatus',
};

export function airingStatusLabel(status: string, t: ReturnType<typeof useT>): string {
  const key = AIRING_STATUS_KEYS[status];
  return key ? t(key) : status;
}
