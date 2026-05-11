// Shared formatters used by every seasonal layout. Keep the helpers tiny —
// each layout component imports them so the title/meta/season strings stay
// in lock-step across the four variants.

import type { Anime } from '../types';

export function formatScore(score: number | undefined | null): string | null {
  if (score == null) return null;
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}

export function seasonOf(anime: Anime): string {
  const month = anime.startDate?.month;
  const year = anime.startDate?.year;
  let label = '';
  if (month != null) {
    if (month <= 3) label = 'WINTER';
    else if (month <= 6) label = 'SPRING';
    else if (month <= 9) label = 'SUMMER';
    else label = 'AUTUMN';
  }
  if (label && year) return `${label} ${year}`;
  if (year) return `${year}`;
  return label;
}

export function humanizeStatus(status?: string): string | null {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper === 'RELEASING' || upper === 'CURRENTLY_AIRING') return 'Ongoing';
  if (upper === 'FINISHED' || upper === 'FINISHED_AIRING') return 'Complete';
  if (upper === 'NOT_YET_RELEASED' || upper === 'NOT_YET_AIRED') return 'Upcoming';
  if (upper === 'CANCELLED') return 'Cancelled';
  if (upper === 'HIATUS') return 'Hiatus';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

export function episodeBadge(anime: Anime): string | null {
  if (anime.nextAiringEpisode?.episode) {
    return `EP ${String(anime.nextAiringEpisode.episode).padStart(2, '0')}`;
  }
  if (anime.episodes) return `${anime.episodes} eps`;
  return null;
}
