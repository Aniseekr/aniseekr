import { describe, expect, it } from 'bun:test';

import {
  summarizeColdStart,
  type StartupMark,
} from '../../../libs/services/perf/startup-spans';

function marks(entries: Record<string, number>): StartupMark[] {
  return Object.entries(entries).map(([name, startTime]) => ({ name, startTime }));
}

describe('summarizeColdStart', () => {
  it('returns null when nativeLaunchStart is missing (web / unit-test runtime)', () => {
    expect(summarizeColdStart(marks({ firstScreenInteractive: 500 }))).toBeNull();
  });

  it('returns null when firstScreenInteractive is missing', () => {
    expect(summarizeColdStart(marks({ nativeLaunchStart: 100 }))).toBeNull();
  });

  it('anchors milestones to nativeLaunchStart and computes TTI', () => {
    const summary = summarizeColdStart(
      marks({
        nativeLaunchStart: 1000,
        nativeLaunchEnd: 1320.61,
        runJsBundleStart: 1350,
        runJsBundleEnd: 1900,
        contentAppeared: 2050,
        rootModuleEvaluated: 1950,
        firstScreenInteractive: 2400.16,
      })
    );

    expect(summary).not.toBeNull();
    expect(summary!.ttiMs).toBe(1400.2);
    expect(summary!.milestones).toEqual([
      { name: 'nativeLaunchStart', atMs: 0 },
      { name: 'nativeLaunchEnd', atMs: 320.6 },
      { name: 'runJsBundleStart', atMs: 350 },
      { name: 'runJsBundleEnd', atMs: 900 },
      { name: 'contentAppeared', atMs: 1050 },
      { name: 'rootModuleEvaluated', atMs: 950 },
      { name: 'firstScreenInteractive', atMs: 1400.2 },
    ]);
  });

  it('skips milestones absent from the input instead of inventing them', () => {
    const summary = summarizeColdStart(
      marks({ nativeLaunchStart: 0, firstScreenInteractive: 800 })
    );

    expect(summary!.milestones.map((m) => m.name)).toEqual([
      'nativeLaunchStart',
      'firstScreenInteractive',
    ]);
  });

  it('keeps the earliest occurrence when a mark name appears twice (dev reload)', () => {
    const summary = summarizeColdStart([
      { name: 'nativeLaunchStart', startTime: 0 },
      { name: 'rootModuleEvaluated', startTime: 700 },
      // A Metro reload re-evaluates the root module much later.
      { name: 'rootModuleEvaluated', startTime: 90_000 },
      { name: 'firstScreenInteractive', startTime: 1200 },
    ]);

    expect(summary!.milestones).toContainEqual({ name: 'rootModuleEvaluated', atMs: 700 });
    expect(summary!.ttiMs).toBe(1200);
  });

  it('ignores marks it does not know about', () => {
    const summary = summarizeColdStart(
      marks({
        nativeLaunchStart: 0,
        firstScreenInteractive: 100,
        somethingElse: 50,
      })
    );

    expect(summary!.milestones.map((m) => m.name)).not.toContain('somethingElse');
  });
});
