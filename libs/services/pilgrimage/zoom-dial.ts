// Pure, React-free math for the camera ZoomDial — a CD-style continuous zoom
// dial that replaces the old 4-button FocalPills row.
//
// WHY equal-pixel segments:
// VisionCamera exposes zoom in real factor units (0.5x, 1x, 2x, 3x...). A
// physically linear strip would make the 1x->2x segment tiny on devices whose
// max zoom reaches 15x+, so the labeled stops would bunch at the start and the
// rest would be an unlabeled tail. Instead we give each gap between consecutive
// detents an EQUAL pixel width (`segPx`) and interpolate the real zoom factor
// linearly *within* each segment. The mapping stays monotonic and invertible,
// so position<->zoom round-trips exactly.
//
// Rule 8 (no fake data): the dial only ever LABELS the real detents
// (0.5/1/2/3x). Past the last detent we render one more equal-width segment of
// neutral, UNLABELED ticks up to the native device max zoom. The app must never
// print invented intermediate labels like "4.2x".
import type { FocalStop } from '../../../components/pilgrimage/camera/types';

/** Real zoom factor each focal stop targets. Mirrors useCameraZoom's
 *  STOP_TO_ZOOM but kept here as the dial's input contract so this module has
 *  no React/hook dependency. The caller passes the live map in. */
export type StopZoomMap = Record<FocalStop, number>;

/**
 * Detent kind. Real focal stops route picks through the screen's optical
 * lens-switching logic (`onPickFocalStop`). The `'floor'` kind is the special
 * "wide-floor" detent we add for sub-1 Android cameras (e.g. Pixel 0.67×
 * minZoom) that have no 0.5× affordance — it is NOT a `FocalStop`, so it never
 * routes through `onPickFocalStop`; the dial drives `zoomShared` directly.
 */
export type DetentKind = FocalStop | 'floor';

/** A labeled detent on the dial: a tap target AND a snap point. */
export interface Detent {
  /**
   * What this detent represents: a real focal stop (0.5 / 1 / 2 / 3) or the
   * non-`FocalStop` `'floor'` for the device's true sub-1 minZoom.
   */
  stop: DetentKind;
  /** Pixel offset of this detent's tick, measured from the strip's left edge. */
  px: number;
  /**
   * Real native zoom factor at this detent. The value is passed straight to
   * VisionCamera, so 0.5x stays 0.5 and 3x stays 3.
   */
  zoom: number;
  /**
   * Display label override. Set only on the `'floor'` detent, which has no
   * `FocalStop` to derive a label from — it carries the rounded real minZoom
   * (e.g. "0.7x"). Real focal stops leave this undefined and label themselves
   * from `stop` at the component layer.
   */
  label?: string;
}

/** Default detent set for a digital-only (no optical lens info) rear camera. */
export const DEFAULT_DETENT_STOPS: FocalStop[] = [1, 2, 3];
/** Front-facing cameras effectively expose a single 1x stop. */
export const FRONT_FACING_DETENT_STOPS: FocalStop[] = [1];

/** Equal pixel width of every segment between consecutive detents (and of the
 *  "beyond last detent" neutral tail). ~96px gives a comfortable drag throw. */
export const SEGMENT_PX = 96;
/** Spacing between neutral (unlabeled) ticks along the strip. */
export const TICK_SPACING_PX = 12;
/** How close (in px) the strip center must be to a detent for it to snap. */
export const SNAP_TOLERANCE_PX = 22;

// The px<->zoom math below is called from BOTH the JS thread (effects, taps,
// useMemo) and reanimated worklets (the pan gesture's onUpdate/onEnd, the
// useAnimatedReaction). Functions reached from a worklet MUST carry the
// 'worklet' directive or they throw on the UI thread — same reason
// useCameraZoom's `clamp` is marked. A 'worklet' function still runs fine on
// the JS thread, so marking them is safe for the JS-side callers too.
//
// IMPORTANT: default parameter values on `'worklet'` functions CANNOT reference
// module-level consts. The Reanimated babel plugin captures free identifiers
// inside worklet BODIES, but default values are evaluated lazily at call time
// on the UI runtime where module imports don't exist — referencing SEGMENT_PX
// in `segPx = SEGMENT_PX` throws `Property 'SEGMENT_PX' doesn't exist` the
// moment a worklet caller passes `undefined`. The defaults below are written
// as literal numbers; the exported consts above stay as the canonical JS-side
// values so non-worklet callers / future refactors keep one source of truth.
function clampNumber(v: number, lo: number, hi: number): number {
  'worklet';
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}

function isFiniteNumber(value: number): boolean {
  'worklet';
  return value === value && value !== Infinity && value !== -Infinity;
}

function tailMaxZoom(detents: readonly Detent[], maxZoom?: number): number {
  'worklet';
  if (detents.length === 0) return 0;
  const lastZoom = detents[detents.length - 1].zoom;
  if (typeof maxZoom === 'number' && isFiniteNumber(maxZoom) && maxZoom > lastZoom) {
    return maxZoom;
  }
  return lastZoom;
}

/**
 * Builds the ordered detent list for the dial. `stops` is the ascending list
 * of focal stops the device exposes (e.g. `[1,2,3]` digital-only, `[0.5,1,2,3]`
 * on an ultrawide-equipped device). Each detent gets an equal-pixel offset.
 *
 * - `stopZoom` supplies the real native zoom factor for 0.5/1/2/3x.
 * - The first detent sits at `px = 0`; each subsequent detent is `segPx` further
 *   right. The dial then appends one more `segPx`-wide neutral tail past the
 *   last detent.
 */
export function buildDetents(
  stops: readonly FocalStop[],
  stopZoom: StopZoomMap,
  segPx: number = 96
): Detent[] {
  const sorted = [...new Set(stops)].sort((a, b) => a - b);
  return sorted.map((stop, index) => {
    const rawZoom = stopZoom[stop] ?? stop;
    return {
      stop,
      px: index * segPx,
      zoom: isFiniteNumber(rawZoom) && rawZoom > 0 ? rawZoom : stop,
    };
  });
}

// --- Wide-floor detent (sub-1 Android cameras with no 0.5× affordance) ---
//
// Some Android logical rear cameras (e.g. Pixel 6 Pro) report a `minZoom`
// that is sub-1 but NOT 0.5-class — typically ~0.67×, the Pixel ultra-wide
// reach floor. When such a device is a `wide-only` cohort it has neither a
// `0.5` detent nor a 0.5× island chip, so the dial's lowest detent is `1×` and
// the strip clamps there: the user can't reach the widest the lens offers.
//
// We close that gap with one extra leftmost `'floor'` detent at the real
// `minZoom`. It is NOT a `FocalStop` (0.67 isn't in the union), so it carries
// its own numeric `zoom` + `label` and the dial drives `zoomShared` directly
// instead of routing through `onPickFocalStop`.

/** Lower bound (exclusive) of the wide-floor band. A `minZoom` at or below
 *  this is the iOS / logical 0.5-class case that already has a `0.5` detent. */
export const WIDE_FLOOR_MIN_ZOOM = 0.55;
/** Upper bound (exclusive) of the wide-floor band. A `minZoom` at or above
 *  this has no meaningful sub-1 reach, so no floor detent is shown. */
export const WIDE_FLOOR_MAX_ZOOM = 0.95;

/**
 * True when the active device needs a synthetic wide-floor detent: its
 * `minZoom` is sub-1-but-not-0.5-class AND it has no existing zoom-out
 * affordance (no `0.5` in `stops`, and `hasIsland` is false). Devices that
 * already expose a `0.5` detent or a 0.5× island chip are left unchanged.
 */
export function needsWideFloor(
  minZoom: number | undefined,
  stops: readonly FocalStop[],
  hasIsland: boolean
): boolean {
  if (hasIsland) return false;
  if (stops.includes(0.5)) return false;
  if (typeof minZoom !== 'number' || !Number.isFinite(minZoom)) return false;
  return minZoom > WIDE_FLOOR_MIN_ZOOM && minZoom < WIDE_FLOOR_MAX_ZOOM;
}

/** Compact display label for the wide-floor detent: the real `minZoom`
 *  rounded to 1 decimal place (e.g. 0.67 → "0.7x"). Uses the dial's lowercase
 *  `x` convention (see `formatStop` in ZoomDial). An honest rounding of a real
 *  CameraX value, not an invented number (CLAUDE.md Rule 8). */
export function wideFloorLabel(minZoom: number): string {
  return `${(Math.round(minZoom * 10) / 10).toFixed(1)}x`;
}

/**
 * Like {@link buildDetents}, but prepends a `'floor'` detent at the real
 * `minZoom` when {@link needsWideFloor} is satisfied. The floor detent sits at
 * `px = 0`; every existing detent shifts one `segPx` to the right. When no
 * floor is needed this is exactly `buildDetents`.
 */
export function buildDetentsWithFloor(
  stops: readonly FocalStop[],
  stopZoom: StopZoomMap,
  minZoom: number | undefined,
  hasIsland: boolean,
  segPx: number = 96
): Detent[] {
  const base = buildDetents(stops, stopZoom, segPx);
  if (!needsWideFloor(minZoom, stops, hasIsland)) return base;
  // `minZoom` is verified finite + in-band by needsWideFloor above.
  const floorZoom = minZoom as number;
  const floor: Detent = {
    stop: 'floor',
    px: 0,
    zoom: floorZoom,
    label: wideFloorLabel(floorZoom),
  };
  const shifted = base.map((d) => ({ ...d, px: d.px + segPx }));
  return [floor, ...shifted];
}

/**
 * Total draggable pixel span of the strip: from the first detent (px 0) to the
 * end of the neutral tail one segment past the last detent.
 */
export function dialSpanPx(detents: readonly Detent[], segPx: number = 96): number {
  'worklet';
  if (detents.length === 0) return 0;
  return detents[detents.length - 1].px + segPx;
}

/**
 * Gesture translation -> strip position.
 *
 * A leftward drag has a negative translationX, but it should move the strip
 * toward larger px / larger zoom values, so the translation is inverted.
 */
export function dragPositionForTranslation(
  startPx: number,
  translationX: number,
  spanPx: number
): number {
  'worklet';
  const safeStart = isFiniteNumber(startPx) ? startPx : 0;
  const safeTranslation = isFiniteNumber(translationX) ? translationX : 0;
  const safeSpan = isFiniteNumber(spanPx) ? Math.max(0, spanPx) : 0;
  return clampNumber(safeStart - safeTranslation, 0, safeSpan);
}

/**
 * position px -> real native zoom factor.
 *
 * Within each detent-to-detent segment the zoom is interpolated linearly
 * between the two detents' zoom values. Past the last detent the tail runs
 * linearly from the last detent's zoom up to `maxZoom` when known.
 * Out-of-range px is clamped to the strip span.
 */
export function zoomForPosition(
  px: number,
  detents: readonly Detent[],
  segPx: number = 96,
  maxZoom?: number
): number {
  'worklet';
  if (detents.length === 0) return 0;
  const span = dialSpanPx(detents, segPx);
  const safePx = isFiniteNumber(px) ? px : 0;
  const clamped = clampNumber(safePx, 0, span);
  if (detents.length === 1) {
    const d = detents[0];
    const tailZoom = tailMaxZoom(detents, maxZoom);
    if (tailZoom <= d.zoom) return d.zoom;
    const t = clampNumber((clamped - d.px) / segPx, 0, 1);
    return lerp(d.zoom, tailZoom, t);
  }
  for (let i = 0; i < detents.length - 1; i += 1) {
    const a = detents[i];
    const b = detents[i + 1];
    if (clamped <= b.px) {
      const segmentWidth = b.px - a.px;
      const t = segmentWidth <= 0 ? 0 : clampNumber((clamped - a.px) / segmentWidth, 0, 1);
      return lerp(a.zoom, b.zoom, t);
    }
  }
  const last = detents[detents.length - 1];
  const tailZoom = tailMaxZoom(detents, maxZoom);
  if (tailZoom <= last.zoom) return last.zoom;
  const t = clampNumber((clamped - last.px) / segPx, 0, 1);
  return lerp(last.zoom, tailZoom, t);
}

/**
 * Real native zoom factor -> position px. Inverse of `zoomForPosition`;
 * round-trips exactly for any in-range zoom because every segment is a strictly
 * monotonic linear map. Out-of-range zoom is clamped to the strip span.
 */
export function positionForZoom(
  zoom: number,
  detents: readonly Detent[],
  segPx: number = 96,
  maxZoom?: number
): number {
  'worklet';
  if (detents.length === 0) return 0;
  const first = detents[0];
  const z = isFiniteNumber(zoom) ? zoom : first.zoom;
  if (z <= first.zoom) return first.px;
  if (detents.length === 1) {
    const tailZoom = tailMaxZoom(detents, maxZoom);
    if (tailZoom <= first.zoom) return first.px;
    const t = (z - first.zoom) / (tailZoom - first.zoom);
    return first.px + clampNumber(t, 0, 1) * segPx;
  }
  for (let i = 0; i < detents.length - 1; i += 1) {
    const a = detents[i];
    const b = detents[i + 1];
    if (z <= b.zoom) {
      // Guard against a degenerate segment where two detents share a zoom
      // value (e.g. 0.5x and 1x both map to 0): snap to the segment start.
      if (b.zoom <= a.zoom) return a.px;
      const t = clampNumber((z - a.zoom) / (b.zoom - a.zoom), 0, 1);
      return a.px + t * (b.px - a.px);
    }
  }
  const last = detents[detents.length - 1];
  if (z <= last.zoom) return last.px;
  const tailZoom = tailMaxZoom(detents, maxZoom);
  if (tailZoom <= last.zoom) return last.px;
  const t = (z - last.zoom) / (tailZoom - last.zoom);
  return last.px + clampNumber(t, 0, 1) * segPx;
}

/**
 * Returns the kind of the detent nearest `px` (a `FocalStop` or `'floor'`), or
 * `null` when the nearest detent is further than `tolerancePx`. Used for
 * snap-on-release and to decide which detent label to highlight while dragging.
 */
export function nearestDetent(
  px: number,
  detents: readonly Detent[],
  tolerancePx: number = 22
): DetentKind | null {
  'worklet';
  let best: DetentKind | null = null;
  let bestDelta = Infinity;
  for (const d of detents) {
    const delta = Math.abs(px - d.px);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = d.stop;
    }
  }
  if (best !== null && bestDelta <= tolerancePx) return best;
  return null;
}

/**
 * Pixel offset of a detent by its kind (`FocalStop` or `'floor'`), or `null` if
 * not on the dial. A `FocalStop` argument never matches the `'floor'` detent
 * and vice versa, so existing `FocalStop`-typed call sites stay correct.
 */
export function positionForStop(stop: DetentKind, detents: readonly Detent[]): number | null {
  'worklet';
  const found = detents.find((d) => d.stop === stop);
  return found ? found.px : null;
}
