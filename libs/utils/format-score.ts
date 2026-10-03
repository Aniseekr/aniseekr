export function formatScore(score: number | undefined | null): string | null {
  if (score == null) return null;
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}
