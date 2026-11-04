import type { LanguageId } from '../../i18n/types';

export type PilgrimageWebMedium = 'work' | 'trip';

export function buildPilgrimageWebUrl(
  workKey: string,
  language: LanguageId,
  medium: PilgrimageWebMedium
): string {
  const localePrefix =
    language === 'zh-Hant'
      ? 'zh-tw/'
      : language === 'zh-Hans'
        ? 'zh-cn/'
        : language === 'ja'
          ? 'ja/'
          : language === 'ko'
            ? 'ko/'
            : '';
  return `https://aniseekr.moe/${localePrefix}works/${encodeURIComponent(workKey)}?utm_source=app&utm_medium=${medium}`;
}
