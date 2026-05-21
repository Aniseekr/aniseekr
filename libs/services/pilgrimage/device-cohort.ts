// Cohort classifier — turns a flat CameraDevice[] into a strategy + primary +
// optional standalone children that the dial / zoom / session code can act on
// without re-running the picker logic per concern.
//
// Three strategies cover every shipped phone in this app's range:
//
//   * `logical`           — one virtual device covers the whole 0.5–max range
//                           in a single session (iOS Triple-Camera; Android
//                           OEMs like Xiaomi that expose a true 0.5× logical).
//                           The dial renders one continuous strip; no island.
//
//   * `standalone-switch` — the best wide-side device's `minZoom` doesn't reach
//                           0.5, but a separate physical device DOES. To get
//                           below the wide device's floor the camera session
//                           has to swap to the standalone ultra-wide. The dial
//                           renders [wideMin, max] as a continuous strip with
//                           a 0.5 island chip that triggers the session swap.
//                           (Pixel 8 logical 0.67 + standalone uw; S20FE three
//                           separate physical devices.)
//
//   * `wide-only`         — no ultra-wide reach reported anywhere. Dial renders
//                           [1, max]; no island. (Pixel 6a.)
//
// Per CLAUDE.md Rule 8: we never invent a 0.5× pillar from a device that can't
// reach below 1.0. A sub-1× minZoom on any candidate is a real CameraX/AVF
// value; we just classify and route.
import type { CameraDevice } from 'react-native-vision-camera';

/** Reachable-without-session-switch threshold. A `minZoom <= 0.55` means the
 *  device can hit 0.5× from its current session — anything above means the
 *  user would experience a session rebuild to get there, which is the
 *  `standalone-switch` strategy. Cushion of 0.05 absorbs sensor float noise. */
const LOGICAL_REACH_THRESHOLD = 0.55;

/** A standalone ultra-wide device is one that ALSO reports sub-1× minZoom but
 *  isn't already the primary. We share the threshold from the picker to keep
 *  classification consistent end-to-end. */
const ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE = 1.0;

export type CohortStrategy = 'logical' | 'standalone-switch' | 'wide-only';

export interface DeviceCohort {
  readonly strategy: CohortStrategy;
  readonly primary: CameraDevice;
  readonly ultraWide?: CameraDevice;
  readonly telephoto?: CameraDevice;
}

function isPositiveFinite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * A standalone camera reaches the ultra-wide focal range when EITHER:
 *   (a) it reports `minZoom < 1` — the canonical logical-multi-cam signal
 *       (iPhone Triple-Camera virtual; Xiaomi/Oppo logicals; some Pixel
 *       virtuals); OR
 *   (b) VisionCamera reported its `type` as `'ultra-wide-angle'` — which on
 *       Android comes from CameraX's `intrinsicZoomRatio < 1` check (see
 *       `CameraInfo+deviceType.kt:36-40`). Standalone ultra-wide cameras on
 *       Samsung (S20FE/S22/S23/S24) and Pixel report their OWN `minZoom = 1`
 *       (each lens is at native FOV; digital crop can only zoom IN from
 *       there), so (a) alone misses them. (b) is the honest signal:
 *       intrinsicZoomRatio is a real OS-side measurement, not a guess.
 *
 * Rule 8 guard: both signals are real CameraX/AVF values. We never adopt a
 * device just because it has a sub-1× transient minZoom from a botched
 * zoomState read (the `isPositiveFinite` check rejects `0`).
 */
function reachesUltraWide(device: CameraDevice): boolean {
  if (device.type === 'ultra-wide-angle') return true;
  return (
    isPositiveFinite(device.minZoom) && device.minZoom < ULTRA_WIDE_MIN_ZOOM_EXCLUSIVE
  );
}

/**
 * Classify the rear-camera cohort. Returns `null` if no back-facing device is
 * present at all (caller should fall back to VisionCamera's stock picker).
 *
 * Algorithm:
 *   1. Pick the `primary` as the back device with the largest maxZoom — the
 *      device that carries the dial's wide-and-telephoto range. A standalone
 *      ultra-wide (maxZoom ≈ 1) loses to a logical multi-cam (maxZoom 15–30)
 *      by construction, so we never confuse "the device that reaches 0.5"
 *      with "the device the session opens to by default".
 *   2. If `primary.minZoom <= LOGICAL_REACH_THRESHOLD`, the primary itself
 *      already reaches 0.5 (iOS Triple-Camera; Xiaomi true logical 0.5). The
 *      cohort is `logical` and no standalone children are surfaced — any
 *      sibling ultra-wide listed by the OS is the SAME hardware, dressed up
 *      as a separate device entry, and including it would suggest a needless
 *      session switch.
 *   3. Otherwise, look for a separate back device with `minZoom < 1` — that's
 *      a standalone ultra-wide reachable only through a session swap
 *      (Pixel 8 logical 0.67 + standalone uw; S20FE three standalones). The
 *      cohort is `standalone-switch` with that device as `ultraWide`.
 *   4. Otherwise the cohort is `wide-only` (Pixel 6a; S20FE variant where
 *      the OS doesn't expose the ultra-wide at all — we don't pretend).
 */
export function classifyCohort(devices: readonly CameraDevice[]): DeviceCohort | null {
  const back = devices.filter((d) => d.position === 'back');
  if (back.length === 0) return null;

  const primary = pickBroadestByMaxZoom(back);

  const primaryReachesUw =
    isPositiveFinite(primary.minZoom) && primary.minZoom <= LOGICAL_REACH_THRESHOLD;
  if (primaryReachesUw) {
    return { strategy: 'logical', primary };
  }

  const ultraWide = back.find((d) => d !== primary && reachesUltraWide(d));
  if (ultraWide) {
    return { strategy: 'standalone-switch', primary, ultraWide };
  }

  return { strategy: 'wide-only', primary };
}

function pickBroadestByMaxZoom(devices: readonly CameraDevice[]): CameraDevice {
  let best = devices[0];
  let bestMax = isPositiveFinite(best.maxZoom) ? best.maxZoom : 0;
  for (let i = 1; i < devices.length; i += 1) {
    const cur = devices[i];
    const curMax = isPositiveFinite(cur.maxZoom) ? cur.maxZoom : 0;
    if (curMax > bestMax) {
      best = cur;
      bestMax = curMax;
    }
  }
  return best;
}
