/**
 * Input:
 * - ctx: dashboard context object
 * - text: string
 * Output:
 * - none
 */
function setStats(ctx, text) {
  if (ctx.jobStats) {
    ctx.jobStats.textContent = text;
  }
}

globalThis.setStats = setStats;
