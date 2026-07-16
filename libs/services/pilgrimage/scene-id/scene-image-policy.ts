export const SCENE_IMAGE_MAX_UPLOAD_WIDTH = 640;

export interface SceneImageDisposable {
  exists: boolean;
  delete(): void;
}

export function getSceneImageResize(sourceWidth: number): { width: number; height: null } | null {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= SCENE_IMAGE_MAX_UPLOAD_WIDTH) return null;
  return { width: SCENE_IMAGE_MAX_UPLOAD_WIDTH, height: null };
}

export function disposeSceneImageFiles(files: readonly SceneImageDisposable[]): void {
  for (const file of files) {
    try {
      if (file.exists) file.delete();
    } catch {
      // Cache cleanup is best effort; the OS also owns this directory.
    }
  }
}
