// Whether Aniseekr's own Atlas host answers right now. Only probed while a
// screen that can fall back to an offline trip pack is mounted, so users
// without a pack never pay for it.
import { AppState } from 'react-native';
import { useEffect, useSyncExternalStore } from 'react';

export type Connectivity = 'unknown' | 'online' | 'offline';

const PROBE_URL = 'https://atlas.aniseekr.moe/meta.json';
const PROBE_TIMEOUT_MS = 4000;
const PROBE_MIN_INTERVAL_MS = 15_000;

let state: Connectivity = 'unknown';
let lastProbeAt = 0;
let inflight: Promise<Connectivity> | null = null;
const listeners = new Set<() => void>();

function set(next: Connectivity) {
  if (next === state) return;
  state = next;
  for (const l of listeners) l();
}

export function probeConnectivity(force = false): Promise<Connectivity> {
  if (inflight) return inflight;
  if (!force && state !== 'unknown' && Date.now() - lastProbeAt < PROBE_MIN_INTERVAL_MS) {
    return Promise.resolve(state);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  inflight = fetch(PROBE_URL, { method: 'HEAD', signal: controller.signal })
    .then(() => 'online' as const)
    .catch(() => 'offline' as const)
    .then((next) => {
      clearTimeout(timer);
      lastProbeAt = Date.now();
      inflight = null;
      set(next);
      return next;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;

/** Live connectivity; probes on mount and when the app returns to the foreground. */
export function useConnectivity(enabled: boolean): Connectivity {
  const value = useSyncExternalStore(subscribe, getState, getState);
  useEffect(() => {
    if (!enabled) return;
    void probeConnectivity();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void probeConnectivity(true);
    });
    return () => sub.remove();
  }, [enabled]);
  return enabled ? value : 'unknown';
}
