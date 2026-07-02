import { describe, expect, it } from 'bun:test';
import {
  cameraHudInitialState,
  cameraHudReducer,
  INITIAL_CAMERA_HUD,
  type CameraHudState,
} from '../../../hooks/useCameraHud';
import { DEFAULT_OVERLAY_OPACITY_BY_MODE } from '../../../libs/services/pilgrimage/camera-settings';

describe('cameraHudReducer', () => {
  it('seeds sensible HUD defaults', () => {
    expect(INITIAL_CAMERA_HUD.facing).toBe('back');
    // Default flipped to 'edge' because the anime bitmap overlay fully
    // covers the live preview at the default opacity — newcomers couldn't
    // see the camera. Persisted overlayMode (in CameraSettings) restores
    // the user's actual pick on subsequent launches.
    expect(INITIAL_CAMERA_HUD.overlayMode).toBe('edge');
    expect(INITIAL_CAMERA_HUD.overlayVisible).toBe(true);
    expect(INITIAL_CAMERA_HUD.quickControlsOpen).toBe(true);
    expect(INITIAL_CAMERA_HUD.captureModeToast).toBeNull();
  });

  it('merges an object patch over the current state', () => {
    const next = cameraHudReducer(INITIAL_CAMERA_HUD, { aspect: 'full', evValue: 1.5 });
    expect(next.aspect).toBe('full');
    expect(next.evValue).toBe(1.5);
    // Untouched fields are preserved.
    expect(next.facing).toBe('back');
  });

  it('applies a functional patch against the live state (toggles, cycles)', () => {
    const opened = cameraHudReducer(INITIAL_CAMERA_HUD, (h) => ({
      editMode: !h.editMode,
    }));
    expect(opened.editMode).toBe(true);
    const closed = cameraHudReducer(opened, (h) => ({ editMode: !h.editMode }));
    expect(closed.editMode).toBe(false);
  });

  it('does not mutate the previous state object', () => {
    const before: CameraHudState = { ...INITIAL_CAMERA_HUD };
    const next = cameraHudReducer(before, { settingsOpen: true });
    expect(next).not.toBe(before);
    expect(before.settingsOpen).toBe(false);
    expect(next.settingsOpen).toBe(true);
  });

  it('lets one patch update several related fields at once', () => {
    const next = cameraHudReducer(INITIAL_CAMERA_HUD, {
      overlayMode: 'edge',
      overlayVisible: true,
      switchToast: { icon: 'analytics-outline', label: 'Edge' },
    });
    expect(next.overlayMode).toBe('edge');
    expect(next.switchToast?.label).toBe('Edge');
  });
});

describe('cameraHudInitialState', () => {
  it('seeds the four persisted overlay knobs from the settings argument', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'anime',
      edgeIntensity: 'high',
      subjectFocus: 'wide',
      subjectCombine: true,
      overlayOpacityByMode: DEFAULT_OVERLAY_OPACITY_BY_MODE,
    });
    expect(seeded.overlayMode).toBe('anime');
    expect(seeded.edgeIntensity).toBe('high');
    expect(seeded.subjectFocus).toBe('wide');
    expect(seeded.subjectCombine).toBe(true);
  });

  it('leaves every non-overlay HUD default untouched', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'sketch',
      edgeIntensity: 'mid',
      subjectFocus: 'tight',
      subjectCombine: false,
      overlayOpacityByMode: DEFAULT_OVERLAY_OPACITY_BY_MODE,
    });
    expect(seeded.facing).toBe(INITIAL_CAMERA_HUD.facing);
    expect(seeded.aspect).toBe(INITIAL_CAMERA_HUD.aspect);
    expect(seeded.quickControlsOpen).toBe(INITIAL_CAMERA_HUD.quickControlsOpen);
    expect(seeded.orientationMode).toBe(INITIAL_CAMERA_HUD.orientationMode);
    expect(seeded.captureModeToast).toBeNull();
  });

  it('returns a fresh object, never the shared INITIAL_CAMERA_HUD', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'edge',
      edgeIntensity: 'low',
      subjectFocus: 'normal',
      subjectCombine: false,
      overlayOpacityByMode: DEFAULT_OVERLAY_OPACITY_BY_MODE,
    });
    expect(seeded).not.toBe(INITIAL_CAMERA_HUD);
    seeded.facing = 'front';
    expect(INITIAL_CAMERA_HUD.facing).toBe('back');
  });
});

describe('per-mode overlay opacity', () => {
  it('defaults edge high (sparse ink) and the anime bitmap low (dense)', () => {
    // Edge is sparse lines → needs more alpha to read; the anime bitmap covers
    // the live scene → needs less so the user can still frame the shot.
    expect(INITIAL_CAMERA_HUD.overlayOpacityByMode.edge).toBe(0.75);
    expect(INITIAL_CAMERA_HUD.overlayOpacityByMode.anime).toBe(0.35);
    expect(INITIAL_CAMERA_HUD.overlayOpacityByMode.edge).toBeGreaterThan(
      INITIAL_CAMERA_HUD.overlayOpacityByMode.anime
    );
  });

  it('seeds the per-mode opacity map from settings', () => {
    const seeded = cameraHudInitialState({
      overlayMode: 'edge',
      edgeIntensity: 'low',
      subjectFocus: 'normal',
      subjectCombine: false,
      overlayOpacityByMode: { anime: 0.2, edge: 0.9, sketch: 0.5, subject: 0.4 },
    });
    expect(seeded.overlayOpacityByMode.edge).toBe(0.9);
    expect(seeded.overlayOpacityByMode.anime).toBe(0.2);
  });

  it('back-fills missing modes from the defaults when the seed map is partial', () => {
    // An older persisted shape may only carry the modes the user touched.
    const seeded = cameraHudInitialState({
      overlayMode: 'edge',
      edgeIntensity: 'low',
      subjectFocus: 'normal',
      subjectCombine: false,
      overlayOpacityByMode: { edge: 0.6 } as Record<
        'anime' | 'edge' | 'sketch' | 'subject',
        number
      >,
    });
    expect(seeded.overlayOpacityByMode.edge).toBe(0.6);
    expect(seeded.overlayOpacityByMode.anime).toBe(DEFAULT_OVERLAY_OPACITY_BY_MODE.anime);
    expect(seeded.overlayOpacityByMode.subject).toBe(DEFAULT_OVERLAY_OPACITY_BY_MODE.subject);
  });

  it('keeps an edit to one mode from leaking into another (independent alphas)', () => {
    const next = cameraHudReducer(INITIAL_CAMERA_HUD, (h) => ({
      overlayOpacityByMode: { ...h.overlayOpacityByMode, edge: 0.5 },
    }));
    expect(next.overlayOpacityByMode.edge).toBe(0.5);
    // anime untouched.
    expect(next.overlayOpacityByMode.anime).toBe(0.35);
  });
});
