/**
 * Input:
 * - ctx: dashboard context object
 * Output:
 * - Promise<void>
 */
async function handleScoreJobsClick(ctx) {
  if (ctx.isScoring || !ctx.allJobs.length) return;
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    setStats(ctx, "AI scoring is only available inside the extension.");
    return;
  }

  ctx.isScoring = true;
  setScoreButtonState(ctx, true, "Scoring...");

  try {
    const scoreMap = new Map();
    const jobsToScore = ctx.allJobs.map(buildScorePayload);
    const totalBatches = Math.ceil(jobsToScore.length / ctx.AI_BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex += 1) {
      const start = batchIndex * ctx.AI_BATCH_SIZE;
      const batch = jobsToScore.slice(start, start + ctx.AI_BATCH_SIZE);
      setStats(ctx, `Scoring jobs with AI... Batch ${batchIndex + 1} of ${totalBatches}`);

      const response = await sendRuntimeMessage({
        action: "scoreJobsForDashboard",
        jobs: batch
      });

      if (!response?.success) {
        throw new Error(response?.error || "AI scoring failed.");
      }

      const results = Array.isArray(response.results) ? response.results : [];
      results.forEach((result) => {
        const postingId = String(result?.posting_id || "");
        if (!postingId) return;

        scoreMap.set(postingId, {
          score: clampScore(result?.score),
          reason: String(result?.reason || "AI match summary unavailable.")
        });
      });

      ctx.allJobs = ctx.allJobs.map((job) => {
        const match = scoreMap.get(String(job.posting_id || ""));
        return match ? { ...job, aiMatchScore: match.score, aiMatchReason: match.reason } : job;
      });

      renderJobs(ctx);
    }

    setStats(ctx, `${getScoredCount(ctx.allJobs)} jobs ranked by AI fit`);
  } catch (error) {
    console.error("AI scoring error:", error);
    setStats(ctx, error?.message || "AI scoring failed.");
  } finally {
    ctx.isScoring = false;
    setScoreButtonState(ctx, false, "Re-score with AI");
    renderJobs(ctx);
  }
}

globalThis.handleScoreJobsClick = handleScoreJobsClick;
