/**
 * Input:
 * - jobs: Array<object>
 * Output:
 * - number: count of jobs that already have aiMatchScore
 */
function getScoredCount(jobs) {
  return jobs.filter((job) => Number.isFinite(job.aiMatchScore)).length;
}

globalThis.getScoredCount = getScoredCount;
