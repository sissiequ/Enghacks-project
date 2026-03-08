// Load helper functions (one function per file).
//Some are AI generated functions. They are maked as "*""
//one * means we eveything are written by ai under our instruction, 
// two ** means ai helped fixing bug and testing, did not participate in the initial designing. 
importScripts(
  "background_helpers/cap.js", //* 
  "background_helpers/getStoredProfile.js", //*
  "background_helpers/callOpenRouter.js",  //*
  "background_helpers/sanitizeDashboardJob.js", //*
  "background_helpers/summarizeHiringHistory.js", //*
  "background_helpers/handleAnalyzeJob.js", //** */
  "background_helpers/handleScoreJobsForDashboard.js" //** 
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // AI_GENERATED_START
  const action = request?.action;
  if (!action) {
    return false;
  } else {
  //it can and will be using await function: until API or users send message, 
  // then continue
  (async () => {
    //if the user click: open in waterloowork 
    if (action === "analyzeJob") {
      const data = await handleAnalyzeJob(request);
      sendResponse({ success: true, data });
      return;
    }
    //if the user click: score jobs
    if (action === "scoreJobsForDashboard") {
      const results = await handleScoreJobsForDashboard(request);
      sendResponse({ success: true, results });
      return;
    }

    else  sendResponse({ success: false, error: `Unsupported action: ${action}` });

  })().catch((error) => {
    console.error("CoopSync Background Error:", error);
    sendResponse({
      success: false,
      error: error?.message || "Unknown error"
    });
  });

  //all mistakes should be catched by now
  return true;
  // AI_GENERATED_END

  }

  
});
