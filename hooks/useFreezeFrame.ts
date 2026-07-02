// Android lens-swap freeze-frame state.
//
// During a CameraX session swap the live preview goes black for ~200–400ms.
// To hide that, the route grabs a snapshot of the OLD lens right before the
// swap and paints it as a still overlay until the new session is up. This hook
// owns that snapshot URI plus the temp-file lifecycle:
//
//   - `setFreezeFrameUri(uri)` updates BOTH the rendered state AND a ref mirror
//     IN THE SETTER — never in the render body. (The old route wrote
//     `freezeFrameUriRef.current = state` on every render, a render-phase side
//     effect. CLAUDE.md Rule 9.)
//   - `getFreezeFrameUri()` reads the latest URI from the ref so cleanup paths
//     (rapid double-tap, unmount) see the freshest value without depending on a
//     stale render closure.
//   - When `isSwitching` flips false and a freeze-frame is present, it is
//     cleared after the warmup fade (~260ms) and its temp file deleted.
//   - On unmount any pending temp file is swept so backgrounded swaps don't leak.
//
// iOS never produces a freeze-frame (PreviewView.takeSnapshot is Android-only),
// so on iOS `freezeFrameUri` simply stays null and every effect is a no-op.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export interface UseFreezeFrameInput {
  /** True while the strategic lens-switch FSM is mid-swap. */
  isSwitching: boolean;
  /**
   * File deleter — defaults to a best-effort `FileSystem.deleteAsync`. Injectable
   * so the route can share one stable deleter and tests can stub it.
   */
  deleteFile?: (uri: string) => void;
}

export interface UseFreezeFrameResult {
  freezeFrameUri: string | null;
  /** Sets the rendered URI and mirrors it into the ref in the same call. */
  setFreezeFrameUri: (uri: string | null) => void;
  /** Latest URI from the ref mirror — safe to read in cleanup closures. */
  getFreezeFrameUri: () => string | null;
}

const defaultDeleteFile = (uri: string): void => {
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
};

export function useFreezeFrame({
  isSwitching,
  deleteFile = defaultDeleteFile,
}: UseFreezeFrameInput): UseFreezeFrameResult {
  const [freezeFrameUri, setFreezeFrameUriState] = useState<string | null>(null);
  // Mirror so cleanup paths can read the latest URI without a stale closure.
  // Written ONLY inside the setter below — never in the render body.
  const freezeFrameUriRef = useRef<string | null>(null);

  const setFreezeFrameUri = useCallback((uri: string | null) => {
    freezeFrameUriRef.current = uri;
    setFreezeFrameUriState(uri);
  }, []);

  const getFreezeFrameUri = useCallback(() => freezeFrameUriRef.current, []);

  // Clear the freeze-frame once the new session is up and the warmup overlay
  // has finished its fade-out (~260ms). Also delete the temp file so we don't
  // leak ~100 kB JPEGs into the cache each swap.
  useEffect(() => {
    if (isSwitching) return;
    if (!freezeFrameUri) return;
    const uri = freezeFrameUri;
    const timer = setTimeout(() => {
      setFreezeFrameUri(null);
      // Best-effort cleanup; if the file vanished already or the path is
      // malformed we just move on. No error toast — the snapshot is purely a
      // visual nicety; failure should never reach the user.
      deleteFile(uri);
    }, 260);
    return () => clearTimeout(timer);
  }, [isSwitching, freezeFrameUri, deleteFile, setFreezeFrameUri]);

  // Always sweep the temp file on unmount so backgrounded swaps don't leak.
  useEffect(() => {
    return () => {
      const pending = freezeFrameUriRef.current;
      if (pending) deleteFile(pending);
    };
  }, [deleteFile]);

  return { freezeFrameUri, setFreezeFrameUri, getFreezeFrameUri };
}
