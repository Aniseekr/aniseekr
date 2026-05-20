import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BRACKET_EV_STOPS,
  CAMERA_SETTINGS_STORAGE_KEY,
  CAPTURE_MODES,
  DEFAULT_CAMERA_SETTINGS,
  clampBracketEvStops,
  loadCameraSettings,
  qualityToNumber,
  qualityToPrioritization,
  saveCameraSettings,
} from '../../../libs/services/pilgrimage/camera-settings';

describe('qualityToNumber', () => {
  it('maps PictureQuality to a numeric JPEG quality in 0..1', () => {
    expect(qualityToNumber('standard')).toBe(0.7);
    expect(qualityToNumber('high')).toBe(0.92);
    expect(qualityToNumber('max')).toBe(1.0);
  });
});

describe('qualityToPrioritization', () => {
  it("maps PictureQuality onto VisionCamera's QualityPrioritization", () => {
    expect(qualityToPrioritization('standard')).toBe('speed');
    expect(qualityToPrioritization('high')).toBe('balanced');
    expect(qualityToPrioritization('max')).toBe('quality');
  });
});

describe('CAPTURE_MODES', () => {
  it('drops the retired "hdr" mode and ships "auto" instead', () => {
    expect([...CAPTURE_MODES]).toEqual(['single', 'burst', 'auto']);
  });
});

describe('BRACKET_EV_STOPS', () => {
  it('is the symmetric [-2, 0, +2] stop set we hand to the bracket hook', () => {
    expect([...BRACKET_EV_STOPS]).toEqual([-2, 0, 2]);
  });
});

describe('clampBracketEvStops', () => {
  it('returns the stops unchanged when they already fit inside the device range', () => {
    expect(clampBracketEvStops([-2, 0, 2], -3, 3)).toEqual([-2, 0, 2]);
  });

  it('clamps a [-2, 0, +2] bracket against a [-1, +1] device range', () => {
    expect(clampBracketEvStops([-2, 0, 2], -1, 1)).toEqual([-1, 0, 1]);
  });

  it('clamps even when min/max are passed in reversed order', () => {
    // Defensive: a device reporting bias as (max, min) shouldn't crash this.
    expect(clampBracketEvStops([-2, 0, 2], 1, -1)).toEqual([-1, 0, 1]);
  });

  it('collapses to a single value when the device reports a degenerate range', () => {
    expect(clampBracketEvStops([-2, 0, 2], 0, 0)).toEqual([0, 0, 0]);
  });
});

describe('loadCameraSettings — v4 → auto migration', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('migrates a persisted captureMode === "hdr" to "auto" without resetting other prefs', async () => {
    await AsyncStorage.setItem(
      CAMERA_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_CAMERA_SETTINGS,
        captureMode: 'hdr',
        mute: true,
        countdownSeconds: 3,
      })
    );
    const loaded = await loadCameraSettings();
    expect(loaded.captureMode).toBe('auto');
    // Non-migrated fields should pass through untouched.
    expect(loaded.mute).toBe(true);
    expect(loaded.countdownSeconds).toBe(3);
  });

  it('passes through "single" / "burst" / "auto" without change', async () => {
    for (const mode of ['single', 'burst', 'auto'] as const) {
      await AsyncStorage.setItem(
        CAMERA_SETTINGS_STORAGE_KEY,
        JSON.stringify({ ...DEFAULT_CAMERA_SETTINGS, captureMode: mode })
      );
      const loaded = await loadCameraSettings();
      expect(loaded.captureMode).toBe(mode);
    }
  });

  it('falls back to the default mode when the persisted value is unrecognised garbage', async () => {
    await AsyncStorage.setItem(
      CAMERA_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_CAMERA_SETTINGS, captureMode: 'lasers' })
    );
    const loaded = await loadCameraSettings();
    expect(loaded.captureMode).toBe(DEFAULT_CAMERA_SETTINGS.captureMode);
  });

  it('round-trips an "auto" save through storage', async () => {
    await saveCameraSettings({ ...DEFAULT_CAMERA_SETTINGS, captureMode: 'auto' });
    const loaded = await loadCameraSettings();
    expect(loaded.captureMode).toBe('auto');
  });
});
