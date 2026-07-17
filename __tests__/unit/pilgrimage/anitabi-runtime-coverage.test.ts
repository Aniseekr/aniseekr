import { describe, expect, it } from 'bun:test';

import { hasSufficientRuntimeCoverage } from '../../../libs/services/pilgrimage/anitabi-runtime-coverage';

describe('hasSufficientRuntimeCoverage', () => {
  it('rejects a degraded runtime index that would erase most bundled entries', () => {
    expect(hasSufficientRuntimeCoverage(82, 9)).toBe(false);
    expect(hasSufficientRuntimeCoverage(781, 9)).toBe(false);
  });

  it('accepts a larger runtime index and small legitimate removals', () => {
    expect(hasSufficientRuntimeCoverage(82, 1481)).toBe(true);
    expect(hasSufficientRuntimeCoverage(100, 90)).toBe(true);
  });

  it('rejects empty payloads', () => {
    expect(hasSufficientRuntimeCoverage(82, 0)).toBe(false);
  });
});
