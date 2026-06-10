/**
 * Pure helpers for summarizing cold-start performance marks.
 *
 * Kept free of `react-native-performance` imports so `bun test` can exercise
 * the span math without the native module. `startup-trace.ts` owns the actual
 * Performance API wiring.
 */

export interface StartupMark {
  name: string;
  startTime: number;
}

export interface StartupMilestone {
  name: string;
  /** Milliseconds since `nativeLaunchStart`, rounded to 0.1 ms. */
  atMs: number;
}

export interface StartupSummary {
  /** `nativeLaunchStart` → `firstScreenInteractive`, rounded to 0.1 ms. */
  ttiMs: number;
  /** Milestones present in the input, in launch order. */
  milestones: StartupMilestone[];
}

/** Launch-ordered milestones we care about. Native marks come from
 *  react-native-performance; the last two are stamped by startup-trace.ts. */
const MILESTONE_ORDER = [
  'nativeLaunchStart',
  'nativeLaunchEnd',
  'runJsBundleStart',
  'runJsBundleEnd',
  'contentAppeared',
  'rootModuleEvaluated',
  'firstScreenInteractive',
] as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Anchor every mark to `nativeLaunchStart` and compute TTI.
 *
 * Returns `null` when either anchor mark is missing (web, unit tests, or a
 * JS reload where the native launch marks were never recorded) — per the
 * no-fake-data rule we report nothing rather than a guessed number.
 *
 * Duplicate mark names keep the earliest occurrence: a dev reload appends a
 * second `rootModuleEvaluated`, but the cold start is the first one.
 */
export function summarizeColdStart(marks: readonly StartupMark[]): StartupSummary | null {
  const byName = new Map<string, number>();
  for (const mark of marks) {
    if (!byName.has(mark.name)) {
      byName.set(mark.name, mark.startTime);
    }
  }

  const origin = byName.get('nativeLaunchStart');
  const end = byName.get('firstScreenInteractive');
  if (origin == null || end == null) return null;

  const milestones = MILESTONE_ORDER.filter((name) => byName.has(name)).map((name) => ({
    name,
    atMs: round1(byName.get(name)! - origin),
  }));

  return { ttiMs: round1(end - origin), milestones };
}
