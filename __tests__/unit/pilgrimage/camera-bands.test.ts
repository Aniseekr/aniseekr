import { describe, expect, it } from 'bun:test';
import {
  CAMERA_ZOOM_BAND_HEIGHT,
  CAMERA_CAROUSEL_BAND_HEIGHT,
  CAMERA_BOTTOM_ROW_HEIGHT,
  CAMERA_BAND_GAP,
  resolveCameraBandLayout,
  resolveCameraChromeVisibility,
} from '../../../libs/services/pilgrimage/camera-ui';
import { CameraChrome } from '../../../components/pilgrimage/camera/cameraChrome';

describe('camera band layout', () => {
  it('stacks shutter → carousel → zoom from the bottom inset without overlap', () => {
    const l = resolveCameraBandLayout({ bottomInset: 20, showZoomBand: true });
    expect(l.shutterRowBottom).toBe(20);
    expect(l.shutterRowHeight).toBe(CAMERA_BOTTOM_ROW_HEIGHT);
    expect(l.carouselBottom).toBe(20 + CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP);
    expect(l.zoomBandBottom).toBe(l.carouselBottom + CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP);
    // no overlap: each band's bottom is at/above the previous band's top
    expect(l.carouselBottom).toBeGreaterThanOrEqual(l.shutterRowBottom + l.shutterRowHeight);
    expect(l.zoomBandBottom).toBeGreaterThanOrEqual(l.carouselBottom + l.carouselHeight);
  });

  it('produces the SAME stacking math regardless of orientation (no side-column reflow)', () => {
    const a = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: true });
    const b = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: true });
    expect(a).toEqual(b);
  });

  it('drops the zoom band from the total chrome height when it is hidden', () => {
    const shown = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: true });
    const hidden = resolveCameraBandLayout({ bottomInset: 0, showZoomBand: false });
    expect(hidden.totalBottomChromeHeight).toBeLessThan(shown.totalBottomChromeHeight);
    expect(shown.totalBottomChromeHeight).toBe(
      CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT + CAMERA_BAND_GAP + CAMERA_ZOOM_BAND_HEIGHT,
    );
    expect(hidden.totalBottomChromeHeight).toBe(
      CAMERA_BOTTOM_ROW_HEIGHT + CAMERA_BAND_GAP + CAMERA_CAROUSEL_BAND_HEIGHT,
    );
  });
});

describe('camera chrome visibility (immersive by subtraction)', () => {
  it('shows everything relevant in portrait', () => {
    const v = resolveCameraChromeVisibility({ isLandscape: false, immersive: true, afLocked: true, overlayActive: true });
    expect(v.showZoomBand).toBe(true);
    expect(v.showOpacityPill).toBe(true);
    expect(v.showTopContextIcons).toBe(true);
    expect(v.showCaptureHistory).toBe(true);
    expect(v.showOverlayQuickControls).toBe(true);
  });

  it('subtracts secondary controls only in landscape immersive, keeping shutter+carousel+alignment', () => {
    const v = resolveCameraChromeVisibility({ isLandscape: true, immersive: true, afLocked: false, overlayActive: true });
    expect(v.showZoomBand).toBe(false);
    expect(v.showOpacityPill).toBe(false);
    expect(v.showTopContextIcons).toBe(false);
    expect(v.showCaptureHistory).toBe(false);
    expect(v.showAutoCaptureBadge).toBe(true); // alignment readout stays
  });

  it('reveals everything again in landscape when not immersive', () => {
    const v = resolveCameraChromeVisibility({ isLandscape: true, immersive: false, afLocked: false, overlayActive: true });
    expect(v.showZoomBand).toBe(true);
    expect(v.showTopContextIcons).toBe(true);
  });

  it('gates the opacity pill and quick-controls on an active overlay', () => {
    const off = resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: false, overlayActive: false });
    expect(off.showOpacityPill).toBe(false);
    expect(off.showOverlayQuickControls).toBe(false);
  });

  it('shows the transient focus/EV bar only while AF is locked', () => {
    expect(resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: true, overlayActive: false }).showFocusExposureBar).toBe(true);
    expect(resolveCameraChromeVisibility({ isLandscape: false, immersive: false, afLocked: false, overlayActive: false }).showFocusExposureBar).toBe(false);
  });
});

describe('camera scrim tokens', () => {
  it('keeps the always-glass control fill pinned', () => {
    expect(CameraChrome.controlFill).toBe('rgba(0,0,0,0.4)');
  });

  it('exposes top and bottom scrim gradients that fade to transparent', () => {
    expect(Array.isArray(CameraChrome.scrimTopColors)).toBe(true);
    expect(Array.isArray(CameraChrome.scrimBottomColors)).toBe(true);
    expect(CameraChrome.scrimTopColors).toContain('rgba(0,0,0,0)');
    expect(CameraChrome.scrimBottomColors).toContain('rgba(0,0,0,0)');
    expect(CameraChrome.scrimTopHeight).toBeGreaterThan(0);
    expect(CameraChrome.scrimBottomHeight).toBeGreaterThan(0);
  });
});
