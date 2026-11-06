import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { TranslationKey } from '../../i18n/types';

export type ShareTemplateId = 'top10' | 'yearly_best' | 'starter_pack' | 'masterpiece';

export interface ShareTemplate {
  id: ShareTemplateId;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: ComponentProps<typeof Ionicons>['name'];
  needsManualPick: boolean;
}

export interface ShareEntry {
  animeId: string;
  title: string;
  coverUrl?: string;
  score?: number;
  year?: number;
  tag?: string;
  synopsis?: string;
}

export interface ShareTemplateBuild {
  template: ShareTemplate;
  entries: ShareEntry[];
  meta?: { username?: string; year?: number };
}

export interface ShareSourceItem {
  id: string;
  title: string;
  coverUrl?: string;
  score?: number;
  year?: number;
  status?: string;
  synopsis?: string;
}

export const SHARE_TEMPLATES: ShareTemplate[] = [
  {
    id: 'top10',
    titleKey: 'collectionUi.shareTemplate.top10Title',
    descriptionKey: 'collectionUi.shareTemplate.top10Desc',
    icon: 'trophy-outline',
    needsManualPick: false,
  },
  {
    id: 'yearly_best',
    titleKey: 'collectionUi.shareTemplate.yearlyBestTitle',
    descriptionKey: 'collectionUi.shareTemplate.yearlyBestDesc',
    icon: 'calendar-outline',
    needsManualPick: false,
  },
  {
    id: 'starter_pack',
    titleKey: 'collectionUi.shareTemplate.starterPackTitle',
    descriptionKey: 'collectionUi.shareTemplate.starterPackDesc',
    icon: 'bag-handle-outline',
    needsManualPick: true,
  },
  {
    id: 'masterpiece',
    titleKey: 'collectionUi.shareTemplate.masterpieceTitle',
    descriptionKey: 'collectionUi.shareTemplate.masterpieceDesc',
    icon: 'star-outline',
    needsManualPick: true,
  },
];

function toEntry(item: ShareSourceItem, tag?: string): ShareEntry {
  return {
    animeId: item.id,
    title: item.title,
    coverUrl: item.coverUrl,
    score: item.score,
    year: item.year,
    tag,
    synopsis: item.synopsis,
  };
}

function rankByScore(items: ShareSourceItem[]): ShareSourceItem[] {
  return [...items]
    .filter((it) => typeof it.score === 'number' && (it.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function buildTop10(items: ShareSourceItem[], options?: { username?: string }): ShareTemplateBuild {
  const ranked = rankByScore(items).slice(0, 10);
  return {
    template: SHARE_TEMPLATES[0],
    entries: ranked.map((it) => toEntry(it)),
    meta: { username: options?.username },
  };
}

function buildYearlyBest(
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  const now = new Date().getFullYear();
  const targetYears = [now, now - 1, now - 2, now - 3];

  const buckets: ShareEntry[] = [];
  for (const year of targetYears) {
    const top = rankByScore(items.filter((it) => it.year === year)).slice(0, 3);
    top.forEach((it) => buckets.push(toEntry({ ...it, year })));
  }

  return {
    template: SHARE_TEMPLATES[1],
    entries: buckets,
    meta: { username: options?.username, year: now },
  };
}

function buildStarterPack(
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  const ranked = rankByScore(items).slice(0, 6);
  return {
    template: SHARE_TEMPLATES[2],
    entries: ranked.map((it) => toEntry(it)),
    meta: { username: options?.username },
  };
}

function buildMasterpiece(
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  const top = rankByScore(items).slice(0, 1);
  return {
    template: SHARE_TEMPLATES[3],
    entries: top.map((it) => toEntry(it)),
    meta: { username: options?.username },
  };
}

export function buildShareTemplate(
  templateId: ShareTemplateId,
  items: ShareSourceItem[],
  options?: { username?: string }
): ShareTemplateBuild {
  switch (templateId) {
    case 'top10':
      return buildTop10(items, options);
    case 'yearly_best':
      return buildYearlyBest(items, options);
    case 'starter_pack':
      return buildStarterPack(items, options);
    case 'masterpiece':
      return buildMasterpiece(items, options);
  }
}
