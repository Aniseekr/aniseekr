/**
 * Community score as a 0–10 decimal ("8.3"). AniList sends 0–100, Bangumi and
 * MAL send 0–10. Missing or non-positive scores return null so the caller hides
 * the badge instead of showing "N/A" or "0.0".
 */
export function formatScore(score: number | undefined | null): string | null {
  if (score == null || !Number.isFinite(score) || score <= 0) return null;
  if (score > 10) return (score / 10).toFixed(1);
  return score.toFixed(1);
}
