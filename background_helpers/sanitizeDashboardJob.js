/**
 * Input:
 * - job: object, raw dashboard job row
 * Output:
 * - object: normalized job fields used for AI scoring
 */
function sanitizeDashboardJob(job) {
  return {
    posting_id: (job?.posting_id || "").toString(),
    title: (job?.title || "").toString(),
    organization: (job?.organization || "").toString(),
    division: (job?.division || "").toString(),
    city: (job?.city || "").toString(),
    level: (job?.level || "").toString(),
    openings: (job?.openings || "").toString(),
    apps: (job?.apps || "").toString(),
    app_deadline: (job?.app_deadline || "").toString(),
    raw_text: cap(job?.raw_text || "", 400),
    work_term_duration: cap(job?.work_term_duration || "", 120),
    special_job_requirements: cap(job?.special_job_requirements || "", 700),
    required_skills: cap(job?.required_skills || "", 900),
    hiring_history: job?.hiring_history || null
  };
}

globalThis.sanitizeDashboardJob = sanitizeDashboardJob;
