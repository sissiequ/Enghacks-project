chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "analyzeJob") return;

  chrome.storage.local.get(["apiKey", "geminiApiKey"], async (result) => {
    const savedApiKey = (result.apiKey || result.geminiApiKey || "").trim();

    if (!savedApiKey) {
      sendResponse({
        success: false,
        error: "未检测到 API Key，请在插件 Options 页面保存后重试。"
      });
      return;
    }

    try {
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
                "你是求职助手。请输出 JSON 对象，包含 score(0-100整数) 和 suggestions(字符串数组，最多5条)。"
            },
            {
              role: "user",
              content: `职位描述如下：\n${request.jobDescription || ""}`
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

      sendResponse({
        success: true,
        data: {
          score: Number.isFinite(aiContent.score) ? aiContent.score : 0,
          suggestions: Array.isArray(aiContent.suggestions) ? aiContent.suggestions : []
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
