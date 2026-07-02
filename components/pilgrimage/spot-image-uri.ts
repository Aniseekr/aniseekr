/** Only absolute http(s)/file URLs are renderable by expo-image. */
export function sanitizeImageUri(uri: string | null | undefined): string | null {
  if (typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  return /^(https?|file):\/\//.test(trimmed) ? trimmed : null;
}
