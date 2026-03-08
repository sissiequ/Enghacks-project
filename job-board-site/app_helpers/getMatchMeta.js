/**
 * Input:
 * - job: object
 * Output:
 * - { badgeText: string, badgeClass: string, reason: string }
 */
function getMatchMeta(job) {
  if (!Number.isFinite(job.aiMatchScore)) {
    return {
      badgeText: "Not scored",
      badgeClass: "match-badge match-badge-pending",
      reason: "Run AI scoring to rank these jobs against your resume."
    };
  }

  return {
    badgeText: `${job.aiMatchScore}% Match`,
    badgeClass: `match-badge ${getScoreBadgeClass(job.aiMatchScore)}`,
    reason: job.aiMatchReason || "AI match summary unavailable."
  };
}

globalThis.getMatchMeta = getMatchMeta;
