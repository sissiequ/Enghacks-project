/**
 * Input:
 * - url: any value
 * Output:
 * - boolean: true if URL points to WaterlooWorks jobs page
 */
function isJobsPageUrl(url) {
  return typeof url === "string" && url.includes("/myAccount/co-op/full/jobs.htm");
}

globalThis.isJobsPageUrl = isJobsPageUrl;
