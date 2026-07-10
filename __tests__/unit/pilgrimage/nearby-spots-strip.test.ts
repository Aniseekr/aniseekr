// Task 9: map hub sheet "nearby spots" strip.
//
// `NearbySpotRow` and `PilgrimageHubSheetImpl` both call hooks
// (`useMemo`/`useT`) at their own top level. This project has no real React
// renderer (react-test-renderer isn't installed and react-native is shimmed
// for unit tests), so calling a hook-using function component directly — the
// trick `render-helpers.ts` uses for hookless components — throws "Invalid
// hook call" (see NearbyPilgrimageBadge's test for the same constraint).
// `PilgrimageHubSheet.tsx` additionally imports `@gorhom/bottom-sheet`
// (which eagerly initializes `react-native-gesture-handler`, which itself
// throws against this suite's frozen `react-native-reanimated` mock) and
// `../themed`, whose full named-export surface (`ON_DARK` etc.) other test
// files in this suite mock down to a subset — bun's `mock.module` is a
// process-wide, run-order-dependent override, so re-declaring a fuller stub
// in THIS file to import the real component was empirically still racy
// across the full suite (module registration order between concurrently
// starting test files, not just this file's own statements).
//
// So this file validates everything through renderer-free channels:
//   - `formatKm` — a pure function, exercised directly.
//   - Everything else (SpotImage swap, i18n key usage, strip placement,
//     `areEqual` wiring) is pinned by source-contract assertions, matching
//     the established pattern for hook/dependency-blocked components in this
//     suite (see NearbyPilgrimageBadge's test file).

import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatKm, NearbySpotRow } from '../../../components/pilgrimage/NearbySpotsSheet';
import en from '../../../libs/i18n/locales/en.json';
import zhHant from '../../../libs/i18n/locales/zh-Hant.json';

const NEARBY_SHEET_SOURCE = readFileSync(
  join(process.cwd(), 'components/pilgrimage/NearbySpotsSheet.tsx'),
  'utf8'
);
const HUB_SHEET_SOURCE = readFileSync(
  join(process.cwd(), 'components/pilgrimage/PilgrimageHubSheet.tsx'),
  'utf8'
);

describe('formatKm', () => {
  it('renders sub-km distances in meters', () => {
    expect(formatKm(0.42)).toBe('420 m');
  });

  it('renders 1-10km distances with one decimal', () => {
    expect(formatKm(3.14)).toBe('3.1 km');
  });

  it('renders 10km+ distances rounded to whole km', () => {
    expect(formatKm(23.6)).toBe('24 km');
  });

  it('returns empty string for non-finite input', () => {
    expect(formatKm(Number.NaN)).toBe('');
    expect(formatKm(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('NearbySpotsSheet.tsx — export + SpotImage contract', () => {
  it('exports NearbySpotRow and formatKm as real functions', () => {
    expect(typeof NearbySpotRow).toBe('function');
    expect(typeof formatKm).toBe('function');
  });

  it('renders the row thumbnail through SpotImage, not a raw expo-image Image', () => {
    // The row must route every remote pilgrimage image through SpotImage so a
    // load failure shows the honest error tile (CLAUDE.md Rule 8) instead of a
    // silent blank box.
    expect(NEARBY_SHEET_SOURCE).toMatch(/import \{ SpotImage \} from '\.\/SpotImage';/);
    expect(NEARBY_SHEET_SOURCE).not.toMatch(/import \{ Image \} from 'expo-image';/);
    expect(NEARBY_SHEET_SOURCE).toMatch(/<SpotImage\s+uri=\{spot\.image\}/);
  });
});

describe('PilgrimageHubSheet — nearby spots strip wiring', () => {
  it('gates the strip on a non-empty nearbySpots list (Rule 8: no empty-state filler)', () => {
    expect(HUB_SHEET_SOURCE).toMatch(
      /nearbySpots && nearbySpots\.length > 0 \? \(\s*<NearbySpotsStrip/
    );
  });

  it('localizes the strip title via t() instead of a hardcoded English string', () => {
    expect(HUB_SHEET_SOURCE).toMatch(/t\('pilgrimage\.map\.nearbySpotsTitle'\)/);
    expect(HUB_SHEET_SOURCE).not.toMatch(/Sacred sites near you/);
  });

  it('reuses the revived NearbySpotRow instead of a new row implementation', () => {
    expect(HUB_SHEET_SOURCE).toMatch(/import \{ NearbySpotRow \} from '\.\/NearbySpotsSheet';/);
    expect(HUB_SHEET_SOURCE).toMatch(/<NearbySpotRow key=\{spot\.markerId\}/);
  });

  it('caps the strip at 6 rows (no nested horizontal scroller inside the sheet list)', () => {
    expect(HUB_SHEET_SOURCE).toMatch(/spots\.slice\(0, 6\)/);
  });

  it('compares nearbySpots and onPickNearbySpot by identity in the memo areEqual (Rule 9)', () => {
    // Without these, PilgrimageHubSheet's React.memo would bail out on a
    // nearbySpots-only update from map.tsx and the strip would never render
    // or refresh once its query resolves.
    const areEqualBody = HUB_SHEET_SOURCE.slice(
      HUB_SHEET_SOURCE.indexOf('function areEqual'),
      HUB_SHEET_SOURCE.indexOf('export const PilgrimageHubSheet')
    );
    expect(areEqualBody).toMatch(/prev\.nearbySpots === next\.nearbySpots/);
    expect(areEqualBody).toMatch(/prev\.onPickNearbySpot === next\.onPickNearbySpot/);
  });

  it('declares nearbySpots/onPickNearbySpot as optional props (undefined ⇒ no strip)', () => {
    expect(HUB_SHEET_SOURCE).toMatch(/nearbySpots\?: readonly NearbySpot\[\];/);
    expect(HUB_SHEET_SOURCE).toMatch(
      /onPickNearbySpot\?: \(spot: NearbySpot\) => void;/
    );
  });
});

describe('en / zh-Hant nearbySpotsTitle key', () => {
  it('is present and translated (no raw English leaking into zh-Hant)', () => {
    expect(en.pilgrimage.map.nearbySpotsTitle).toBe('Sacred sites near you');
    expect(zhHant.pilgrimage.map.nearbySpotsTitle).toBe('你附近的聖地');
  });
});
