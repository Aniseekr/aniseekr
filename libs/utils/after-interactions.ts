// React Native 0.87 removed InteractionManager; requestIdleCallback is the
// replacement. Same shape as runAfterInteractions so call sites keep `.cancel()`.
// The timeout guarantees the work still runs when the JS thread never idles.

const IDLE_TIMEOUT_MS = 500;

export function runAfterInteractions(task: () => void): { cancel: () => void } {
  const handle = requestIdleCallback(() => task(), { timeout: IDLE_TIMEOUT_MS });
  return { cancel: () => cancelIdleCallback(handle) };
}
