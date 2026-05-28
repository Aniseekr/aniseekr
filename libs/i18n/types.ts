// Type helpers derived directly from the JSON catalog. Zero codegen, zero
// build step — TypeScript infers the catalog shape from `import en from
// './locales/en.json'` and we walk it with `Path<>` to build the
// `TranslationKey` union. Adding a key to `en.json` immediately makes
// `t('newKey')` type-safe everywhere.

import en from './locales/en.json';

export type EnglishCatalog = typeof en;

/** Strip helper `$comment` field so it doesn't show up in TranslationKey. */
type WithoutMeta<T> = T extends object
  ? { [K in keyof T as K extends `$${string}` ? never : K]: T[K] }
  : T;

type Primitive = string | number | boolean | null | undefined;

type Path<T, Prefix extends string = ''> = T extends Primitive
  ? Prefix extends ''
    ? never
    : Prefix
  : {
      [K in keyof WithoutMeta<T> & string]: Path<
        WithoutMeta<T>[K],
        Prefix extends '' ? K : `${Prefix}.${K}`
      >;
    }[keyof WithoutMeta<T> & string];

export type TranslationKey = Path<EnglishCatalog>;

/** Widens string literals in the source to plain `string` so locale files
 * may pick any wording (not forced to repeat the English text verbatim). */
export type DeepPartial<T> = T extends string
  ? string
  : T extends ReadonlyArray<infer _U>
    ? T
    : { [K in keyof T]?: DeepPartial<T[K]> };

export type LanguageId = 'en' | 'zh-Hant' | 'zh-Hans' | 'ja' | 'ko';
export type AppLanguagePreference = LanguageId | 'auto';

export interface LanguageMeta {
  id: LanguageId;
  /** Display name in that language (e.g. `English`, `繁體中文`). */
  nativeName: string;
  /** Display name in English (e.g. `Traditional Chinese`). */
  englishName: string;
  /** ISO-3166 country flag emoji used in the picker. */
  flag: string;
  /** When true, the engine derives missing keys from zh-Hant via OpenCC. */
  derivesFromTraditional?: boolean;
}

export type TranslationValues = Record<string, string | number>;
