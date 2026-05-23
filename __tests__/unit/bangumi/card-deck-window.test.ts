import { describe, expect, it } from 'bun:test';
import {
  bangumiDeckEntryKey,
  computeBangumiDeckWindow,
  expireBangumiOutgoing,
  type BangumiOutgoingCard,
} from '../../../libs/services/bangumi/card-deck-window';

type Item = { id: string; title: string };

const item = (id: string): Item => ({ id, title: id });
const ITEMS = [item('a'), item('b'), item('c')];

describe('bangumi card deck window', () => {
  it('reveals the next card while the committed card remains outgoing', () => {
    const outgoing: BangumiOutgoingCard<Item>[] = [
      { item: item('a'), key: 'anime:a@0', direction: 'right', committedAt: 1000 },
    ];

    const window = computeBangumiDeckWindow({ items: ITEMS, topIndex: 1, outgoing });

    expect(window.map((entry) => ({ key: entry.key, slot: entry.slot }))).toEqual([
      { key: 'anime:a@0', slot: 'outgoing' },
      { key: 'anime:b@1', slot: 'top' },
      { key: 'anime:c@2', slot: 'next' },
    ]);
  });

  it('dedupes repeated outgoing entries for one committed card occurrence', () => {
    const outgoing: BangumiOutgoingCard<Item>[] = [
      { item: item('a'), key: 'anime:a@0', direction: 'right', committedAt: 1000 },
      { item: item('a'), key: 'anime:a@0', direction: 'right', committedAt: 1001 },
    ];

    const window = computeBangumiDeckWindow({ items: ITEMS, topIndex: 1, outgoing });

    expect(window.filter((entry) => entry.key === 'anime:a@0')).toHaveLength(1);
    expect(new Set(window.map((entry) => entry.key)).size).toBe(window.length);
  });

  it('keeps duplicate anime ids distinct by deck index', () => {
    const window = computeBangumiDeckWindow({
      items: [item('dup'), item('dup')],
      topIndex: 0,
      outgoing: [],
    });

    expect(window.map((entry) => entry.key)).toEqual(['anime:dup@0', 'anime:dup@1']);
  });

  it('expires outgoing cards after their animation lifetime', () => {
    const outgoing: BangumiOutgoingCard<Item>[] = [
      { item: item('a'), key: bangumiDeckEntryKey(item('a'), 0), direction: 'right', committedAt: 1000 },
      { item: item('b'), key: bangumiDeckEntryKey(item('b'), 1), direction: 'left', committedAt: 1300 },
    ];

    expect(expireBangumiOutgoing({ outgoing, now: 1450, lifetimeMs: 400 })).toEqual([
      outgoing[1],
    ]);
  });
});
