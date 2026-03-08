/**
 * Input:
 * - score: any value
 * Output:
 * - number: integer score clamped to [0, 100]
 */
function clampScore(score) {
  const numericScore = Number.parseInt(score, 10);
  if (!Number.isFinite(numericScore)) return 0;
  return Math.max(0, Math.min(100, numericScore));
}

globalThis.clampScore = clampScore;
