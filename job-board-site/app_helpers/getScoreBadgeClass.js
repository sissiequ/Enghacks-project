/**
 * Input:
 * - score: number
 * Output:
 * - string: CSS class suffix for score badge
 */
function getScoreBadgeClass(score) {
  if (score >= 80) return "match-badge-strong";
  if (score >= 60) return "match-badge-medium";
  return "match-badge-low";
}

globalThis.getScoreBadgeClass = getScoreBadgeClass;
