export function newsImageSource(url: string): { uri: string } | null {
  if (!url.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { uri: url };
}
