/**
 * Input:
 * - ctx: dashboard context object
 * Output:
 * - Array<object>: sorted jobs by AI score desc, then title asc
 */
function getSortedJobs(ctx) {
  return [...ctx.allJobs].sort((a, b) => {
    const scoreA = Number.isFinite(a.aiMatchScore) ? a.aiMatchScore : -1;
    const scoreB = Number.isFinite(b.aiMatchScore) ? b.aiMatchScore : -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

globalThis.getSortedJobs = getSortedJobs;
