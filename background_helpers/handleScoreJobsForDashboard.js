/**
 * Input:
 * - request: { jobs?: Array<object> }
 * Output:
 * - Promise<Array<{ posting_id: string, score: number, reason: string }>>
 */
async function handleScoreJobsForDashboard(request) {
  const { apiKey, resumeText } = await getStoredProfile();
  const jobs = Array.isArray(request.jobs) ? request.jobs.map(sanitizeDashboardJob).filter((job) => job.posting_id) : [];

  if (!apiKey) {
    throw new Error("No API key found. Save your OpenRouter API key in the extension options first.");
  }

  if (!resumeText) {
    throw new Error("No resume found. Upload your resume PDF in the extension options first.");
  }

  if (!jobs.length) {
    throw new Error("No jobs were provided for AI scoring.");
  }

  const compactJobs = jobs.map((job) => {
    const hiringHistorySummary = summarizeHiringHistory(job.hiring_history);
    return {
      posting_id: job.posting_id,
      summary: cap(
        [
          `Title: ${job.title}`,
          `Company: ${job.organization}`,
          `Division: ${job.division}`,
          `Location: ${job.city}`,
          `Level: ${job.level}`,
          `Openings: ${job.openings}`,
          `Applicants: ${job.apps}`,
          `Deadline: ${job.app_deadline}`,
          `Listing Text: ${job.raw_text}`,
          hiringHistorySummary && `Hiring History: ${hiringHistorySummary}`
        ].filter(Boolean).join("\n"),
        850
      )
    };
  });

  const aiContent = await callOpenRouter(apiKey, [
    {
      role: "system",
      content:
        "You score how well a student's resume matches multiple job listings." +
        " Output only valid JSON with no extra text." +
        " JSON format: { results: [{ posting_id, score, reason }] }." +
        " score must be an integer from 0 to 100." +
        " reason must be a single English sentence under 18 words." +
        " Base the score only on the provided resume and listing data."
    },
    {
      role: "user",
      content:
        `[Resume]\n${cap(resumeText, 9000)}\n\n` +
        `[Jobs]\n${JSON.stringify(compactJobs, null, 2)}\n\n` +
        `Instructions:\n` +
        `1) Score each job independently based on resume-to-job fit.\n` +
        `2) Higher score means the candidate appears more aligned.\n` +
        `3) Return every posting_id exactly once.\n` +
        `4) Use English only.\n`
    }
  ]);

  const rawResults = Array.isArray(aiContent.results) ? aiContent.results : [];
  const resultMap = new Map();

  rawResults.forEach((item) => {
    const postingId = (item?.posting_id || "").toString();
    if (!postingId) return;

    const numericScore = Number.parseInt(item?.score, 10);
    resultMap.set(postingId, {
      posting_id: postingId,
      score: Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0,
      reason: cap(item?.reason || "AI match summary unavailable.", 160)
    });
  });

  return jobs.map((job) => resultMap.get(job.posting_id) || {
    posting_id: job.posting_id,
    score: 0,
    reason: "AI match summary unavailable."
  });
}

globalThis.handleScoreJobsForDashboard = handleScoreJobsForDashboard;
