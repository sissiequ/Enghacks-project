/**
 * Input:
 * - job: object
 * Output:
 * - object: minimal payload required by scoreJobsForDashboard
 */
function buildScorePayload(job) {
  return {
    posting_id: job.posting_id,
    title: job.title,
    organization: job.organization,
    division: job.division,
    openings: job.openings,
    city: job.city,
    level: job.level,
    apps: job.apps,
    app_deadline: job.app_deadline,
    raw_text: job.raw_text,
    hiring_history: job.hiring_history
  };
}

globalThis.buildScorePayload = buildScorePayload;
