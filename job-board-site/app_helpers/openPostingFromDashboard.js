/**
 * Input:
 * - ctx: dashboard context object
 * - postingId: string|number
 * Output:
 * - Promise<{ success: boolean, queued?: boolean, error?: string }>
 */
async function openPostingFromDashboard(ctx, postingId) {
  const normalizedPostingId = String(postingId || "").trim();
  if (!normalizedPostingId) {
    throw new Error("Missing posting ID.");
  }

  const response = await sendMessageToWaterlooTab(
    ctx,
    {
      action: "OPEN_POSTING_BY_ID",
      postingId: normalizedPostingId
    },
    { activateTab: true }
  );

  if (!response?.success) {
    throw new Error(response?.error || "Could not open this posting.");
  }

  return response;
}

globalThis.openPostingFromDashboard = openPostingFromDashboard;
