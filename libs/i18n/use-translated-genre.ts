import { translateGenre, type TranslatedValue } from './data-translator';
import { useUiLanguage } from './ui-language';

/** `translateGenre` bound to the active UI language. */
export function useTranslatedGenre(genre: string): TranslatedValue {
  return translateGenre(genre, useUiLanguage());
}
