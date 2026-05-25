import { describe, expect, it } from 'bun:test';
import type { DeckItem, Photo } from '../../../components/rate/types';
import {
  buildRatingDeck,
  getUpcomingPhotoUrls,
  removeAdCardsPreservingPhotoIndex,
} from '../../../libs/services/rate/rating-deck';

function photo(id: string): Photo {
  return { id, url: `https://example.com/${id}.jpg`, userId: 'u' };
}

describe('rating-deck', () => {
  it('inserts ad cards after every 12 photos when ads are enabled', () => {
    const deck = buildRatingDeck(
      Array.from({ length: 25 }, (_, index) => photo(String(index + 1))),
      true
    );

    expect(deck.map((item) => item.kind)).toEqual([
      ...Array(12).fill('photo'),
      'ad',
      ...Array(12).fill('photo'),
      'ad',
      'photo',
    ]);
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
