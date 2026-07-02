import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_CAMERA_SETTINGS,
  DEFAULT_OVERLAY_OPACITY_BY_MODE,
} from '../../../libs/services/pilgrimage/camera-settings';
import { mergeCameraSettingsPatch } from '../../../hooks/useCameraSettings';

describe('mergeCameraSettingsPatch', () => {
  it('applies functional patches against the latest settings snapshot', () => {
    const latestSettings = {
      ...DEFAULT_CAMERA_SETTINGS,
      captureMode: 'auto' as const,
      countdownSeconds: 5 as const,
      overlayOpacityByMode: {
        ...DEFAULT_OVERLAY_OPACITY_BY_MODE,
        anime: 0.2,
      },
    };

    const next = mergeCameraSettingsPatch(latestSettings, (current) => ({
      overlayOpacityByMode: {
        ...current.overlayOpacityByMode,
        edge: 0.4,
      },
    }));

    expect(next.captureMode).toBe('auto');
    expect(next.countdownSeconds).toBe(5);
    expect(next.overlayOpacityByMode.anime).toBe(0.2);
    expect(next.overlayOpacityByMode.edge).toBe(0.4);
  });

  it('keeps object patches as shallow settings merges', () => {
    const next = mergeCameraSettingsPatch(DEFAULT_CAMERA_SETTINGS, { captureMode: 'auto' });

    expect(next.captureMode).toBe('auto');
    expect(next.overlayOpacityByMode).toEqual(DEFAULT_OVERLAY_OPACITY_BY_MODE);
  });
});
