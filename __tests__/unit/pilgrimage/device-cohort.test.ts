import { describe, expect, it } from 'bun:test';
import type { CameraDevice } from 'react-native-vision-camera';
import { classifyCohort } from '../../../libs/services/pilgrimage/device-cohort';

// CameraDevice has dozens of nitro-bound fields we don't need for the
// classifier. classifyCohort touches: position, isVirtualDevice, minZoom,
// maxZoom, physicalDevices, type, focalLength. Everything else is unused.
type DeviceLite = {
  id: string;
  position: 'back' | 'front';
  isVirtualDevice: boolean;
  minZoom: number;
  maxZoom: number;
  physicalDevices: { focalLength?: number; type?: string }[];
  type?: string;
  focalLength?: number;
};

function makeDevice(overrides: Partial<DeviceLite>): CameraDevice {
  const base: DeviceLite = {
    id: 'device-0',
    position: 'back',
    isVirtualDevice: false,
    minZoom: 1,
    maxZoom: 1,
    physicalDevices: [],
    ...overrides,
  };
  return base as unknown as CameraDevice;
}

describe('classifyCohort', () => {
  it('returns null when no back-facing devices are present', () => {
    expect(classifyCohort([])).toBeNull();
    const onlyFront = makeDevice({ id: 'front-0', position: 'front' });
    expect(classifyCohort([onlyFront])).toBeNull();
  });

  it('Pixel 6a single wide-only → strategy=wide-only, no ultraWide/telephoto', () => {
    // A single-lens back camera, minZoom 1.0, no virtual logical, no
    // standalone ultra-wide. Honest classification: the dial should render
    // only [1, max], no island.
    const wide = makeDevice({
      id: 'pixel-6a-wide',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 8,
    });
    const cohort = classifyCohort([wide]);
    expect(cohort?.strategy).toBe('wide-only');
    expect(cohort?.primary.id).toBe('pixel-6a-wide');
    expect(cohort?.ultraWide).toBeUndefined();
    expect(cohort?.telephoto).toBeUndefined();
  });

  it('front-facing devices never appear in a back cohort, even when sub-1× minZoom is reported', () => {
    // Defensive: TrueDepth on iPad Pro and some folding devices report
    // sub-1× minZoom on the front camera. The cohort must never adopt one
    // as `ultraWide` for the back stack.
    const backWide = makeDevice({
      id: 'back-wide',
      position: 'back',
      minZoom: 1,
      maxZoom: 10,
    });
    const frontWide = makeDevice({
      id: 'front-virtual',
      position: 'front',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 5,
    });
    const cohort = classifyCohort([backWide, frontWide]);
    expect(cohort?.strategy).toBe('wide-only');
    expect(cohort?.primary.id).toBe('back-wide');
    expect(cohort?.ultraWide).toBeUndefined();
  });

  it('non-finite or zero minZoom on a transient sibling is ignored (no fake ultra-wide)', () => {
    // CameraX zoomState briefly returns null during configuration → VC
    // exposes that as minZoom=0. We must not classify 0 as "reaches 0.5"
    // and we must not adopt a zero-min sibling as the standalone uw.
    const wide = makeDevice({
      id: 'wide',
      minZoom: 1,
      maxZoom: 10,
    });
    const booting = makeDevice({
      id: 'booting',
      minZoom: 0,
      maxZoom: 0,
    });
    const cohort = classifyCohort([wide, booting]);
    expect(cohort?.strategy).toBe('wide-only');
    expect(cohort?.primary.id).toBe('wide');
    expect(cohort?.ultraWide).toBeUndefined();
  });

  it('S20FE three separate physical devices (no logical) → strategy=standalone-switch, primary=wide, ultraWide=uw', () => {
    // S20FE shape: CameraX exposes three independent physical devices and
    // never groups them into a logical virtual device. The dial must still
    // offer 0.5; ours surfaces the standalone uw as the island target.
    const wide = makeDevice({
      id: 's20fe-wide',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 10,
    });
    const uw = makeDevice({
      id: 's20fe-uw',
      isVirtualDevice: false,
      minZoom: 0.5,
      maxZoom: 1,
    });
    const tele = makeDevice({
      id: 's20fe-tele',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 3,
    });
    const cohort = classifyCohort([wide, uw, tele]);
    expect(cohort?.strategy).toBe('standalone-switch');
    expect(cohort?.primary.id).toBe('s20fe-wide');
    expect(cohort?.ultraWide?.id).toBe('s20fe-uw');
  });

  it('S20FE realistic shape: standalone uw reports its OWN minZoom=1, identified by type=ultra-wide-angle', () => {
    // The shape that bit us in production: every standalone camera reports
    // its own zoomState `minZoomRatio = 1.0` because the lens is at native
    // FOV and digital crop only zooms IN. The sub-1× signal lives in
    // CameraX's `intrinsicZoomRatio` check, which VisionCamera surfaces as
    // `device.type = 'ultra-wide-angle'`. The classifier MUST recognise
    // this — otherwise S20FE never gets the 0.5 island even though the
    // hardware is right there.
    const wide = makeDevice({
      id: 's20fe-wide-real',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 10,
      type: 'wide-angle',
    });
    const uw = makeDevice({
      id: 's20fe-uw-real',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 1,
      type: 'ultra-wide-angle',
    });
    const tele = makeDevice({
      id: 's20fe-tele-real',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 3,
      type: 'telephoto',
    });
    const cohort = classifyCohort([wide, uw, tele]);
    expect(cohort?.strategy).toBe('standalone-switch');
    expect(cohort?.primary.id).toBe('s20fe-wide-real');
    expect(cohort?.ultraWide?.id).toBe('s20fe-uw-real');
  });

  it('Pixel 8 standalone uw with own minZoom=1: type=ultra-wide-angle still wins', () => {
    // Pixel may expose its ultra-wide as both a child of the logical AND a
    // top-level standalone. The standalone reports its own minZoom=1 (same
    // reason as S20FE), but its `type` is still `'ultra-wide-angle'`. The
    // classifier should pair the logical primary with that standalone for
    // the island target — without relying on its minZoom being < 1.
    const logical = makeDevice({
      id: 'pixel-8-logical',
      isVirtualDevice: true,
      minZoom: 0.67,
      maxZoom: 20,
      physicalDevices: [{ focalLength: 2.2 }, { focalLength: 6.9 }, { focalLength: 19.4 }],
    });
    const standaloneUw = makeDevice({
      id: 'pixel-8-uw-type',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 1,
      type: 'ultra-wide-angle',
    });
    const cohort = classifyCohort([logical, standaloneUw]);
    expect(cohort?.strategy).toBe('standalone-switch');
    expect(cohort?.primary.id).toBe('pixel-8-logical');
    expect(cohort?.ultraWide?.id).toBe('pixel-8-uw-type');
  });

  it('S20FE variant where ultra-wide is not exposed → strategy=wide-only (no fake 0.5)', () => {
    // Rule 8: if the OS doesn't surface a sub-1× device, we don't invent one.
    // This is also the Pixel 6a path — single wide returns wide-only.
    const wide = makeDevice({
      id: 's20fe-wide-only',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 10,
    });
    const tele = makeDevice({
      id: 's20fe-tele',
      isVirtualDevice: false,
      minZoom: 1,
      maxZoom: 3,
    });
    const cohort = classifyCohort([wide, tele]);
    expect(cohort?.strategy).toBe('wide-only');
    expect(cohort?.ultraWide).toBeUndefined();
  });

  it('Pixel 8 logical 0.67 + standalone ultra-wide → strategy=standalone-switch, primary=logical, ultraWide=standalone', () => {
    // Pixel 8 shape: the logical multi-cam reaches only to 0.67 (Pixel
    // throttles ultra-wide reach in the logical session) but a separate
    // standalone ultra-wide device reports minZoom 0.5. To hit 0.5 the user
    // has to swap sessions — that's the island chip / standalone-switch case.
    const logical = makeDevice({
      id: 'pixel-8-logical',
      isVirtualDevice: true,
      minZoom: 0.67,
      maxZoom: 20,
      physicalDevices: [{ focalLength: 2.2 }, { focalLength: 6.9 }, { focalLength: 19.4 }],
    });
    const standaloneUw = makeDevice({
      id: 'pixel-8-uw',
      isVirtualDevice: false,
      minZoom: 0.5,
      maxZoom: 1,
    });
    const cohort = classifyCohort([logical, standaloneUw]);
    expect(cohort?.strategy).toBe('standalone-switch');
    expect(cohort?.primary.id).toBe('pixel-8-logical');
    expect(cohort?.ultraWide?.id).toBe('pixel-8-uw');
  });

  it('Xiaomi logical 0.5 with sibling standalone uw → strategy=logical, ultraWide not duplicated', () => {
    // Xiaomi/Oppo flavor: the OS reports both the logical virtual device
    // (minZoom 0.5) AND its constituent standalone ultra-wide as a sibling
    // entry. Since the logical already reaches 0.5 continuously, we should
    // NOT surface a separate `ultraWide` — that would suggest a session
    // switch is needed when it isn't.
    const logical = makeDevice({
      id: 'xiaomi-logical',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 15,
      physicalDevices: [{ focalLength: 1.6 }, { focalLength: 5.4 }],
    });
    const standaloneUw = makeDevice({
      id: 'xiaomi-uw-standalone',
      isVirtualDevice: false,
      minZoom: 0.6,
      maxZoom: 1,
    });
    const cohort = classifyCohort([logical, standaloneUw]);
    expect(cohort?.strategy).toBe('logical');
    expect(cohort?.primary.id).toBe('xiaomi-logical');
    expect(cohort?.ultraWide).toBeUndefined();
  });

  it('iOS triple-camera (virtual, minZoom 0.5) → strategy=logical, primary=triple, no standalone children', () => {
    // iPhone 15 Pro shape: VisionCamera's iOS path reports a single virtual
    // Triple-Camera device whose minZoom reaches 0.5. Dial stays continuous
    // [0.5, maxZoom]; no island chip needed.
    const triple = makeDevice({
      id: 'ios-triple',
      isVirtualDevice: true,
      minZoom: 0.5,
      maxZoom: 30,
      physicalDevices: [
        { type: 'ultra-wide-angle', focalLength: 1.5 },
        { type: 'wide-angle', focalLength: 5.7 },
        { type: 'telephoto', focalLength: 17 },
      ],
    });
    const cohort = classifyCohort([triple]);
    expect(cohort).not.toBeNull();
    expect(cohort?.strategy).toBe('logical');
    expect(cohort?.primary.id).toBe('ios-triple');
    expect(cohort?.ultraWide).toBeUndefined();
  });
});
