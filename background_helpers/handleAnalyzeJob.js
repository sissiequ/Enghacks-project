/**
 * Input:
 * - request: { jobDescription?: string }
 * Output:
 * - Promise<{ suggestions: Array<{ section: string, target: string, issue: string, rewrite: string }> }>
 */
async function handleAnalyzeJob(request) {
  const { apiKey, resumeText } = await getStoredProfile();
  const jobDescription = (request.jobDescription || "").trim();

  if (!apiKey) {
    throw new Error("No API key found. Save your OpenRouter API key in the extension options first.");
  }

  if (!resumeText) {
    throw new Error("No resume found. Upload your resume PDF in the extension options first.");
  }

  const aiContent = await callOpenRouter(apiKey, [
    {
      role: "system",
      content:
        "You are a senior resume coach. Output only a valid JSON object with no extra text." +
        " JSON format: { suggestions: [{ section, target, issue, rewrite }] }." +
        " suggestions max 5. Each suggestion must be specific to a concrete resume location." +
        " rewrite must be ready-to-paste resume wording." +
        " All suggestion content must be in English only."
    },
    {
      role: "user",
      content:
        `Give actionable resume edits based on the job description and resume text below.\n\n` +
        `[Job Description]\n${cap(jobDescription, 12000)}\n\n` +
        `[Resume Text]\n${cap(resumeText, 12000)}\n\n` +
        `Output rules:\n` +
        `1) Each suggestion must include:\n` +
        `   - section: e.g. Summary / Experience / Projects / Skills / Education\n` +
        `   - target: exact location to edit (e.g. "Experience - SWE Intern bullet 2")\n` +
        `   - issue: what is weak/missing vs JD\n` +
        `   - rewrite: 1-2 ready-to-paste English resume lines\n` +
        `2) If a location does not exist, set target to "New Bullet Suggestion".\n` +
        `3) Do not give interview or generic job-search advice.\n` +
        `4) English only.`
    }
  ]);

  return {
    suggestions: Array.isArray(aiContent.suggestions) ? aiContent.suggestions.slice(0, 5) : []
  };
}

globalThis.handleAnalyzeJob = handleAnalyzeJob;
