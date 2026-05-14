import { describe, expect, it, mock } from 'bun:test';
import { refreshTrackedIdsSafely } from '../../../libs/services/tracking/tracking-refresh';

describe('tracking refresh', () => {
  it('catches background tracked-id refresh failures', async () => {
    const load = mock(async () => {
      throw new Error('NativeDatabase.prepareAsync rejected');
    });
    const warn = mock(() => undefined);

    refreshTrackedIdsSafely(load, warn);
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
