/**
 * Input:
 * - savedApiKey: string, OpenRouter API key
 * - messages: Array<{ role: string, content: string }>
 * Output:
 * - Promise<object>: parsed JSON object returned by the AI model
 */
async function callOpenRouter(savedApiKey, messages) {
  // External API call (network):
  // Endpoint: https://openrouter.ai/api/v1/chat/completions
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

  // Parse provider response body if possible.
  let data;
  try {
    data = await response.json();
  } catch (_err) {
    data = {};
  }

  // Normalize non-2xx errors into readable messages.
  if (!response.ok) {
    const apiMsg =
      data?.error?.message ||
      data?.message ||
      `API request failed: ${response.status}`;
    throw new Error(apiMsg);
  }

  // Extract model JSON payload from OpenRouter chat schema.
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("The AI provider returned an empty response.");
  }

  // Model is instructed to return JSON text; parse and validate it.
  try {
    return JSON.parse(content);
  } catch (_err) {
    throw new Error("The AI provider returned invalid JSON.");
  }
}

globalThis.callOpenRouter = callOpenRouter;
