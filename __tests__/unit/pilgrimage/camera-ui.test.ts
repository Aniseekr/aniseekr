import { describe, expect, it } from 'bun:test';
import {
  cameraOrientationLockIntent,
  CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET,
  CAMERA_TOOL_MENU_MIN_PANEL_WIDTH,
  CAMERA_TOOL_MENU_PANEL_GAP,
  CAMERA_TOOL_MENU_PANEL_WIDTH,
  CAMERA_TOOL_MENU_TRIGGER_HEIGHT,
  formatCameraHeader,
  isCameraCapturePath,
  resolveCameraToolMenuLayout,
  resolveCameraActive,
  resolveTransientCameraHudVisibility,
  roundExposureValue,
} from '../../../libs/services/pilgrimage/camera-ui';

describe('camera UI helpers', () => {
  it('keeps the camera top bar generic and English instead of showing raw spot names', () => {
    const header = formatCameraHeader({
      sceneName: '町田駅北口',
      animeTitle: 'Date A Live',
      ep: '4',
    });

    expect(header.title).toBe('Scene Match');
    expect(header.subtitle).toBe('Date A Live · EP 4');
    expect(header.title).not.toContain('町田');
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

  it('treats the camera tool menu as a popover floating above its dock trigger', () => {
    expect(CAMERA_TOOL_MENU_PANEL_WIDTH).toBeGreaterThan(CAMERA_TOOL_MENU_TRIGGER_HEIGHT);
    expect(CAMERA_TOOL_MENU_PANEL_GAP).toBeGreaterThanOrEqual(8);
    expect(CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET).toBeGreaterThanOrEqual(12);
  });

  it('places the landscape tool menu above the dock while clearing the shutter image rail', () => {
    const layout = resolveCameraToolMenuLayout({
      isLandscape: true,
      safeAreaBottomPad: 6,
      portraitDockBottom: 240,
      shutterRailWidth: 100,
    });

    expect(layout.bottomOffset).toBe(
      6 +
        CAMERA_TOOL_MENU_DOCK_BOTTOM_OFFSET +
        CAMERA_TOOL_MENU_TRIGGER_HEIGHT +
        CAMERA_TOOL_MENU_PANEL_GAP
    );
    expect(layout.rightOffset).toBe(116);
  });

  it('uses the AF-raised portrait dock as the popover anchor', () => {
    const layout = resolveCameraToolMenuLayout({
      isLandscape: false,
      safeAreaBottomPad: 0,
      portraitDockBottom: 178,
      shutterRailWidth: 100,
    });

    expect(layout.bottomOffset).toBe(
      178 + CAMERA_TOOL_MENU_TRIGGER_HEIGHT + CAMERA_TOOL_MENU_PANEL_GAP
    );
    expect(layout.rightOffset).toBe(16);
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
