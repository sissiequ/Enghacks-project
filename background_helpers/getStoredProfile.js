/**
 * Input:
 * - none
 * Output:
 * - Promise<{ apiKey: string, resumeText: string }>
 */
function getStoredProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiKey", "geminiApiKey", "resumeText"], (result) => {
      resolve({
        apiKey: (result.apiKey || result.geminiApiKey || "").trim(),
        resumeText: (result.resumeText || "").trim()
      });
    });
  });
}

globalThis.getStoredProfile = getStoredProfile;
