export function hasPotentialNextSwipePage(itemCount: number): boolean {
  // Swipe decks filter out SFW-blocked, imageless, duplicate, and already-seen
  // items after fetching. A short non-empty page can still mean the upstream
  // source has later pages, so only an empty source page stops dynamic loading.
  return itemCount > 0;
}

export function isExhaustedSwipeDeck(snapshot: {
  deckLength: number;
  currentIndex: number;
  hasMore: boolean;
}): boolean {
  return (
    snapshot.deckLength > 0 &&
    snapshot.currentIndex >= snapshot.deckLength &&
    !snapshot.hasMore
  );
}
