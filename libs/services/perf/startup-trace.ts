/**
 * Cold-start TTI tracing via react-native-performance.
 *
 * The native module records launch milestones on its own
 * (`nativeLaunchStart`, `runJsBundleEnd`, `contentAppeared`, …). This module
 * adds the two JS-side marks that close the loop:
 *
 *   rootModuleEvaluated     — root layout module scope finished evaluating
 *   firstScreenInteractive  — navigation container ready + one frame painted
 *
 * and records `coldStartTTI` = nativeLaunchStart → firstScreenInteractive as
 * a `measure`, so it shows up in DevTools / Perfetto timelines and can later
 * be forwarded to analytics.
 *
 * Only cold starts count: a process-global flag skips warm/hot resumes, and
 * a sanity bound discards reload-inflated numbers. When the anchor marks are
 * missing we report nothing — never a guessed value.
 */
import performance from 'react-native-performance';
import { summarizeColdStart, type StartupSummary } from './startup-spans';

declare global {
  var __aniseekrColdStartReported: boolean | undefined;
}

/** A "cold start" that took longer than this was actually a JS reload or a
 *  resumed process whose native marks predate the current bundle run. */
const COLD_START_SANITY_MS = 60_000;

let coldStartSummary: StartupSummary | null = null;

/** Call once at the root layout's module scope. */
export function markRootModuleEvaluated(): void {
  try {
    performance.mark('rootModuleEvaluated');
  } catch {
    // Performance API unavailable (unit tests) — tracing must never throw.
  }
}

/**
 * Call when the first screen is interactive (navigation ready + one frame
 * painted). Repeat calls and non-cold launches are no-ops.
 */
export function markFirstScreenInteractive(route: string): void {
  if (globalThis.__aniseekrColdStartReported) return;
  globalThis.__aniseekrColdStartReported = true;

  try {
    performance.mark('firstScreenInteractive', { detail: { route } });

    const summary = summarizeColdStart([
      ...performance.getEntriesByType('react-native-mark'),
      ...performance.getEntriesByType('mark'),
    ]);
    if (!summary || summary.ttiMs > COLD_START_SANITY_MS) return;

    coldStartSummary = summary;
    performance.measure('coldStartTTI', 'nativeLaunchStart', 'firstScreenInteractive');

    if (__DEV__) {
      const lines = summary.milestones
        .map((m) => `  ${m.atMs.toFixed(1).padStart(9)} ms  ${m.name}`)
        .join('\n');
      console.log(`[startup] cold-start TTI ${summary.ttiMs.toFixed(1)} ms → ${route}\n${lines}`);
    }
  } catch {
    // Performance API unavailable — tracing must never break launch.
  }
}

/** Cold-start summary for this process, or `null` when none was recorded. */
export function getColdStartSummary(): StartupSummary | null {
  return coldStartSummary;
}
