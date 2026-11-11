# 2026-11-11 Seasonal ONA + subscription manage route

## Seasonal ONA (schedule tab) — PASS (real AniList data, logic layer)
- Input: live AniList `FALL 2026` seasonal list (104 titles, 19 ONA), run through `splitSpecialAnime` / `matchesTypeFilter`.
- Before: 71 in week grid, 33 in "Movies & specials". After: 89 / 15.
- 18 series ONAs moved into the week grid, incl. JoJo SBR 2nd & 3rd STAGE, Maomao no Hitorigoto 3rd Season, Tensei Shitara Ken Deshita 2nd Season.
- Log: `anilist-fall-2026.log`.
- NOT run: on-device render of the schedule tab (no simulator dev build installed).

## Premium "Manage" route — UNVERIFIED on device
- Code: profile + settings Manage → new `/(setting)/subscription` screen (was `/account` on profile).
- Not run: needs a paid RevenueCat entitlement (sandbox purchase) on a device build.
