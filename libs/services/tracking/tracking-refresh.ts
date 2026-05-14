export function refreshTrackedIdsSafely(
  loadTrackedIds: () => Promise<Set<string>>,
  warn: (message: string, error: unknown) => void = console.warn
): void {
  void loadTrackedIds().catch((err) => {
    warn('[Tracking] background tracked-id refresh failed', err);
  });
}
