import { Share, Platform } from 'react-native';
import { Anime } from '../rate/types';

interface DailyAnime {
  day: string;
  anime: Anime[];
}

const dayShort: Record<string, string> = {
  Mondays: 'Mon',
  Tuesdays: 'Tue',
  Wednesdays: 'Wed',
  Thursdays: 'Thu',
  Fridays: 'Fri',
  Saturdays: 'Sat',
  Sundays: 'Sun',
  Unknown: 'TBD',
};

export interface ShareScheduleOptions {
  seasonLabel: string;
  groupedAnime: DailyAnime[];
  totalCount: number;
}

/**
 * Build a shareable text rendition of the weekly schedule and dispatch
 * the system share sheet. iOS keeps the rich preview; Android uses the
 * native chooser. We deliberately skip view-shot image generation here
 * to avoid pulling a native module.
 */
export async function shareSchedule({
  seasonLabel,
  groupedAnime,
  totalCount,
}: ShareScheduleOptions): Promise<boolean> {
  const lines: string[] = [
    `Aniseekr · ${seasonLabel}`,
    `${totalCount} series this season`,
    '',
  ];

  groupedAnime.forEach((group) => {
    if (!group.anime.length) return;
    lines.push(`${dayShort[group.day] ?? group.day}`);
    group.anime.slice(0, 8).forEach((a) => {
      lines.push(`· ${a.title}`);
    });
    if (group.anime.length > 8) {
      lines.push(`  +${group.anime.length - 8} more`);
    }
    lines.push('');
  });

  const message = lines.join('\n').trimEnd();

  try {
    const result = await Share.share(
      {
        message,
        title: `Aniseekr · ${seasonLabel}`,
      },
      {
        dialogTitle: 'Share schedule',
        subject: `Aniseekr · ${seasonLabel}`,
      }
    );

    return Platform.OS === 'ios'
      ? result.action === Share.sharedAction
      : true;
  } catch {
    return false;
  }
}
