import { describe, expect, it } from 'bun:test';
import {
  scoreDistribution,
  summarize,
  type UserAnimeRow,
} from '../../libs/services/collection/stats-service';

// Regression: user_anime.score is stored 0–100, but the stats screens printed
// the raw value, so an average of 8.5 showed as "85.0" and the persona maths
// (which divides by 10) saturated.
function row(id: string, score: number | null): UserAnimeRow {
  return {
    anime_id: id,
    title: id,
    image_url: null,
    status: 'completed',
    score,
    progress: 12,
    total_episodes: 12,
    started_at: null,
    completed_at: null,
    updated_at: null,
  };
}

describe('stats score scale', () => {
  it('averages stored 0–100 scores on the 10-point scale', () => {
    const summary = summarize([row('a', 90), row('b', 80), row('c', null), row('d', 0)]);
    expect(summary.rated).toBe(2);
    expect(summary.avgScore).toBeCloseTo(8.5, 5);
    expect(summary.scoreVariance).toBeCloseTo(0.25, 5);
  });

  it('buckets scores 1–10 and leaves unrated shows out', () => {
    const buckets = scoreDistribution([row('a', 90), row('b', 85), row('c', 84), row('d', null)]);
    expect(buckets).toHaveLength(10);
    expect(buckets[8]).toEqual({ score: 9, count: 2 });
    expect(buckets[7]).toEqual({ score: 8, count: 1 });
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(3);
  });
});
