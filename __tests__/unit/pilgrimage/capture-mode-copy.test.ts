import { describe, expect, it } from 'bun:test';
import {
  CAPTURE_MODE_HELP_TEXT_KEY,
  captureModeToastCopy,
  type CaptureModeCopyMode,
} from '../../../libs/services/pilgrimage/capture-mode-copy';
import { translate } from '../../../libs/i18n/engine';

describe('capture mode copy', () => {
  it('returns translation keys that resolve to the English label/hint', () => {
    const single = captureModeToastCopy('single', false);
    expect(single.icon).toBe('camera-outline');
    expect(translate('en', single.label)).toBe('Photo');
    expect(translate('en', single.hint)).toBe('One sharp shot');

    const burst = captureModeToastCopy('burst', false);
    expect(translate('en', burst.label)).toBe('Burst');
    expect(translate('en', burst.hint)).toBe('Captures 6 frames, keeps the best-aligned');

    const auto = captureModeToastCopy('auto', false);
    expect(translate('en', auto.label)).toBe('Auto');
    expect(translate('en', auto.hint)).toBe(
      'Detects high-contrast scenes and brackets exposure when needed'
    );
  });

  it('swaps in the hardware-HDR hint key when native HDR is active for auto mode', () => {
    const hdr = captureModeToastCopy('auto', true);
    expect(translate('en', hdr.hint)).toBe(
      'High-contrast scene — using hardware HDR on this device'
    );
    // Non-auto modes ignore the HDR flag.
    expect(translate('en', captureModeToastCopy('single', true).hint)).toBe('One sharp shot');
  });

  it('exposes the help-text key resolving to the full help copy', () => {
    expect(translate('en', CAPTURE_MODE_HELP_TEXT_KEY)).toBe(
      'Single: one shot. Burst: 6 frames, keeps the best-aligned. Auto: detects high-contrast scenes and brackets exposure when needed (uses hardware HDR if supported).'
    );
  });

  it('resolves the Traditional Chinese label for single mode', () => {
    expect(translate('zh-Hant', captureModeToastCopy('single', false).label)).toBe('照片');
  });

  it('keeps the type as CaptureModeCopyMode (single | burst | auto)', () => {
    const modes: CaptureModeCopyMode[] = ['single', 'burst', 'auto'];
    expect(modes).toHaveLength(3);
  });
});
