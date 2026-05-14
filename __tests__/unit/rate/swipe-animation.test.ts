import { describe, expect, it } from 'bun:test';
import {
  SWIPE_HANDOFF_DELAY_MS,
  SWIPE_PERSISTENCE_DELAY_MS,
  STACK_REVEAL_DISTANCE,
  getStackRevealTranslation,
} from '../../../libs/services/rate/swipe-animation';

describe('swipe animation', () => {
  it('promotes the next card instead of collapsing the stack during exit', () => {
    expect(STACK_REVEAL_DISTANCE).toBe(300);
  });

  it('uses the swipe direction when revealing the next card', () => {
    expect(getStackRevealTranslation('right')).toBe(STACK_REVEAL_DISTANCE);
    expect(getStackRevealTranslation('left')).toBe(-STACK_REVEAL_DISTANCE);
  });

  it('hands control to the next card before the exit animation finishes', () => {
    expect(SWIPE_HANDOFF_DELAY_MS).toBeLessThan(100);
  });

  it('defers persistence until after the next card has received control', () => {
    expect(SWIPE_PERSISTENCE_DELAY_MS).toBeGreaterThan(SWIPE_HANDOFF_DELAY_MS);
  });
});
