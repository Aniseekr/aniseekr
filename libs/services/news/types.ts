export interface NewsText {
  ja: string;
  en?: string;
  zhHant?: string;
}

export type NewsCategory = 'pilgrimage' | 'news' | 'event' | 'goods' | 'industry';
export type NewsFormat = 'rss2' | 'atom' | 'rdf';

export interface NewsSource {
  id: string;
  name: NewsText;
  feedUrl: string;
  homepageUrl: string;
  category: NewsCategory;
  language: 'ja' | 'en';
  format: NewsFormat;
  recommended: boolean;
  frequency: 'high' | 'medium' | 'low';
  verifiedAt: string;
  notes?: string;
}

export interface NewsArticle {
  id: string;
  sourceId: string;
  title: string;
  link: string;
  publishedAt: number;
  excerpt?: string;
  thumbnailUrl?: string;
}

export interface NewsSourceFile {
  $schema?: string;
  generatedAt: number;
  source: string;
  count: number;
  entries: NewsSource[];
}
