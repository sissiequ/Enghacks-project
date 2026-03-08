/**
 * Input:
 * - ctx: dashboard context object
 * Output:
 * - none
 */
function renderJobs(ctx) {
  const jobsToRender = getSortedJobs(ctx);
  ctx.jobGrid.innerHTML = "";

  if (jobsToRender.length === 0) {
    ctx.noResults.classList.remove("hidden");
    setStats(ctx, "0 jobs found");
    return;
  }

  ctx.noResults.classList.add("hidden");
  if (!ctx.isScoring) {
    const scoredCount = getScoredCount(jobsToRender);
    const statSuffix = scoredCount > 0 ? ` • ${scoredCount} AI-scored` : "";
    setStats(ctx, `${jobsToRender.length} jobs match your profile${statSuffix}`);
  }

  jobsToRender.forEach((job) => {
    const clone = ctx.template.content.cloneNode(true);
    const cleanTitle = String(job.title || "Unknown Title").replace(/^check_circle\s*/i, "");
    const companyName = job.organization || "Unknown Company";
    const levelTags = clone.querySelector(".level-tags");
    const matchMeta = getMatchMeta(job);
    const viewBtn = clone.querySelector(".view-btn");

    clone.querySelector(".job-title").textContent = cleanTitle;
    clone.querySelector(".company-name").textContent = companyName;
    clone.querySelector(".location").textContent = [job.city, job.division].filter(Boolean).join(" • ") || "Location unavailable";
    clone.querySelector(".applicants").textContent = job.apps ? `${job.apps} applicants` : "No applicant data";
    clone.querySelector(".deadline").textContent = job.app_deadline || "No deadline specified";
    clone.querySelector(".posting-id").textContent = `#${job.posting_id}`;
    clone.querySelector(".match-badge").textContent = matchMeta.badgeText;
    clone.querySelector(".match-badge").className = matchMeta.badgeClass;
    clone.querySelector(".match-reason").textContent = matchMeta.reason;

    getLevelTokens(job.level).forEach((level) => {
      const span = document.createElement("span");
      span.className = `tag tag-${level}`;
      span.textContent = level.charAt(0).toUpperCase() + level.slice(1);
      levelTags.appendChild(span);
    });

    viewBtn.href = "#";
    viewBtn.addEventListener("click", async (event) => {
      event.preventDefault();

      if (typeof chrome === "undefined" || !chrome.runtime?.id) {
        setStats(ctx, "Opening on WaterlooWorks is only available inside the extension.");
        return;
      }

      const originalLabel = viewBtn.textContent;
      viewBtn.textContent = "Opening...";
      viewBtn.setAttribute("aria-disabled", "true");
      viewBtn.style.pointerEvents = "none";
      setStats(ctx, `Opening posting ${job.posting_id} on WaterlooWorks...`);

      try {
        const response = await openPostingFromDashboard(ctx, job.posting_id);
        setStats(
          ctx,
          response?.queued
            ? `WaterlooWorks opened. Command queued for posting ${job.posting_id}.`
            : `Opened posting ${job.posting_id}.`
        );
      } catch (error) {
        setStats(ctx, error?.message || "Open failed.");
      } finally {
        viewBtn.textContent = originalLabel;
        viewBtn.removeAttribute("aria-disabled");
        viewBtn.style.pointerEvents = "";
      }
    });

    ctx.jobGrid.appendChild(clone);
  });
}

globalThis.renderJobs = renderJobs;
