export type ViewMode = 'discovery' | 'tracking' | 'trend';

export interface Anime {
  id: string;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  titleJapanese?: string;
  titleChinese?: string;
  titleChineseTraditional?: string;
  titleRussian?: string;
  image: string;
  bannerImage?: string;
  rank?: number;
  score?: number; // [NEW] 0-100 or 0-10
  type?: string; // [NEW] TV, MOVIE, etc.
  tags?: string[];
  mood?: string;
  description?: string;
  episodes?: number;
  durationMinutes?: number;
  studios?: string[];
  startDate?: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  status?: string;
  format?: string;
  nextAiringEpisode?: {
    airingAt: number;
    episode: number;
  };
}

export type Genre = {
  id: string;
  displayName: string;
  image: string;
};

export type Recommendation = {
  id: string;
  anime: Anime;
  reason: string;
};

export type Photo = {
  id: string;
  url: string;
  userId: string;
  title?: string;
  tags?: string[];
  score?: number;
  year?: number;
  type?: string;
  jpTitle?: string;
  enTitle?: string;
};

export type DeckItem = { kind: 'photo'; photo: Photo } | { kind: 'ad'; id: string };

/**
 * Status drives which UI state the sheet renders. Kept as an enum so a user
 * with likes never sees the cold-start "rate a few first" copy when the picker
 * simply produced no overlap (which is a retryable transient, not onboarding).
 */
export type PersonalizedPickStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'cold-start'
  | 'no-match'
  | 'error';

export type PersonalizedPickState = {
  status: PersonalizedPickStatus;
  anime: Anime | null;
  /** Human-readable explanation, e.g. "Because you liked X & Y". Null unless status === 'ready'. */
  reason: string | null;
  /** Anime titles from the user's library that drove this pick (max 2). */
  sourceTitles: string[];
  /** Genre tags shared between the pick and the user's positive signals. */
  matchedTags: string[];
};
