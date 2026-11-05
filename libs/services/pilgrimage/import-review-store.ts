// Hand-off between the screen that picked photos and the review screen, and
// back: the plan is too big for route params, and the summary has to reach
// whichever screen started the import (journal or camera) when it regains focus.
import type { ImportPlanItem, PhotoImportSummary } from './photo-import';

let pendingPlan: ImportPlanItem[] | null = null;
let finishedSummary: { origin: string; summary: PhotoImportSummary } | null = null;
let pendingOrigin = '';

export function setPendingImport(plan: ImportPlanItem[], origin: string): void {
  pendingPlan = plan;
  pendingOrigin = origin;
}

/** The plan waiting for review (read synchronously on the review's first frame). */
export function peekPendingImport(): ImportPlanItem[] | null {
  return pendingPlan;
}

export function finishPendingImport(summary: PhotoImportSummary | null): void {
  if (summary) finishedSummary = { origin: pendingOrigin, summary };
  pendingPlan = null;
}

/** The result of a review started by `origin`, once; null if there is none. */
export function takeFinishedImport(origin: string): PhotoImportSummary | null {
  if (!finishedSummary || finishedSummary.origin !== origin) return null;
  const { summary } = finishedSummary;
  finishedSummary = null;
  return summary;
}
