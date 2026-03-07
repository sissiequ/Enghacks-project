/**
 * 核心后台逻辑 (Service Worker)
 * 负责：监听来自 content.js 的分析消息，调用 OpenRouter API 并返回 JSON 结果
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeJob") {
    // 调用异步函数处理请求
    handleJobAnalysis(request.jobDescription, sendResponse);
    // 返回 true 以表示我们将异步发送响应 (异步通道保持开启)
    return true;
  }
});

/**
 * 处理职位分析的异步函数
 */
async function handleJobAnalysis(jobDescription, sendResponse) {
  try {
    // 1. 获取本地存储的配置
    const storage = await chrome.storage.local.get(['apiKey', 'resumeText']);
    
    const rawApiKey = storage.apiKey || "";
    const apiKey = rawApiKey.trim();
    const resumeText = storage.resumeText || "";

    // 调试日志
    console.log("CoopSync: 正在读取存储中的 API Key... 长度为:", apiKey.length);

    // 2. 预检
    if (!apiKey || apiKey === "") {
      sendResponse({ 
        success: false, 
        error: "Authentication Failed: API Key 缺失。请在设置中重新保存 Key。" 
      });
      return;
    }

    if (resumeText.length < 50) {
      sendResponse({ 
        success: false, 
        error: "简历内容缺失：请先在设置页面上传并解析您的 PDF 简历。" 
      });
      return;
    }

    // 3. 定义请求函数（带重试逻辑）
    const fetchWithRetry = async (retries = 3, backoff = 1000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://github.com/coopsync/coopsync-ai",
            "X-Title": "CoopSync AI Assistant"
          },
          body: JSON.stringify({
            // 使用更稳定的模型 ID
            model: "google/gemini-2.0-flash-001",
            messages: [
              { 
                role: "system", 
                content: "你是一个专业的求职顾问。我会给你一份简历和一份职位描述。请分析两者的匹配度。你必须只返回一个合法的 JSON 对象，包含 score (0-100的数字) 和 suggestions (至少3条针对性的简历修改建议，字符串数组形式)。不要包含任何额外的描述文字或 Markdown 标签。" 
              },
              { 
                role: "user", 
                content: `我的简历内容：\n${resumeText}\n\n职位描述如下：\n${jobDescription}` 
              }
            ],
            response_format: { type: "json_object" }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.status === 429 && retries > 0) {
          // 频率限制，等待后重试
          await new Promise(resolve => setTimeout(resolve, backoff));
          return fetchWithRetry(retries - 1, backoff * 2);
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || `HTTP ${response.status}`);
        }

        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (retries > 0 && err.name !== 'AbortError') {
          await new Promise(resolve => setTimeout(resolve, backoff));
          return fetchWithRetry(retries - 1, backoff * 2);
        }
        throw err;
      }
    };

    // 4. 执行请求
    console.log("CoopSync: 正在发起分析请求...");
    const data = await fetchWithRetry();

    // 5. 解析结果
    if (!data.choices || data.choices.length === 0) {
      throw new Error("AI 未能返回任何有效预测内容。");
    }

    const aiRawContent = data.choices[0].message.content;
    let result;
    
    try {
      result = JSON.parse(aiRawContent);
    } catch (parseError) {
      console.error("JSON 解析失败:", aiRawContent);
      throw new Error("AI 返回的数据格式无法解析。");
    }

    // 6. 返回结果
    sendResponse({
      success: true,
      data: {
        score: result.score || 0,
        suggestions: result.suggestions || ["未能提取到具体的建议。"]
      }
    });

  } catch (error) {
    console.error("CoopSync 后台报错:", error);
    let userFriendlyError = error.message;
    if (error.name === 'AbortError') userFriendlyError = "请求超时，OpenRouter 响应慢。";
    
    sendResponse({ 
      success: false, 
      error: "分析失败: " + userFriendlyError 
    });
  }
}