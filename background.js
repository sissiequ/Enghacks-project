// Load helper functions (one function per file).
importScripts(
  "background_helpers/cap.js",
  "background_helpers/getStoredProfile.js",
  "background_helpers/callOpenRouter.js",
  "background_helpers/sanitizeDashboardJob.js",
  "background_helpers/summarizeHiringHistory.js",
  "background_helpers/handleAnalyzeJob.js",
  "background_helpers/handleScoreJobsForDashboard.js"
);

// Background skeleton: message routing only.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request?.action;
  if (!action) return false;

  (async () => {
    if (action === "analyzeJob") {
      // Uses helper function: handleAnalyzeJob (from background_helpers/handleAnalyzeJob.js)
      const data = await handleAnalyzeJob(request);
      sendResponse({ success: true, data });
      return;
    }

    if (action === "scoreJobsForDashboard") {
      // Uses helper function: handleScoreJobsForDashboard (from background_helpers/handleScoreJobsForDashboard.js)
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
});
