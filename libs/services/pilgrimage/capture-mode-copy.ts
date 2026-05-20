// User-facing CaptureMode union. Mirrors the persisted CaptureMode in
// camera-settings.ts — the retired 'hdr' value migrates to 'auto' on load, so
// nothing here ever needs to render 'hdr' copy.
export type CaptureModeCopyMode = 'single' | 'burst' | 'auto';

export interface CaptureModeCopy {
  label: string;
  hint: string;
  icon: string;
}

export const CAPTURE_MODE_HELP_TEXT =
  'Single: one shot. Burst: 6 frames, keeps the best-aligned. Auto: detects high-contrast scenes and brackets exposure when needed (uses hardware HDR if supported).';

const MODE_COPY: Record<CaptureModeCopyMode, CaptureModeCopy> = {
  single: { label: 'Photo', hint: 'One sharp shot', icon: 'camera-outline' },
  burst: {
    label: 'Burst',
    hint: 'Captures 6 frames, keeps the best-aligned',
    icon: 'albums-outline',
  },
  auto: {
    label: 'Auto',
    hint: 'Detects high-contrast scenes and brackets exposure when needed',
    icon: 'sparkles-outline',
  },
};

export function captureModeToastCopy(
  mode: CaptureModeCopyMode,
  nativeHdrActive: boolean
): CaptureModeCopy {
  if (mode === 'auto' && nativeHdrActive) {
    return {
      ...MODE_COPY.auto,
      hint: 'High-contrast scene — using hardware HDR on this device',
    };
  }
  return MODE_COPY[mode];
}
