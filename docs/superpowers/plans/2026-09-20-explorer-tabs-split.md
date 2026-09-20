# Explorer Tabs Split Plan

## Goal

Turn Explorer into a pilgrimage-first mode with five direct bottom tabs while preserving every existing feature and deep link.

## Confirmed product model

- **Explorer**: Camera, Search, Map, Journal, Profile.
- **Collector**: Discovery, Schedule, Collection, Profile. No change in this phase.
- **Seeker**: Keeps the current five-tab default and may choose from both Collector and Explorer pages.
- The compact pilgrimage hub remains available as the existing `Pilgrimage` Seeker tab; it is not an Explorer tab.
- Mode switching and Seeker tab editing remain in Profile.
- Navigation is capped at five visible tabs including the fixed Profile tab. Seeker can therefore enable at most four content tabs.

## Navigation model

Add four stable top-level tab routes:

- `/explorer-camera`
- `/explorer-search`
- `/explorer-map`
- `/explorer-journal`

The routes reuse the existing pilgrimage experiences instead of duplicating business logic. Existing routes such as `/pilgrimage/capture`, `/search?context=pilgrimage`, `/pilgrimage/map`, and `/pilgrimage/album` continue to work as legacy/deep-link entry points.

`experience-tabs.ts` remains the single source of truth for tab IDs, hrefs, fixed mode presets, Seeker choices, ordering, normalization, and the five-tab limit.

## Screen reuse seam

Extract the four large route implementations into reusable screen components with a small `tabRoot` (or equivalent explicit variant) prop:

- Camera: hide the modal close action at tab root, keep camera controls, and open the Explorer Journal tab from the gallery action.
- Search: force pilgrimage results at tab root, avoid automatically opening the keyboard, and omit the back action.
- Map: omit the back action at tab root and route camera/search/journal shortcuts to Explorer tabs.
- Journal: omit the route-level back action at its root, preserve in-journal folder back behavior, and route capture actions to Explorer Camera.

Legacy route wrappers render the same screens in their current non-tab variant so no existing flow or deep link is removed.

Explorer shortcuts switch tabs only when that target is visible in the active preset. If a Seeker configuration omits the target tab, the action opens the equivalent legacy stack route so the user retains an explicit back path instead of entering a hidden tab.

## Seeker behavior

- Existing users retain the current Seeker selection and ordering after migration.
- New Explorer tab IDs are accepted by persistence normalization.
- Adding a fifth optional Seeker tab is rejected; removing a tab is always allowed.
- Profile is not removable.
- The editor communicates the four-of-four content-tab limit and disables unselected choices when full.

## UI constraints

- Keep the current Aniseekr visual language and floating tab bar.
- Use existing icons, tokens, and screen components.
- Only add tab-root spacing where camera/map controls would otherwise collide with the floating bar.
- No placeholder content or fake data.

## Verification

1. Unit tests first for presets, hrefs, migration, ordering, and the Seeker limit.
2. `bun run typecheck`
3. `bun run lint`
4. `bun run test`
5. Expo bundle/export smoke check to catch route graph or bundling failures.
6. Review the completed diff against this plan and repository standards before committing.

## Commit

Create one focused commit and bump the patch version from `1.1.10` to `1.1.11`.
