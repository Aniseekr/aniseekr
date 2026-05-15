import { describe, expect, it } from 'bun:test';
import {
  cameraOrientationLockIntent,
  CAMERA_BOTTOM_BAR_CONTENT_HEIGHT,
  CAMERA_SIDE_RAIL_WIDTH,
  CAMERA_TOOL_MENU_MIN_PANEL_WIDTH,
  CAMERA_TOOL_MENU_PANEL_GAP,
  CAMERA_TOOL_MENU_PANEL_WIDTH,
  CAMERA_TOP_BAR_CONTENT_HEIGHT,
  formatCameraHeader,
  isCameraCapturePath,
  resolveCameraToolMenuAnchor,
  resolveCameraPlaceBadgeLayout,
  resolveCameraActive,
  resolveTransientCameraHudVisibility,
  roundExposureValue,
} from '../../../libs/services/pilgrimage/camera-ui';

describe('camera UI helpers', () => {
  it('composes an English anime + episode line for the camera header subtitle', () => {
    const header = formatCameraHeader({
      sceneName: '町田駅北口',
      animeTitle: 'Date A Live',
      ep: '4',
    });

    expect(header.subtitle).toBe('Date A Live · EP 4');
  });

  it('falls back to English scene copy when anime metadata is missing', () => {
    expect(formatCameraHeader({ sceneName: '修学院駅', ep: '2' })).toEqual({
      title: 'Scene Match',
      subtitle: 'EP 2 · anime scene',
    });
  });

  it('only treats the dynamic capture screen as orientation-unlocked camera UI', () => {
    expect(isCameraCapturePath('/pilgrimage/compare/abc123')).toBe(true);
    expect(isCameraCapturePath('/pilgrimage/compare/tips')).toBe(false);
    expect(isCameraCapturePath('/pilgrimage/compare/align')).toBe(false);
    expect(isCameraCapturePath('/pilgrimage/compare/preview')).toBe(false);
    expect(isCameraCapturePath('/pilgrimage')).toBe(false);
  });

  it('requests flexible landscape instead of pinning the camera to the right side', () => {
    expect(cameraOrientationLockIntent('auto')).toBe('unlock');
    expect(cameraOrientationLockIntent('landscape')).toBe('landscape');
  });

  it('rounds AF exposure bar values to clamped one-decimal EV values', () => {
    expect(roundExposureValue(0.96)).toBe(1);
    expect(roundExposureValue(-4)).toBe(-2);
    expect(roundExposureValue(2.44)).toBe(2);
  });

  it('only keeps the native camera active while foregrounded and unobscured', () => {
    expect(resolveCameraActive({ appIsForeground: true, settingsOpen: false })).toBe(true);
    expect(resolveCameraActive({ appIsForeground: false, settingsOpen: false })).toBe(false);
    expect(resolveCameraActive({ appIsForeground: true, settingsOpen: true })).toBe(false);
  });

  it('keeps the camera tool menu panel wide enough for the nested control views', () => {
    expect(CAMERA_TOOL_MENU_PANEL_WIDTH).toBeGreaterThanOrEqual(CAMERA_TOOL_MENU_MIN_PANEL_WIDTH);
  });

  it('drops the tool menu popover just below the fixed top bar in portrait', () => {
    const anchor = resolveCameraToolMenuAnchor({
      topInset: 47,
      isLandscape: false,
    });

    expect(anchor.topOffset).toBe(47 + CAMERA_TOP_BAR_CONTENT_HEIGHT + CAMERA_TOOL_MENU_PANEL_GAP);
    expect(anchor.rightOffset).toBe(16);
    expect(anchor.leftOffset).toBeUndefined();
  });

  it('opens the landscape tool menu clear of the left rail', () => {
    const anchor = resolveCameraToolMenuAnchor({
      topInset: 24,
      isLandscape: true,
    });

    expect(anchor.topOffset).toBe(24 + CAMERA_TOOL_MENU_PANEL_GAP);
    expect(anchor.leftOffset).toBe(CAMERA_SIDE_RAIL_WIDTH + CAMERA_TOOL_MENU_PANEL_GAP);
    expect(anchor.rightOffset).toBeUndefined();
  });

  it('sizes the fixed letterbox chrome large enough for its controls', () => {
    expect(CAMERA_TOP_BAR_CONTENT_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(CAMERA_BOTTOM_BAR_CONTENT_HEIGHT).toBeGreaterThanOrEqual(120);
    expect(CAMERA_SIDE_RAIL_WIDTH).toBeGreaterThanOrEqual(72);
  });

  it('places the portrait place badge below the top camera function bar', () => {
    expect(
      resolveCameraPlaceBadgeLayout({
        isLandscape: false,
        topInset: 44,
        leftInset: 0,
        rightInset: 0,
        rightRailWidth: 0,
      })
    ).toEqual({
      top: 104,
      left: 16,
      right: 16,
    });
  });

  it('places the landscape place badge across the top of the camera window', () => {
    expect(
      resolveCameraPlaceBadgeLayout({
        isLandscape: true,
        topInset: 0,
        leftInset: 10,
        rightInset: 6,
        rightRailWidth: 124,
      })
    ).toEqual({
      top: 12,
      left: 126,
      right: 142,
    });
  });

  it('hides transient camera HUD layers while the More menu is open', () => {
    expect(resolveTransientCameraHudVisibility({ toolMenuOpen: true, afLocked: true })).toEqual({
      showAutoCaptureBadge: false,
      showCaptureHistory: false,
      showFocusExposureBar: false,
    });

    expect(resolveTransientCameraHudVisibility({ toolMenuOpen: false, afLocked: true })).toEqual({
      showAutoCaptureBadge: true,
      showCaptureHistory: true,
      showFocusExposureBar: true,
    });
  });
});
