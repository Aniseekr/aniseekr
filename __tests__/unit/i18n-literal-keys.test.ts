import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '../../libs/i18n/locales/en.json';

// `t()` accepts `TranslationKey | string`, so a typo'd or since-removed key
// compiles and renders as the raw key (e.g. "settings.appearance.title"). This
// guard checks every literal dotted key passed to `t('…')` resolves to a string
// in the English catalog. Dynamic keys (template literals, variables) are out
// of scope — they stay typed through TranslationKey at their definition site.

const ROOT = join(import.meta.dir, '..', '..');
const SOURCE_DIRS = ['app', 'components', 'libs', 'hooks'];
const LITERAL_KEY = /\bt\(\s*'([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)'/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

function resolves(key: string): boolean {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

describe('i18n literal keys', () => {
  it('every literal t() key exists in en.json', () => {
    const missing: string[] = [];
    for (const dir of SOURCE_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(LITERAL_KEY)) {
          if (!resolves(match[1])) missing.push(`${file.slice(ROOT.length + 1)}: ${match[1]}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
