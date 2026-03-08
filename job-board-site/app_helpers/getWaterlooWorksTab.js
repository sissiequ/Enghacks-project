/**
 * Input:
 * - ctx: dashboard context object
 * Output:
 * - Promise<chrome.tabs.Tab|null>
 */
async function getWaterlooWorksTab(ctx) {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id && isJobsPageUrl(activeTab.url || "")) {
    return activeTab;
  }

  const candidates = await chrome.tabs.query({ url: "*://waterlooworks.uwaterloo.ca/*jobs.htm*" });
  return candidates[0] || null;
}

globalThis.getWaterlooWorksTab = getWaterlooWorksTab;
