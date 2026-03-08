function cap(text, maxLen) {
  const value = (text || "").toString().trim();
  return value.length > maxLen ? `${value.slice(0, maxLen)}\n...[TRUNCATED]` : value;
}

function getStoredProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["apiKey", "geminiApiKey", "resumeText"], (result) => {
      resolve({
        apiKey: (result.apiKey || result.geminiApiKey || "").trim(),
        resumeText: (result.resumeText || "").trim()
      });
    });
  });
}

async function callOpenRouter(savedApiKey, messages) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${savedApiKey}`,
      "HTTP-Referer": "https://waterlooworks.uwaterloo.ca/",
      "X-Title": "CoopSync AI Resume Analyzer"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages,
      response_format: { type: "json_object" }
    })
  });

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    data = {};
  }

  if (!response.ok) {
    const apiMsg =
      data?.error?.message ||
      data?.message ||
      `API request failed: ${response.status}`;
    throw new Error(apiMsg);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("The AI provider returned an empty response.");
  }

  try {
    return JSON.parse(content);
  } catch (_err) {
    throw new Error("The AI provider returned invalid JSON.");
  }
}

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

function sanitizeDashboardJob(job) {
  return {
    posting_id: (job?.posting_id || "").toString(),
    title: (job?.title || "").toString(),
    organization: (job?.organization || "").toString(),
    division: (job?.division || "").toString(),
    city: (job?.city || "").toString(),
    level: (job?.level || "").toString(),
    openings: (job?.openings || "").toString(),
    apps: (job?.apps || "").toString(),
    app_deadline: (job?.app_deadline || "").toString(),
    raw_text: cap(job?.raw_text || "", 400),
    hiring_history: job?.hiring_history || null
  };
}

function summarizeHiringHistory(hiringHistory) {
  if (!hiringHistory || typeof hiringHistory !== "object") return "";

  const faculty = Array.isArray(hiringHistory.hires_by_faculty?.data)
    ? hiringHistory.hires_by_faculty.data
        .slice(0, 3)
        .map((item) => `${item.name}: ${item.y}%`)
        .join(", ")
    : "";

  const workTerms = Array.isArray(hiringHistory.hires_by_student_work_term_number?.data)
    ? hiringHistory.hires_by_student_work_term_number.data
        .slice(0, 3)
        .map((item) => `${item.name}: ${item.y}%`)
        .join(", ")
    : "";

  const programs = Array.isArray(hiringHistory.most_frequently_hired_programs?.categories)
    ? hiringHistory.most_frequently_hired_programs.categories.slice(0, 4).join(", ")
    : "";

  return [faculty && `Faculty mix: ${faculty}`, workTerms && `Work terms: ${workTerms}`, programs && `Top programs: ${programs}`]
    .filter(Boolean)
    .join(" | ");
}

async function handleScoreJobsForDashboard(request) {
  const { apiKey, resumeText } = await getStoredProfile();
  const jobs = Array.isArray(request.jobs) ? request.jobs.map(sanitizeDashboardJob).filter(job => job.posting_id) : [];

  if (!apiKey) {
    throw new Error("No API key found. Save your OpenRouter API key in the extension options first.");
  }

  if (!resumeText) {
    throw new Error("No resume found. Upload your resume PDF in the extension options first.");
  }

  if (!jobs.length) {
    throw new Error("No jobs were provided for AI scoring.");
  }

  const compactJobs = jobs.map((job) => {
    const hiringHistorySummary = summarizeHiringHistory(job.hiring_history);
    return {
      posting_id: job.posting_id,
      summary: cap(
        [
          `Title: ${job.title}`,
          `Company: ${job.organization}`,
          `Division: ${job.division}`,
          `Location: ${job.city}`,
          `Level: ${job.level}`,
          `Openings: ${job.openings}`,
          `Applicants: ${job.apps}`,
          `Deadline: ${job.app_deadline}`,
          `Listing Text: ${job.raw_text}`,
          hiringHistorySummary && `Hiring History: ${hiringHistorySummary}`
        ].filter(Boolean).join("\n"),
        850
      )
    };
  });

  const aiContent = await callOpenRouter(apiKey, [
    {
      role: "system",
      content:
        "You score how well a student's resume matches multiple job listings." +
        " Output only valid JSON with no extra text." +
        " JSON format: { results: [{ posting_id, score, reason }] }." +
        " score must be an integer from 0 to 100." +
        " reason must be a single English sentence under 18 words." +
        " Base the score only on the provided resume and listing data."
    },
    {
      role: "user",
      content:
        `[Resume]\n${cap(resumeText, 9000)}\n\n` +
        `[Jobs]\n${JSON.stringify(compactJobs, null, 2)}\n\n` +
        `Instructions:\n` +
        `1) Score each job independently based on resume-to-job fit.\n` +
        `2) Higher score means the candidate appears more aligned.\n` +
        `3) Return every posting_id exactly once.\n` +
        `4) Use English only.\n`
    }
  ]);

  const rawResults = Array.isArray(aiContent.results) ? aiContent.results : [];
  const resultMap = new Map();

  rawResults.forEach((item) => {
    const postingId = (item?.posting_id || "").toString();
    if (!postingId) return;

    const numericScore = Number.parseInt(item?.score, 10);
    resultMap.set(postingId, {
      posting_id: postingId,
      score: Number.isFinite(numericScore) ? Math.max(0, Math.min(100, numericScore)) : 0,
      reason: cap(item?.reason || "AI match summary unavailable.", 160)
    });
  });

  return jobs.map((job) => resultMap.get(job.posting_id) || {
    posting_id: job.posting_id,
    score: 0,
    reason: "AI match summary unavailable."
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const action = request?.action;
  if (!action) return false;

  (async () => {
    if (action === "analyzeJob") {
      const data = await handleAnalyzeJob(request);
      sendResponse({ success: true, data });
      return;
    }

    if (action === "scoreJobsForDashboard") {
      const results = await handleScoreJobsForDashboard(request);
      sendResponse({ success: true, results });
      return;
    }

    sendResponse({ success: false, error: `Unsupported action: ${action}` });
  })().catch((error) => {
    console.error("CoopSync Background Error:", error);
    sendResponse({
      success: false,
      error: error?.message || "Unknown error"
    });
  });

  return true;
});
