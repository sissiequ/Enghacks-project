/**
 * Input:
 * - none
 * Output:
 * - none (boots dashboard app skeleton and delegates to helper functions)
 */
document.addEventListener("DOMContentLoaded", () => {
  const ctx = {
    jobGrid: document.getElementById("jobGrid"),
    template: document.getElementById("jobCardTemplate"),
    jobStats: document.getElementById("jobStats"),
    loading: document.getElementById("loading"),
    noResults: document.getElementById("noResults"),
    scoreJobsBtn: document.getElementById("scoreJobsBtn"),
    AI_BATCH_SIZE: 12,
    WATERLOOWORKS_JOBS_URL: "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm",
    allJobs: [],
    isScoring: false
  };

  if (typeof initDashboardApp === "function") {
    // Uses helper function: initDashboardApp (from app_helpers/initDashboardApp.js)
    initDashboardApp(ctx);
  }
});
