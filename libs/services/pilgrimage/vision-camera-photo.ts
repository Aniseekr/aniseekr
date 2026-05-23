import {
  pickResolvedPhotoDimensions,
  resolveCapturedPhotoDimensions,
  type PhotoDimensions,
} from './camera-engine-parity';

const FILE_SCHEME = 'file://';
const DEFAULT_JPEG_QUALITY_PERCENT = 92;

export interface PipelineImageLike {
  readonly width: number;
  readonly height: number;
  saveToTemporaryFileAsync(format: 'jpg', quality?: number): Promise<string>;
  dispose?: () => void;
}

export interface PipelinePhotoLike {
  readonly width: number;
  readonly height: number;
  toImageAsync(): Promise<PipelineImageLike>;
  saveToTemporaryFileAsync(): Promise<string>;
}

export interface PersistPhotoForSkiaPipelineOptions {
  targetResolution: PhotoDimensions;
  quality: number;
}

export interface PersistedPipelinePhoto {
  uri: string;
  width: number;
  height: number;
}

// VisionCamera and NitroImage report saved paths without a scheme. The rest
// of the app expects file URIs for Skia, expo-file-system, and expo-image.
export function pathToFileUri(path: string): string {
  if (path.startsWith(FILE_SCHEME) || path.startsWith('http')) return path;
  return path.startsWith('/') ? `${FILE_SCHEME}${path}` : `${FILE_SCHEME}/${path}`;
}

export function normalizeJpegQualityPercent(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_JPEG_QUALITY_PERCENT;
  const percent = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

function validDimensions(dimensions: PhotoDimensions): boolean {
  return (
    Number.isFinite(dimensions.width) &&
    dimensions.width > 0 &&
    Number.isFinite(dimensions.height) &&
    dimensions.height > 0
  );
}

async function persistRawPhotoFallback(
  photo: PipelinePhotoLike,
  targetResolution: PhotoDimensions
): Promise<PersistedPipelinePhoto> {
  const savedPath = await photo.saveToTemporaryFileAsync();
  const uri = pathToFileUri(savedPath);
  const fast: PhotoDimensions = { width: photo.width, height: photo.height };
  const dimensions = validDimensions(fast)
    ? pickResolvedPhotoDimensions({ decoded: fast, fallback: targetResolution })
    : await resolveCapturedPhotoDimensions(uri, targetResolution);
  return { uri, width: dimensions.width, height: dimensions.height };
}

export async function persistPhotoForSkiaPipeline(
  photo: PipelinePhotoLike,
  options: PersistPhotoForSkiaPipelineOptions
): Promise<PersistedPipelinePhoto> {
  let image: PipelineImageLike | null = null;
  try {
    image = await photo.toImageAsync();
    const savedPath = await image.saveToTemporaryFileAsync(
      'jpg',
      normalizeJpegQualityPercent(options.quality)
    );
    const uri = pathToFileUri(savedPath);
    const fast: PhotoDimensions = { width: image.width, height: image.height };
    const dimensions = validDimensions(fast)
      ? pickResolvedPhotoDimensions({ decoded: fast, fallback: options.targetResolution })
      : await resolveCapturedPhotoDimensions(uri, options.targetResolution);
    return { uri, width: dimensions.width, height: dimensions.height };
  } catch (error) {
    console.warn('[vision-camera-photo] orientation bake failed; saving raw photo', error);
    return persistRawPhotoFallback(photo, options.targetResolution);
  } finally {
    image?.dispose?.();
  }
}
