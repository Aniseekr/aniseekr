import { beforeEach, describe, expect, it } from 'bun:test';
import {
  __resetFloatingTabBarVisibilityForTests,
  isFloatingTabBarHidden,
  setFloatingTabBarHidden,
  subscribeFloatingTabBarVisibility,
} from '../../libs/navigation/floating-tab-bar-visibility';

describe('floating tab bar visibility', () => {
  beforeEach(() => {
    __resetFloatingTabBarVisibilityForTests();
  });

  it('updates hidden state synchronously for immediate UI transitions', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeFloatingTabBarVisibility(() => {
      seen.push(isFloatingTabBarHidden());
    });

    setFloatingTabBarHidden('bangumi-cards', true);
    expect(isFloatingTabBarHidden()).toBe(true);

    setFloatingTabBarHidden('bangumi-cards', false);
    expect(isFloatingTabBarHidden()).toBe(false);

    unsubscribe();
    expect(seen).toEqual([true, false]);
  });

  it('stays hidden until every transient hidden reason is cleared', () => {
    setFloatingTabBarHidden('bangumi-cards', true);
    setFloatingTabBarHidden('detail-screen', true);

    setFloatingTabBarHidden('bangumi-cards', false);
    expect(isFloatingTabBarHidden()).toBe(true);

    setFloatingTabBarHidden('detail-screen', false);
    expect(isFloatingTabBarHidden()).toBe(false);
  });
});
