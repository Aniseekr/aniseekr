import type { DeckItem, Photo } from '../../../components/rate/types';

const AD_INTERVAL = 12;
// Ads are inserted at least this far past the visual top, so a new ad card
// enters from behind the stack (the window is top/next/third) and never pops
// into a slot the user can already see.
const AD_INSERT_LOOKAHEAD = 4;

export function buildRatingDeck(photos: Photo[]): DeckItem[] {
  return photos.map((photo) => ({ kind: 'photo', photo }));
}

/**
 * Where the next ad card belongs: at least AD_INTERVAL photos after the last
 * ad, just behind the visible window, never as the last card. `null` = not due.
 */
export function findAdInsertIndex(deck: DeckItem[], currentIndex: number): number | null {
  let lastAd = -1;
  for (let index = deck.length - 1; index >= 0; index -= 1) {
    if (deck[index]?.kind === 'ad') {
      lastAd = index;
      break;
    }
  }

  let photos = 0;
  let due = -1;
  for (let index = lastAd + 1; index < deck.length; index += 1) {
    if (deck[index]?.kind !== 'photo') continue;
    photos += 1;
    if (photos === AD_INTERVAL) {
      due = index + 1;
      break;
    }
  }
  // Insert just-in-time, as the due slot reaches the edge of the window —
  // not ahead of time down the whole loaded deck (each ad is a live request
  // that expires).
  const insertAt = currentIndex + AD_INSERT_LOOKAHEAD;
  if (due < 0 || due > insertAt) return null;
  return insertAt < deck.length ? insertAt : null;
}

export function insertAdCard(deck: DeckItem[], index: number, id: string): DeckItem[] {
  const at = Math.min(index, deck.length);
  return [...deck.slice(0, at), { kind: 'ad', id }, ...deck.slice(at)];
}

export function removeAdCardsPreservingPhotoIndex(
  deck: DeckItem[],
  currentIndex: number
): { deck: DeckItem[]; currentIndex: number } {
  const photoDeck = deck.filter(
    (item): item is Extract<DeckItem, { kind: 'photo' }> => item.kind === 'photo'
  );
  const completedPhotos = deck
    .slice(0, currentIndex)
    .filter((item) => item.kind === 'photo').length;

  return {
    deck: photoDeck,
    currentIndex: Math.min(completedPhotos, photoDeck.length),
  };
}

export function getUpcomingPhotoUrls(
  deck: DeckItem[],
  currentIndex: number,
  photoLimit: number
): string[] {
  const urls: string[] = [];
  for (let index = currentIndex + 1; index < deck.length && urls.length < photoLimit; index += 1) {
    const item = deck[index];
    if (item?.kind === 'photo' && item.photo.url) {
      urls.push(item.photo.url);
    }
  }
  return urls;
}
