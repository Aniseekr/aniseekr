import type { DeckItem, Photo } from '../../../components/rate/types';

const AD_INTERVAL = 12;

export function buildRatingDeck(photos: Photo[], includeAds: boolean): DeckItem[] {
  if (!includeAds) return photos.map((photo) => ({ kind: 'photo', photo }));

  const deck: DeckItem[] = [];
  let adCounter = 0;
  photos.forEach((photo, index) => {
    deck.push({ kind: 'photo', photo });
    if ((index + 1) % AD_INTERVAL === 0 && index < photos.length - 1) {
      deck.push({ kind: 'ad', id: `ad-${adCounter++}` });
    }
  });
  return deck;
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
