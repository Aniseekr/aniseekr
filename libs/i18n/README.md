# Aniseekr i18n — translation guide

Aniseekr is open source and the UI is fully localizable. Every user-visible
string lives in this folder as a JSON file. **Adding a key, fixing a typo, or
shipping a new language is a one-file pull request** — no codegen, no build
step, no extra tools.

> Brand names (Aniseekr, AniList, MyAnimeList, Bangumi, Kitsu, Simkl,
> Anitabi…) and anime titles **stay in their original form** in every
> language. Only translate UI chrome.

## Supported languages

| Id | Native name | Status | Coverage |
|----|-------------|--------|----------|
| `en` | English | Canonical (source of truth) | 100% |
| `zh-Hant` | 繁體中文 | Maintained | 100% |
| `zh-Hans` | 简体中文 | Maintained — auto-derived from `zh-Hant` via OpenCC where keys are missing | ~100% |
| `ja` | 日本語 | Partial — PRs welcome | ~10% |
| `ko` | 한국어 | Partial — PRs welcome | ~10% |

Want to add another language? Open a [GitHub issue](https://github.com/Aniseekr/aniseekr-expo/issues)
first so we can agree on the id (`fr-FR`, `pt-BR`, `de`, etc.) and update the
table together.

## Folder layout

```
libs/i18n/
├── locales/
│   ├── en.json        ← canonical catalog. EVERY key starts here.
│   ├── zh-Hant.json
│   ├── zh-Hans.json
│   ├── ja.json
│   └── ko.json
├── data/
│   └── genres.json    ← curated anime-data dictionary (genre → translations)
├── engine.ts          ← pure (no React) translator with fallback chain
├── index.tsx          ← React provider + useT() / useI18n() hooks
├── data-translator.ts ← runtime data translation (genres, tags, …)
├── data-language-prefs.ts  ← anime data language storage helpers
├── types.ts           ← TranslationKey type, derived from en.json
└── README.md          ← this file
```

## How resolution works (UI strings)

When the app asks for `t('settings.title')` while the language is `zh-Hans`:

1. Look in `zh-Hans.json`. Hit? Return it.
2. If missing, look in `zh-Hant.json` and **OpenCC simplify** the result
   (`設定` → `设定`). This is why `zh-Hans` doesn't need to repeat every
   sentence — only the ones with mainland-vs-taiwan vocabulary differences
   (影片 vs 视频, 軟體 vs 软件).
3. Otherwise fall through to `en.json` (the canonical catalog).
4. Otherwise return the key itself so missing keys are visible in dev.

`zh-Hant` borrows from `zh-Hans` symmetrically via OpenCC traditionalize.

In dev, every fallback logs `[i18n] missing "<key>" in <lang>` to the console.

## How resolution works (anime data: genres / tags / synopsis)

Different problem from UI chrome — values come from APIs at runtime. Four
layers, earlier ones preferred:

1. **Source-provided localized fields** — AniList `title.native/romaji/english`,
   Bangumi `name_cn`, MAL `synopsis` localized variants. The data source layer
   resolves these *before* anything in this folder runs.
2. **Curated dictionary** — `data/genres.json`. Maintained by community PRs.
   P2 will add `data/tags-top200.json` and `data/studios.json`.
3. **On-device machine translation** — Apple Translate (iOS 17.4+) or
   Google ML Kit (Android). Shipping in P3. UI marks every MT output with a
   `machine-translated` badge so the user knows it isn't a human translation.
4. **Original text** — always available as a fallback. The
   `<TranslatedText>` component renders it underneath when the user enables
   "Always show original" in Settings → Language.

## Adding a new UI key — 3 minutes

1. Open `locales/en.json`. Add the key, alphabetized inside its section:

   ```json
   "settings": {
     ...
     "newFeatureTitle": "Brand new feature"
   }
   ```

   That's it for English. TypeScript automatically generates the
   `TranslationKey` type from `typeof en`, so `t('settings.newFeatureTitle')`
   is immediately type-safe everywhere.

2. Open `locales/zh-Hant.json` (primary Chinese) and add the same key:

   ```json
   "settings": {
     ...
     "newFeatureTitle": "全新功能"
   }
   ```

3. Translate it in other locale files as you can. Anything missing falls
   back to English, so partial coverage is fine.

4. Open a PR. Done.

The parity test (`__tests__/unit/i18n.test.ts`) will refuse the PR if a
locale has a *stale* key (one not in `en.json`) — but **missing** keys are
intentionally allowed.

## Adding a new genre translation

Open `libs/i18n/data/genres.json`. Find the English genre as the outer key,
add your language:

```json
"Slice of Life": {
  "zh-Hant": "日常",
  "zh-Hans": "日常",
  "ja": "日常",
  "ko": "일상",
  "fr": "Tranche de vie"
}
```

If your language id (`fr` here) isn't in the supported list, add it to the
`LANGUAGES` map in `engine.ts` first.

## Improving an existing translation

Edit the value in the relevant locale file. Open a PR. The parity test
catches typos in nesting, but **doesn't** judge wording — that's on review.
Aim for natural sentence case in the target language; don't transliterate
the English word-for-word.

## Interpolation

Use `{name}` braces. The engine substitutes them at render time:

```json
// en.json
"about": { "version": "Version {version}" }
```

```ts
// caller
t('about.version', { version: '1.1.5' });
// → "Version 1.1.5"
```

If a placeholder is referenced but no value is provided, the engine leaves
`{name}` untouched in the output (so it's debuggable, not silent).

## Style guide

| Language | Punctuation | Tone | Vocabulary notes |
|----------|-------------|------|------------------|
| **English** | sentence case ("Get airing reminders?") | concise, conversational | "tap" not "click" |
| **繁體中文** | full-width 「」、，。 | 口語、不官腔 | 影片 / 軟體 / 螢幕 (Taiwan vocab) |
| **简体中文** | 半角 / 全角皆可 | 口语、不官腔 | 视频 / 软件 / 屏幕 (Mainland vocab) |
| **日本語** | 句読点 (。、) | です・ます調 | カタカナ語 OK if widely used |
| **한국어** | 한글 + 영문 혼용 OK | 존댓말 (-요/-니다) | 외래어 표기법 따름 |

Do **not** translate:
- Brand names: Aniseekr, AniList, MyAnimeList, Bangumi, Kitsu, Simkl, Anitabi
- Anime titles (they come from the data source, not the catalog)
- Romaji ("Romaji" stays "Romaji" in every language)

## Testing

```bash
bun test __tests__/unit/i18n.test.ts
```

The parity test confirms:
- No locale has a key that's missing from `en.json` (stale keys → fail)
- Every defined value is a string with the right nesting

Missing keys are allowed — they fall back.

## Roadmap

Where this is heading (no commitments — community feedback shapes the order):

- **P2** — `data/tags-top200.json` + `data/studios.json` curated dictionaries
- **P3** — on-device machine translation for synopsis via Apple Translate
  (iOS 17.4+) and Google ML Kit (Android), with explicit MT badge
- **Future** — community correction loop (in-app "suggest translation"
  bottom sheet → backend aggregation → auto-PR). Not on the near roadmap;
  PRs work fine for now and we want to see real demand first.

If you're translating actively and want a richer tool (Weblate, Tolgee), open
an issue — both have free OSS tiers and we'd consider hosting if there are
enough contributors.
