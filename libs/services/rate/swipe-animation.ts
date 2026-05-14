export const STACK_REVEAL_DISTANCE = 300;
export const SWIPE_HANDOFF_DELAY_MS = 60;
export const SWIPE_PERSISTENCE_DELAY_MS = 350;

export function getStackRevealTranslation(direction: 'left' | 'right'): number {
  return direction === 'right' ? STACK_REVEAL_DISTANCE : -STACK_REVEAL_DISTANCE;
}
