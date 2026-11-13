// Pro: sync every connected platform when the app comes to the foreground, at
// most once per interval. It runs the same `syncAll()` as the Sync hub button,
// so merges, conflicts and the write queue follow exactly the same rules.
// Off until the user turns it on in the Sync hub.
import { kvGet, kvSet } from '../storage/app-storage';
import { SYNC_LAST_RUN_KEY, SYNC_PREFS_KEY } from '../storage/keys';
import { authService } from '../auth/auth-service';
import { multiPlatformSyncService } from './multi-platform-sync-service';

export const AUTO_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function isAutoSyncEnabled(): boolean {
  try {
    const parsed: unknown = JSON.parse(kvGet(SYNC_PREFS_KEY) ?? 'null');
    return (
      typeof parsed === 'object' && parsed !== null && (parsed as { auto?: unknown }).auto === true
    );
  } catch {
    return false;
  }
}

export function setAutoSyncEnabled(enabled: boolean): void {
  kvSet(SYNC_PREFS_KEY, JSON.stringify({ auto: enabled }));
}

export function getLastAutoSyncAt(): number | null {
  const at = Number(kvGet(SYNC_LAST_RUN_KEY));
  return Number.isFinite(at) && at > 0 ? at : null;
}

export function shouldAutoSync(input: {
  isPro: boolean;
  enabled: boolean;
  connectedPlatforms: number;
  lastRunAt: number | null;
  now: number;
}): boolean {
  if (!input.isPro || !input.enabled || input.connectedPlatforms === 0) return false;
  return input.lastRunAt === null || input.now - input.lastRunAt >= AUTO_SYNC_INTERVAL_MS;
}

/** Resolves true when a sync actually ran. Never throws. */
export async function maybeAutoSync(isPro: boolean): Promise<boolean> {
  try {
    if (!isPro || !isAutoSyncEnabled()) return false;
    await authService.initialize();
    const now = Date.now();
    const due = shouldAutoSync({
      isPro,
      enabled: true,
      connectedPlatforms: authService.getConnectedPlatforms().length,
      lastRunAt: getLastAutoSyncAt(),
      now,
    });
    if (!due) return false;
    // Stamp first: a failing platform must not retry on every foreground.
    kvSet(SYNC_LAST_RUN_KEY, String(now));
    const result = await multiPlatformSyncService.syncAll();
    if (result.errors.length > 0) console.warn('[auto-sync] partial failure', result.errors);
    return true;
  } catch (error) {
    console.warn('[auto-sync] failed', error);
    return false;
  }
}
