export type CaptureModeCopyMode = 'single' | 'burst' | 'hdr';

export interface CaptureModeCopy {
  label: string;
  hint: string;
  icon: string;
}

export const CAPTURE_MODE_HELP_TEXT =
  'Single: one shot. Burst: 6 frames, keeps the best-aligned. HDR: hardware HDR when supported, otherwise multi-frame composite.';

const MODE_COPY: Record<CaptureModeCopyMode, CaptureModeCopy> = {
  single: { label: 'Photo', hint: 'One sharp shot', icon: 'camera-outline' },
  burst: {
    label: 'Burst',
    hint: 'Captures 6 frames, keeps the best-aligned',
    icon: 'albums-outline',
  },
  hdr: {
    label: 'HDR',
    hint: 'Uses multi-frame composite when hardware HDR is unavailable',
    icon: 'contrast-outline',
  },
};

export function captureModeToastCopy(
  mode: CaptureModeCopyMode,
  nativeHdrActive: boolean
): CaptureModeCopy {
  if (mode === 'hdr' && nativeHdrActive) {
    return {
      ...MODE_COPY.hdr,
      hint: 'Uses hardware HDR on this device',
    };
  }
  return MODE_COPY[mode];
}
