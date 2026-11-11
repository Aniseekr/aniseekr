# Plan — 番劇表平台時間 / 整季格狀 / 巴哈官方連結 (2026-11-11)

Build: iOS Release, iPhone 18 Pro simulator, feat/uiux-cleanup working tree (uncommitted changes on top of 6473ceb).
Independent reference: bangumi-data@0.3 (jsDelivr) + AniList GraphQL, fetched on the Mac at test time.

| ID | Goal | Steps | Expected | Verified at |
|----|------|-------|----------|-------------|
| C1 | Timetable renders all 7 days | Open 番劇 tab (current season, JP time — no platform set) | Vertical list: 今天 · 週X first, then 明天, … 7 day headers; rows sorted by time | Screenshot + accessibility tree |
| C2 | Strip jumps to a day | Tap a later weekday in the sticky strip | Scroll lands on that day's header; strip stays pinned | Screenshot |
| C3 | JP time baseline | With no platform, find 千歲くん (Chitose-kun Part 2) row | Shows JP slot (Tue 22:00 TW) | Row text vs AniList airingAt |
| C4 | Platform time | Settings → 觀看平台 → enable 動畫瘋 as primary, back to 番劇 | Chitose-kun moves to Thu, shows "00:30 · 動畫瘋" + "日本首播 週二 22:00" | Row text vs bangumi-data gamer broadcast |
| C5 | JoJo SBR present | Find JoJo SBR in timetable | Listed in week grid (not in 電影與特別篇) | Accessibility tree |
| C6 | Whole-season grid | Tap 整季 | 3-column poster grid, sort chips 人氣/評分/開播日, format chips; count == 本季全部 count | Screenshot |
| C7 | Sort | Tap 評分 | First tiles have the highest ★ (descending) | Accessibility tree values |
| C8 | 巴哈 official link | Open Chitose-kun detail → watch row | 動畫瘋 option is official (no search badge) and URL = acgDetail.php?s=140852 | Tap → opened URL / a11y label |

Cleanup: reset 觀看平台 prefs to none; `xcrun simctl shutdown all`.
