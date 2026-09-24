# UI/UX cleanup — de-AI visuals, typography, camera (2026-09-24)

Approved plan: `~/.claude/plans/harmonic-seeking-frog.md` (branch `feat/uiux-cleanup`).
Order: Phase 0 → 1a → 2 → 3 → 1b. This file is the Phase 0 baseline + punch list.

User decisions (locked): Seeker tab structure unchanged; bundle a Latin display face
for headlines/numerals (CJK stays system); free capture without a reference never shows
the stacked compare; "attach image" = anime scene or library import; Claude implements,
independent opus review per phase.

## Phase 0 baseline (iPhone 18 Pro sim, iOS 26, dark, en + zh-Hant)

Screenshots live outside the repo (session scratchpad `baseline/`); findings below.

### Global (every tab)
- **G1 Headline weight lost** — `ThemedText` always spreads `{ fontWeight: weight }`;
  `undefined` overrides the variant weight in `flattenStyle`, so headlines without an
  explicit `weight` render Regular (e.g. Seeker "Pilgrimage" title vs Explorer "Discover").
- **G2 Native `Switch` is top-aligned in its row on iOS 26** — visible 14pt offset in
  `SeekerTabEditor` (57pt rows), subtler in `SettingsSwitchRow`. Fix once in a
  `ThemedSwitch` wrapper (fixed box, centered) and adopt everywhere.
- **G3 Uppercase tracking applied to CJK** — `letterSpacing: 1–1.2` caps labels render
  "應 用 語 言" / "聖 地 巡 禮" (tab bar label, settings section titles, hub eyebrow,
  language screen). Tracking must be 0 for zh/ja/ko.
- **G4 Scroll content hard-clipped ~34pt above the screen bottom** on Profile, Settings,
  Bangumi (content ends in a straight cut instead of running under the floating tab bar).
- **G5 Sticky header lets content peek through** — pilgrimage hub header shows a clipped
  "-" and "See all" fragment of the next section under it while scrolled.
- **G6 Inconsistent header top offsets across tabs** — Collection title sits ~60pt lower
  than Bangumi/Discover (decorative blob + extra padding).

### Profile / Settings
- Seeker tab editor: G2 + one-off switch colors (`${accent}80` track + accent thumb);
  at-capacity rows dim to 45% so the whole list looks broken.
- Quick Shortcuts: rainbow icon bubbles (8 hues), `sparkles` next to the title, labels
  stay English in zh UI ("Notifications", "Sync hub", "Otaku DNA") — rule 11.
- "View full stats" full-accent banner competes with everything; duplicate settings
  entry points (header gear + Settings row).
- Settings shows the raw key **`settings.appearance.title`** (missing i18n key; `t()`
  accepts any string so typecheck did not catch it). "Connected platforms · No" value
  reads oddly. `Premium active` / `Unlock Premium` hardcoded English (settings.tsx:541).

### Pilgrimage / Explorer
- Rally cards + event page: `ticket-outline` icon as the rally's identity; dashed
  "Stamp" chip; accent-bordered hero card; faux ticket perforation on progress card.
- Provenance credits are a wall of pills: dashed shield icon + pill + "Verified" date
  + the same source name repeated below; wraps inconsistently when 4 sources stack.
- Every stop has a full-width accent "Collect stamp" CTA (9 loud buttons per page).
- "Anime Tourism 88 · ✓ ★ Official" badge carries two icons.
- Journal: tri-color stat icons (blue/purple/green), duplicate capture CTA (glowing FAB
  "Add Pilgrimage" while Camera is a tab), truncated "Import your firs…" tile, page title
  "Pilgrimage Album" vs tab "Journal".
- Camera tab: header "Free capture" is off-centre (space reserved for a hidden close button).

### Collector tabs
- Home: `sparkles` "For you" header button, arrow glyph inside the selected segment.
- Bangumi: `sparkles` "Today", accent border on the day card + accent bars per row;
  zh-Hant tab label is the untranslated "Bangumi".
- Collection: decorative gradient blob; header counts contradict ("1 folder" vs
  "0 folders" / "No folders yet").

## `sparkles` inventory → purpose-built icon (Phase 2b)

| Site | Meaning | Replacement |
|---|---|---|
| `app/(tabs)/profile.tsx:389`, `app/(setting)/settings.tsx:358,540`, `appearance.tsx:474` | Premium | `workspace-premium` (MaterialIcons; `diamond` is already the gem currency) |
| `appearance.tsx:410` | theme preview bubble | `color-palette` |
| `components/profile/ProfileShortcutsGrid.tsx:96` | decoration next to title | remove |
| `components/profile/ExperienceModeSwitcher.tsx:105` | Seeker (custom mix) mode | `apps` |
| `components/rate/PersonalizedPickSheet.tsx:70,245`, `components/rate/seasonal/ShowcaseLayout.tsx:186`, Home header button | "For you" recommendations | `heart-circle` |
| `components/rate/seasonal/SeasonalView.tsx:39` | Spotlight layout | `flashlight` |
| `components/bangumi/TodayUpdatesSection.tsx:59` | airing today | `today` |
| `app/(tabs)/pilgrimage/compare/[spotId].tsx:180`, `libs/services/pilgrimage/capture-mode-copy.ts:34`, `components/pilgrimage/camera/AutoCaptureToast.tsx:71` | auto-capture mode | `aperture` |
| `app/(tabs)/pilgrimage/compare/tips.tsx:224` | anime scene caption | `film` |
| `components/pilgrimage/common/LocalityAesthetic.tsx:23,32`, `map/LocalityMapLegend.tsx:25`, `map/engines/markers/NativeMapMarker.tsx:155` | festival category / default mini-stamp | `bonfire` (festival); default → `tv` |
| `app/(tabs)/pilgrimage/event/[eventId].tsx:380`, `news/index.tsx:332,354,551` | anime work / all works | `tv` / `albums` |
| `components/pilgrimage/LocalityEventCalendar.tsx:108` | calendar event marker legend | match the real marker glyph |
| `app/companion/library.tsx:353` | cut-out done | `cut` |
| `libs/services/streaming/streaming-platforms.ts:162` | Bahamut platform glyph | `play-circle` |
| `components/rate/FolderPicker.tsx:35` | user-pickable folder icon | keep (user choice) |

## Phase checklist
- [x] 0 baseline + punch list (this file)
- [x] 1a typography JS fixes (G1, SF names, CJK tracking G3, token migration) — 69b1c86
- [x] 2 de-AI visuals + detail alignment — 86e7d2e, 9ed25bd, 00529b5, 250b89f, 4b8dc73, 86fa63d
  (ThemedSwitch; SafeArea edges; Seeker collapse; poster-led rally/event cards; StampMark;
  plain credits; sparkles/emoji purge; i18n gaps + literal-key guard test; genre translator).
  G5 was not a bug: the hub header sits above the ScrollView; the "peek" is normal edge clipping.
  Open: Jujutsu Kaisen rally links Bangumi 238887, which resolves to the manga vol.1 cover
  (data mapping review, Atlas side).
- [x] 3 camera — a68f8cf, 13ec2a4, 847099f (PILG-065..069; root `app/compare/*`;
  ReferencePickerSheet; free-camera Reference pill + library import; single-shot preview;
  Journal free shots open the preview). Device check pending: library import + pairing
  (simulator has no camera; photo permission was not granted during testing).
- [ ] 1b bundled display face (native rebuild, combined with Phase 3 device build)
