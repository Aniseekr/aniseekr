import type { FocalStop } from '../../../components/pilgrimage/camera/types';

/** "0.5×" / "1×" / "3×" — Samsung-style preset chip label (uses the multiplication sign). */
export function formatFocalStopLabel(stop: FocalStop): string {
  return `${stop}×`;
}

export function isFocalStopActive(stop: FocalStop, activeStop: FocalStop | null): boolean {
  return activeStop === stop;
}
