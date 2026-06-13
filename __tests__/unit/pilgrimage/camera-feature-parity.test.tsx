import { describe, expect, it, mock } from 'bun:test';
import en from '../../../libs/i18n/locales/en.json';
import {
  CAPTURE_MODE_HELP_TEXT,
  captureModeToastCopy,
} from '../../../libs/services/pilgrimage/capture-mode-copy';
import {
  preferredPhysicalDevicesForFacing,
  pickResolvedPhotoDimensions,
} from '../../../libs/services/pilgrimage/camera-engine-parity';
import { findAll, render } from './render-helpers';

// English catalog lookup — ShutterRow resolves its accessibility labels via
// useT(), and en is the default test language.
const tEn = (key: string): string =>
  (key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      en
    ) as string) ?? key;

mock.module('../../../libs/i18n', () => ({
  useT: () => tEn,
}));

const { default: ShutterRow } = await import('../../../components/pilgrimage/camera/ShutterRow');

const noop = () => undefined;

describe('camera feature parity', () => {
  it('uses the public VisionCamera entry with the worklets peer installed', async () => {
    const runtimeSourcePaths = [
      'app/(tabs)/pilgrimage/compare/[spotId].tsx',
      'app/(tabs)/pilgrimage/compare/tips.tsx',
      'components/pilgrimage/camera/CameraStage.tsx',
    ];

    for (const sourcePath of runtimeSourcePaths) {
      const source = await Bun.file(sourcePath).text();
      expect(source).not.toContain('react-native-vision-camera/lib/');
      expect(source).not.toContain('frameProcessor');
    }

    const manifest = await Bun.file('package.json').json();
    expect(manifest.dependencies['react-native-vision-camera-worklets']).toBe('5.0.11');
    expect(manifest.dependencies['react-native-worklets']).toBe('0.8.3');
    expect(manifest.scripts.postinstall).toContain('patch-react-native-worklets');

    const workletsPatch = await Bun.file('scripts/patch-react-native-worklets.mjs').text();
    expect(workletsPatch).toContain('React_Core/RCTMessageThread.h');
  });

  it('drives photo orientation off the physical device so portrait shots stay portrait', async () => {
    const stageSource = await Bun.file('components/pilgrimage/camera/CameraStage.tsx').text();
    expect(stageSource).toContain('orientationSource="device"');
    expect(stageSource).not.toContain('orientationSource="interface"');
  });

  it('prefers the combined back-camera device so zoom pillars can switch physical lenses', () => {
    expect(preferredPhysicalDevicesForFacing('back')).toEqual([
      'ultra-wide-angle',
      'wide-angle',
      'telephoto',
    ]);
    expect(preferredPhysicalDevicesForFacing('front')).toEqual(['wide-angle']);
  });

  it('uses decoded photo dimensions ahead of VisionCamera target dimensions', () => {
    expect(
      pickResolvedPhotoDimensions({
        decoded: { width: 4032, height: 3024 },
        fallback: { width: 3024, height: 4032 },
      })
    ).toEqual({ width: 4032, height: 3024 });

    expect(
      pickResolvedPhotoDimensions({
        decoded: null,
        fallback: { width: 3024, height: 4032 },
      })
    ).toEqual({ width: 3024, height: 4032 });

    expect(
      pickResolvedPhotoDimensions({
        decoded: { width: 0, height: 0 },
        fallback: { width: NaN, height: 0 },
      })
    ).toEqual({ width: 0, height: 0 });
  });

  it('keeps capture mode copy aligned with the real capture implementations', () => {
    expect(CAPTURE_MODE_HELP_TEXT).toContain('best-aligned');
    expect(CAPTURE_MODE_HELP_TEXT).toContain('hardware HDR');
    expect(CAPTURE_MODE_HELP_TEXT).not.toContain('sharpest');
    expect(CAPTURE_MODE_HELP_TEXT).not.toContain('blends 3 exposures');

    expect(captureModeToastCopy('burst', false).hint).toContain('best-aligned');
    // 'auto' is the replacement for the retired 'hdr' mode. When the scene
    // analyzer agrees AND the device has native photo-HDR, the toast advertises
    // hardware HDR. Otherwise it describes the bracket fallback honestly.
    expect(captureModeToastCopy('auto', true).hint).toContain('hardware HDR');
    expect(captureModeToastCopy('auto', false).hint).toContain('bracket');
    expect(captureModeToastCopy('auto', true).hint).not.toContain('Android');
  });

  it('wires the animate-shutter setting into visible shutter feedback', () => {
    const base = {
      themeColor: '#ff9900',
      capturing: true,
      isLandscape: false,
      isFrontFacing: false,
      onShutter: noop,
      onPickLibrary: noop,
      onFlip: noop,
    };

    const animated = render(ShutterRow, { ...base, animateCapture: true });
    const still = render(ShutterRow, { ...base, animateCapture: false });

    expect(findAll(animated, (n) => n.props.testID === 'shutter-pulse').length).toBeGreaterThan(0);
    expect(findAll(still, (n) => n.props.testID === 'shutter-pulse')).toHaveLength(0);
  });
});
