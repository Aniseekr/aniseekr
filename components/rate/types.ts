export type ViewMode = "discovery" | "tracking" | "trend";

export type Anime = {
  id: string;
  title: string;
  image: string;
  rank?: number;
  tags?: string[];
  mood?: string;
  durationMinutes?: number;
};

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

export type AIRecommendation = {
  anime: Anime | null;
  loading: boolean;
};

