/**
 * Input:
 * - ctx: dashboard context object
 * Output:
 * - Promise<void>
 */
async function initDashboardApp(ctx) {
  await loadJobs(ctx);

  if (ctx.scoreJobsBtn) {
    ctx.scoreJobsBtn.addEventListener("click", () => handleScoreJobsClick(ctx));
  }
}

globalThis.initDashboardApp = initDashboardApp;
