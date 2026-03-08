/**
 * Input:
 * - ctx: dashboard context object
 * Output:
 * - Promise<void>
 */
async function loadJobs(ctx) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(["dashboardJobs"]);
      if (Array.isArray(stored.dashboardJobs) && stored.dashboardJobs.length > 0) {
        ctx.allJobs = stored.dashboardJobs;
        ctx.loading.classList.add("hidden");
        renderJobs(ctx);
        return;
      }
    }

    const response = await fetch("jobs.json");
    if (!response.ok) {
      throw new Error("Failed to load local jobs.json");
    }
    const data = await response.json();
    ctx.allJobs = Array.isArray(data) ? data : [];
    ctx.loading.classList.add("hidden");
    renderJobs(ctx);
  } catch (error) {
    console.error("Error fetching jobs:", error);
    ctx.loading.innerHTML = '<p style="color:var(--accent-red)">Error loading jobs. Ensure jobs.json exists.</p>';
    if (ctx.scoreJobsBtn) {
      ctx.scoreJobsBtn.disabled = true;
    }
  }
}

globalThis.loadJobs = loadJobs;
