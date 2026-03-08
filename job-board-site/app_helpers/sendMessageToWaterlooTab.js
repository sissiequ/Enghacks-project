/**
 * Input:
 * - ctx: dashboard context object
 * - message: object
 * - options: { activateTab?: boolean }
 * Output:
 * - Promise<{ success: boolean, queued?: boolean, error?: string }>
 */
async function sendMessageToWaterlooTab(ctx, message, options = {}) {
  let tab = await getWaterlooWorksTab(ctx);
  if (!tab?.id) {
    await chrome.tabs.create({ url: ctx.WATERLOOWORKS_JOBS_URL, active: true });
    await chrome.storage.local.set({
      pendingWwAction: {
        ...message,
        createdAt: Date.now()
      }
    });
    return { success: true, queued: true };
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

  return response;
}

globalThis.sendMessageToWaterlooTab = sendMessageToWaterlooTab;
