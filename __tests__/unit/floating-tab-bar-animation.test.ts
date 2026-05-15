import { describe, expect, it } from 'bun:test';
import {
  FLOATING_TAB_BAR_HIDE_DURATION_MS,
  FLOATING_TAB_BAR_SHOW_DURATION_MS,
} from '../../libs/navigation/floating-tab-bar-animation';

describe('floating tab bar animation timing', () => {
  it('keeps transient hide/show transitions quick', () => {
    expect(FLOATING_TAB_BAR_HIDE_DURATION_MS).toBeLessThanOrEqual(140);
    expect(FLOATING_TAB_BAR_SHOW_DURATION_MS).toBeLessThanOrEqual(140);
    expect(FLOATING_TAB_BAR_HIDE_DURATION_MS).toBeGreaterThanOrEqual(80);
    expect(FLOATING_TAB_BAR_SHOW_DURATION_MS).toBeGreaterThanOrEqual(80);
  });
});
