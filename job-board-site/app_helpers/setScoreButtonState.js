/**
 * Input:
 * - ctx: dashboard context object
 * - disabled: boolean
 * - label: string
 * Output:
 * - none
 */
function setScoreButtonState(ctx, disabled, label) {
  if (!ctx.scoreJobsBtn) return;
  ctx.scoreJobsBtn.disabled = disabled;
  ctx.scoreJobsBtn.textContent = label;
}

globalThis.setScoreButtonState = setScoreButtonState;
