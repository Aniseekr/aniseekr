export type BangumiDeckSlot = 'outgoing' | 'top' | 'next';

export interface BangumiDeckItem {
  id: string;
}

export interface BangumiOutgoingCard<T extends BangumiDeckItem> {
  key: string;
  item: T;
  direction: 'left' | 'right';
  committedAt: number;
}

export interface BangumiDeckWindowEntry<T extends BangumiDeckItem> {
  key: string;
  slot: BangumiDeckSlot;
  item: T;
}

export interface ComputeBangumiDeckWindowArgs<T extends BangumiDeckItem> {
  items: readonly T[];
  topIndex: number;
  outgoing: readonly BangumiOutgoingCard<T>[];
}

export function bangumiDeckEntryKey(item: BangumiDeckItem, deckIndex: number): string {
  return `anime:${item.id}@${deckIndex}`;
}

export function computeBangumiDeckWindow<T extends BangumiDeckItem>({
  items,
  topIndex,
  outgoing,
}: ComputeBangumiDeckWindowArgs<T>): BangumiDeckWindowEntry<T>[] {
  const window: BangumiDeckWindowEntry<T>[] = [];
  const usedKeys = new Set<string>();

  for (const card of outgoing) {
    if (usedKeys.has(card.key)) continue;
    usedKeys.add(card.key);
    window.push({ key: card.key, slot: 'outgoing', item: card.item });
  }

  const top = items[topIndex];
  if (top) {
    const key = bangumiDeckEntryKey(top, topIndex);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      window.push({ key, slot: 'top', item: top });
    }
  }

  const next = items[topIndex + 1];
  if (next) {
    const key = bangumiDeckEntryKey(next, topIndex + 1);
    if (!usedKeys.has(key)) {
      usedKeys.add(key);
      window.push({ key, slot: 'next', item: next });
    }
  }

  return window;
}

export interface ExpireBangumiOutgoingArgs<T extends BangumiDeckItem> {
  outgoing: readonly BangumiOutgoingCard<T>[];
  now: number;
  lifetimeMs: number;
}

export function expireBangumiOutgoing<T extends BangumiDeckItem>({
  outgoing,
  now,
  lifetimeMs,
}: ExpireBangumiOutgoingArgs<T>): BangumiOutgoingCard<T>[] {
  return outgoing.filter((card) => now - card.committedAt < lifetimeMs);
}
