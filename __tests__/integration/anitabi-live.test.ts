// Live integration smoke against api.anitabi.cn.
// Spec case: PILG-013.
// Runs only when SKIP_INTEGRATION !== '1'. The skip is gated by an env var
// (per spec/SPEC.md §6) so this is not a permanent skip.

import { describe, expect, it } from 'bun:test';
import { AnitabiClient } from '../../libs/clients/anitabi-client';

const SKIP = process.env.SKIP_INTEGRATION === '1';
const SUBJECT_ID = 7157; // Hyouka — known to have rich pilgrimage data.

// Use describe.skip when env var is set; bun reports the test as skipped (not
// faked-passed). When live, the test body fully exercises the SUT.
const suite = SKIP ? describe.skip : describe;

suite('Anitabi live API', () => {
  it('PILG-013 fetches lite pilgrimage data for subject 7157 (Hyouka)', async () => {
    const lite = await AnitabiClient.getLite(SUBJECT_ID, { timeoutMs: 15_000 });
    expect(lite).not.toBeNull();
    if (!lite) return;
    expect(lite.id).toBe(SUBJECT_ID);
    expect(typeof lite.title).toBe('string');
    expect(lite.title.length).toBeGreaterThan(0);
    expect(Array.isArray(lite.litePoints)).toBe(true);
  }, 30_000);
});
