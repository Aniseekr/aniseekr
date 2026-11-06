import type { ReactNode } from 'react';
import type { LanguageId } from './types';

// Languages whose UI chrome is set in ideographs / kana / hangul. They have no
// letter case, so Latin-style uppercase tracking just spaces characters apart.
const CJK_LANGUAGES: ReadonlySet<LanguageId> = new Set(['zh-Hant', 'zh-Hans', 'ja', 'ko']);

// Kana, CJK ideographs (+ext A, compatibility), hangul, halfwidth katakana.
const CJK_CHAR = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿ｦ-ﾟ]/;

export function isCjkLanguage(language: LanguageId): boolean {
  return CJK_LANGUAGES.has(language);
}

export function containsCjk(text: string): boolean {
  return CJK_CHAR.test(text);
}

/** Letter-spacing for an uppercase caption label in the given UI language. */
export function capsTracking(language: LanguageId, tracking: number): number {
  return isCjkLanguage(language) ? 0 : tracking;
}

function plainText(children: ReactNode): string | null {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) {
    let out = '';
    for (const child of children) {
      if (child === null || child === undefined || typeof child === 'boolean') continue;
      const part = plainText(child as ReactNode);
      if (part === null) return null;
      out += part;
    }
    return out;
  }
  return null;
}

/**
 * Whether caps tracking must be dropped for this label. Decided by the text
 * itself when it is plain text — a fixed English "PRO" keeps its tracking in a
 * Chinese UI, a Japanese anime tag loses it in an English UI — and by the UI
 * language when the children are elements.
 */
export function isCjkLabel(children: ReactNode, language: LanguageId): boolean {
  const text = plainText(children);
  return text === null ? isCjkLanguage(language) : containsCjk(text);
}
