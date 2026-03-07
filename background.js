/**
 * 核心后台逻辑 (Service Worker)
 * 负责：监听来自 content.js 的消息并调用 API
 * 禁止：使用 document, window, alert
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeJob") {
    
    // 1. 从存储中读取用户通过 options 页面保存的 Key
    chrome.storage.local.get(['apiKey'], async (result) => {
      const savedApiKey = result.apiKey;

      if (!savedApiKey || savedApiKey.trim() === "") {
        sendResponse({ 
          success: false, 
          error: "未检测到 API Key，请右键点击插件图标进入“选项”进行配置。" 
        });
        return;
      }

      try {
        // 2. 发起 API 请求 (这里以 OpenAI 为例，你也可以根据需要更换 API 地址)
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${savedApiKey.trim()}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              { 
                role: "system", 
                content: "你是一个专业的求职顾问。请根据职位描述给出建议。必须返回 JSON 格式，包含 score (0-100的数字) 和 suggestions (字符串数组)。" 
              },
              { 
                role: "user", 
                content: `职位描述如下：${request.jobDescription}` 
              }
            ],
            response_format: { type: "json_object" }
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || `API 请求失败: ${response.status}`);
        }

        // 3. 解析并返回结果
        const aiContent = JSON.parse(data.choices[0].message.content);
        
        sendResponse({ 
          success: true, 
          data: {
            score: aiContent.score || 0,
            suggestions: aiContent.suggestions || []
          } 
        });

      } catch (error) {
        console.error("CoopSync Background Error:", error);
        sendResponse({ 
          success: false, 
          error: "分析失败: " + error.message 
        });
      }
    });

    // 必须返回 true 以支持异步回调
    return true; 
  }
});