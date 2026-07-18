import { describe, expect, it } from 'bun:test';

import { formatNewsRelativeTime } from '../../../libs/services/news/news-relative-time';

const labels: Record<string, string> = {
  'news.undated': 'undated',
  'news.relative.justNow': 'just now',
  'news.relative.minutes': '{count}m ago',
  'news.relative.hours': '{count}h ago',
  'news.relative.days': '{count}d ago',
  'news.relative.inMinutes': 'in {count}m',
  'news.relative.inHours': 'in {count}h',
  'news.relative.inDays': 'in {count}d',
};

const t = (key: string, values?: { count?: number }) =>
  labels[key].replace('{count}', String(values?.count ?? ''));

describe('formatNewsRelativeTime', () => {
  const now = 2_000_000_000;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it('renders undated articles without a timestamp', () => {
    expect(formatNewsRelativeTime(0, t, now)).toBe('undated');
  });

  it('renders just now for timestamps less than one minute away', () => {
    expect(formatNewsRelativeTime(now - 30_000, t, now)).toBe('just now');
  });

  it('renders past relative buckets', () => {
    expect(formatNewsRelativeTime(now - 2 * minute, t, now)).toBe('2m ago');
    expect(formatNewsRelativeTime(now - 3 * hour, t, now)).toBe('3h ago');
    expect(formatNewsRelativeTime(now - 4 * day, t, now)).toBe('4d ago');
  });

  it('renders future relative buckets', () => {
    expect(formatNewsRelativeTime(now + 2 * minute, t, now)).toBe('in 2m');
    expect(formatNewsRelativeTime(now + 3 * hour, t, now)).toBe('in 3h');
    expect(formatNewsRelativeTime(now + 4 * day, t, now)).toBe('in 4d');
  });
});
