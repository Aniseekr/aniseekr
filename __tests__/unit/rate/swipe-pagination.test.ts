import { describe, expect, it } from 'bun:test';
import {
  hasPotentialNextSwipePage,
  isExhaustedSwipeDeck,
} from '../../../libs/services/rate/swipe-pagination';

describe('swipe pagination', () => {
  it('keeps loading after a short non-empty page', () => {
    expect(hasPotentialNextSwipePage(17)).toBe(true);
  });

  it('stops only after the source returns an empty page', () => {
    expect(hasPotentialNextSwipePage(0)).toBe(false);
  });

  it('treats a fully consumed deck with no next page as exhausted', () => {
    expect(isExhaustedSwipeDeck({ deckLength: 20, currentIndex: 20, hasMore: false })).toBe(true);
  });

  it('does not treat an end-position deck as exhausted while more pages exist', () => {
    expect(isExhaustedSwipeDeck({ deckLength: 20, currentIndex: 20, hasMore: true })).toBe(false);
  });
});
