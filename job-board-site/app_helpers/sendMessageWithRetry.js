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

  for (let i = 0; i < retries; i += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      const errorMessage = String(error?.message || "");

      if (errorMessage.includes("Receiving end does not exist")) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["content_helpers/bootstrapContent.js", "content.js"]
          });
        } catch (_injectError) {}
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError || new Error("Failed to communicate with the WaterlooWorks tab.");
  // AI_GENERATED_END
}

globalThis.sendMessageWithRetry = sendMessageWithRetry;
