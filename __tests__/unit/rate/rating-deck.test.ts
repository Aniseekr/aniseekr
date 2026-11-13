import { describe, expect, it } from 'bun:test';
import type { DeckItem, Photo } from '../../../components/rate/types';
import {
  findAdInsertIndex,
  getUpcomingPhotoUrls,
  insertAdCard,
  removeAdCardsPreservingPhotoIndex,
} from '../../../libs/services/rate/rating-deck';

function photo(id: string): Photo {
  return { id, url: `https://example.com/${id}.jpg`, userId: 'u' };
}

describe('rating-deck', () => {
  const photos = (count: number): DeckItem[] =>
    Array.from({ length: count }, (_, index) => ({ kind: 'photo', photo: photo(String(index)) }));

  it('places the first ad after 8 photos, then 12+ photos after the last one', () => {
    expect(findAdInsertIndex(photos(7), 3)).toBeNull();
    expect(findAdInsertIndex(photos(20), 3)).toBeNull();
    expect(findAdInsertIndex(photos(20), 4)).toBe(8);

    const withAd = insertAdCard(photos(40), 8, 'ad-0');
    expect(findAdInsertIndex(withAd, 16)).toBeNull();
    expect(findAdInsertIndex(withAd, 17)).toBe(21);
  });

  it('does not pre-insert ads down the loaded deck', () => {
    // Regression: right after one insert, every later due slot in a long
    // deck was claimed at once, burning one ad request per slot.
    expect(findAdInsertIndex(photos(60), 0)).toBeNull();
    expect(findAdInsertIndex(insertAdCard(photos(60), 8, 'ad-0'), 5)).toBeNull();
  });

  it('never inserts an ad into the visible window or as the last card', () => {
    // User already swiped past the due slot while no ad was ready.
    expect(findAdInsertIndex(photos(30), 15)).toBe(19);
    expect(findAdInsertIndex(photos(12), 8)).toBeNull();
  });

  it('removes cached ad cards while preserving the next photo index', () => {
    const deck: DeckItem[] = [
      { kind: 'photo', photo: photo('a') },
      { kind: 'photo', photo: photo('b') },
      { kind: 'ad', id: 'ad-0' },
      { kind: 'photo', photo: photo('c') },
      { kind: 'photo', photo: photo('d') },
    ];

    const normalized = removeAdCardsPreservingPhotoIndex(deck, 3);

    expect(
      normalized.deck.map((item) => (item.kind === 'photo' ? item.photo.id : item.id))
    ).toEqual(['a', 'b', 'c', 'd']);
    expect(normalized.currentIndex).toBe(2);
  });

  it('collects upcoming preload URLs by photo count instead of deck slot count', () => {
    const deck: DeckItem[] = [
      { kind: 'photo', photo: photo('a') },
      { kind: 'photo', photo: photo('b') },
      { kind: 'ad', id: 'ad-0' },
      { kind: 'photo', photo: photo('c') },
      { kind: 'photo', photo: photo('d') },
      { kind: 'photo', photo: photo('e') },
    ];

    expect(getUpcomingPhotoUrls(deck, 0, 3)).toEqual([
      'https://example.com/b.jpg',
      'https://example.com/c.jpg',
      'https://example.com/d.jpg',
    ]);
  });
});
