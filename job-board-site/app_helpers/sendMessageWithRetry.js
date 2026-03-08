/**
 * Input:
 * - tabId: number
 * - message: object
 * - retries: number
 * - delayMs: number
 * Output:
 * - Promise<any>: response from content script
 */
async function sendMessageWithRetry(tabId, message, retries = 12, delayMs = 350) {
  // AI_GENERATED_START
  let lastError = null;
  let injectAttempted = false;

  for (let i = 0; i < retries; i += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      const errorMessage = String(error?.message || "");

      if (!injectAttempted && errorMessage.includes("Receiving end does not exist")) {
        try {
          const tab = await chrome.tabs.get(tabId);
          const isJobsUrl = typeof tab?.url === "string" && tab.url.includes("/myAccount/co-op/full/jobs.htm");
          if (!isJobsUrl) {
            throw error;
          }
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content_helpers/bootstrapContent.js", "content.js"]
          });
          injectAttempted = true;
        } catch (_injectError) {}
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Failed to communicate with the WaterlooWorks tab.");
  // AI_GENERATED_END
}

globalThis.sendMessageWithRetry = sendMessageWithRetry;
