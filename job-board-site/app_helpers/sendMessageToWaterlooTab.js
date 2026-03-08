/**
 * Input:
 * - ctx: dashboard context object
 * - message: object
 * - options: { activateTab?: boolean }
 * Output:
 * - Promise<{ success: boolean, queued?: boolean, error?: string }>
 */
async function sendMessageToWaterlooTab(ctx, message, options = {}) {
  // AI_GENERATED_START
  let tab = await getWaterlooWorksTab(ctx);
  const createdNewTab = !tab?.id;
  if (createdNewTab) {
    tab = await chrome.tabs.create({ url: ctx.WATERLOOWORKS_JOBS_URL, active: true });
    if (tab?.id) {
      const start = Date.now();
      while (Date.now() - start < 20000) {
        const current = await chrome.tabs.get(tab.id);
        if (current?.status === "complete") break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  let response;
  try {
    response = await sendMessageWithRetry(tab.id, message);
  } catch (_error) {
    await chrome.storage.local.set({
      pendingWwAction: {
        ...message,
        createdAt: Date.now()
      }
    });
    response = { success: true, queued: true };
  }

  if (options.activateTab) {
    await chrome.tabs.update(tab.id, { active: true });
  }

  if (createdNewTab && response?.queued) {
    response = { ...response, openedTab: true };
  }

  return response;
  // AI_GENERATED_END
}

globalThis.sendMessageToWaterlooTab = sendMessageToWaterlooTab;
