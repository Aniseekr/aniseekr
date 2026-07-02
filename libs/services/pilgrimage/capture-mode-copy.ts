import type { TranslationKey } from '../../i18n';

// User-facing CaptureMode union. Mirrors the persisted CaptureMode in
// camera-settings.ts — the retired 'hdr' value migrates to 'auto' on load, so
// nothing here ever needs to render 'hdr' copy.
export type CaptureModeCopyMode = 'single' | 'burst' | 'auto';

export interface CaptureModeCopy {
  /** Translation key — resolve with `t()` at the call site. */
  label: TranslationKey;
  /** Translation key — resolve with `t()` at the call site. */
  hint: TranslationKey;
  /** Ionicons glyph name — not user-facing text. */
  icon: string;
}

/** Translation key for the capture-mode help paragraph. Resolve with `t()`. */
export const CAPTURE_MODE_HELP_TEXT_KEY: TranslationKey = 'pilgrimageUi.captureModeHelp';

const MODE_COPY: Record<CaptureModeCopyMode, CaptureModeCopy> = {
  single: {
    label: 'pilgrimageUi.captureModeSingleLabel',
    hint: 'pilgrimageUi.captureModeSingleHint',
    icon: 'camera-outline',
  },
  burst: {
    label: 'pilgrimageUi.captureModeBurstLabel',
    hint: 'pilgrimageUi.captureModeBurstHint',
    icon: 'albums-outline',
  },
  auto: {
    label: 'pilgrimageUi.captureModeAutoLabel',
    hint: 'pilgrimageUi.captureModeAutoHint',
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
      hint: 'pilgrimageUi.captureModeAutoHintHdr',
    };
  }
  return MODE_COPY[mode];
}
