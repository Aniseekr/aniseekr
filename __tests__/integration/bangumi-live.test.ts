// Live integration smoke against api.bgm.tv.
// Spec case: BGM-009 — live detail subject 7157 (Hyouka) returns the Chinese title.
//
// Skipped when SKIP_INTEGRATION === '1' (gated env-var per spec/SPEC.md §6).

import { describe, expect, it } from 'bun:test';
import { BangumiDataSource } from '../../libs/services/data-sources/bangumi-data-source';

const SKIP = process.env.SKIP_INTEGRATION === '1';
const SUBJECT_ID = '7157'; // Hyouka — well-known stable Bangumi subject.

const suite = SKIP ? describe.skip : describe;

suite('Bangumi live API', () => {
  it('BGM-009 fetches subject 7157 (Hyouka) with Chinese title', async () => {
    const source = new BangumiDataSource();
    const item = await source.fetchAnimeDetail(SUBJECT_ID);

    expect(item).toBeDefined();
    // Chinese title should be present and non-empty.
    expect(item.titleChinese).not.toBeNull();
    expect((item.titleChinese ?? '').length).toBeGreaterThan(0);
    // Japanese name field should be set ("氷菓").
    expect(item.titleJapanese).not.toBeNull();
    // Bangumi platform data is captured.
    expect(item.platformData.bangumi?.id).toBe(SUBJECT_ID);
  }, 30_000);
});
