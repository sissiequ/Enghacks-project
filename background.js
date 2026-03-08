// Load helper functions (one function per file).
//AI generated functions.
importScripts(
  "background_helpers/cap.js",
  "background_helpers/getStoredProfile.js",
  "background_helpers/callOpenRouter.js",
  "background_helpers/sanitizeDashboardJob.js",
  "background_helpers/summarizeHiringHistory.js",
  "background_helpers/handleAnalyzeJob.js",
  "background_helpers/handleScoreJobsForDashboard.js"
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // AI_GENERATED_START
  const action = request?.action;
  if (!action) return false;

  (async () => {
    if (action === "analyzeJob") {
      const data = await handleAnalyzeJob(request);
      sendResponse({ success: true, data });
      return;
    }

    if (action === "scoreJobsForDashboard") {
      const results = await handleScoreJobsForDashboard(request);
      sendResponse({ success: true, results });
      return;
    }

    sendResponse({ success: false, error: `Unsupported action: ${action}` });
  })().catch((error) => {
    console.error("CoopSync Background Error:", error);
    sendResponse({
      success: false,
      error: error?.message || "Unknown error"
    });
  });

  return true;
  // AI_GENERATED_END
});
