chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "analyzeJob") return;

  // Single source of truth for analysis input:
  // API key + resume text are persisted by options.js in chrome.storage.local.
  chrome.storage.local.get(["apiKey", "geminiApiKey", "resumeText"], async (result) => {
    const savedApiKey = (result.apiKey || result.geminiApiKey || "").trim();
    const resumeText = (result.resumeText || "").trim();
    const jobDescription = (request.jobDescription || "").trim();

    // Keep payload size bounded so prompt stays within a reasonable token budget.
    const cap = (text, maxLen) => (text.length > maxLen ? `${text.slice(0, maxLen)}\n...[TRUNCATED]` : text);

    if (!savedApiKey) {
      sendResponse({
        success: false,
        error: "未检测到 API Key，请在插件 Options 页面保存后重试。"
      });
      return;
    }

    if (!resumeText) {
      sendResponse({
        success: false,
        error: "未检测到简历内容，请先在 Options 页面上传 PDF 简历后再分析。"
      });
      return;
    }

    try {
      // OpenRouter acts as a unified gateway to the selected LLM model.
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
          messages: [
            {
              role: "system",
              content:
                "You are a senior resume coach. Output only a valid JSON object with no extra text." +
                " JSON format: { score: integer 0-100, suggestions: [{ section, target, issue, rewrite }] }." +
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
                `1) score must be an integer match score.\n` +
                `2) Each suggestion must include:\n` +
                `   - section: e.g. Summary / Experience / Projects / Skills / Education\n` +
                `   - target: exact location to edit (e.g. "Experience - SWE Intern bullet 2")\n` +
                `   - issue: what is weak/missing vs JD\n` +
                `   - rewrite: 1-2 ready-to-paste English resume lines\n` +
                `3) If a location does not exist, set target to "New Bullet Suggestion".\n` +
                `4) Do not give interview or generic job-search advice.\n` +
                `5) English only.`
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (_err) {
        data = {};
      }

      // Normalize provider-side error messages so content.js can display one clear reason.
      if (!response.ok) {
        const apiMsg =
          data?.error?.message ||
          data?.message ||
          `API 请求失败: ${response.status}`;
        throw new Error(apiMsg);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("API 返回为空，未获得分析结果。");
      }

      let aiContent;
      try {
        aiContent = JSON.parse(content);
      } catch (_err) {
        throw new Error("API 返回不是有效 JSON。");
      }

      // Strict output contract expected by content.js rendering:
      // { score: number, suggestions: [{ section, target, issue, rewrite }] }
      sendResponse({
        success: true,
        data: {
          score: Number.isFinite(aiContent.score) ? aiContent.score : 0,
          suggestions: Array.isArray(aiContent.suggestions) ? aiContent.suggestions.slice(0, 5) : []
        }
      });
    } catch (error) {
      console.error("CoopSync Background Error:", error);
      sendResponse({
        success: false,
        error: `分析失败: ${error?.message || "未知错误"}`
      });
    }
  });

  return true;
});
