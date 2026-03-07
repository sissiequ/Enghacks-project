chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "analyzeJob") {
        console.log("Analyze Job requested from content script");

        chrome.storage.local.get(['geminiApiKey', 'resumeText'], async (data) => {

            if (!data.geminiApiKey) {
                sendResponse({
                    success: false,
                    error: "API Key not configured. Please set it in extension options."
                });
                return;
            }

            if (!data.resumeText) {
                sendResponse({
                    success: false,
                    error: "Resume not uploaded. Please upload resume text in options."
                });
                return;
            }

            try {

                const result = await callLLMAPI(
                    data.geminiApiKey,
                    data.resumeText,
                    request.jobDescription
                );

                sendResponse({
                    success: true,
                    data: result
                });

            } catch (error) {

                console.error("Error calling API:", error);

                sendResponse({
                    success: false,
                    error: error.message || "API request failed."
                });

            }

        });

        return true; // keep message channel open for async
    }
});


// ---- LLM API call (OpenRouter / OpenAI-compatible) ----
async function callLLMAPI(apiKey, resumeText, jdText) {

    const url = "https://openrouter.ai/api/v1/chat/completions";

    const prompt = `
You are an expert technical recruiter and harsh resume reviewer for top tech companies (like WaterlooWorks employers).

I will provide you with a Job Description and a student's Resume.

Your task is to critically analyze how well the resume matches the job description. 
DO NOT give a generic middle score. Be highly analytical.

Scoring rules:
- 90-100: Exceptional match. They have almost all required skills and experience.
- 70-89: Strong match. Meets core requirements but might lack some nice-to-haves.
- 50-69: Weak match. Missing key required languages/tools.
- 0-49: Poor match. Unrelated field or severely lacking standard requirements.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

SCORE: [0-100]

SUGGESTIONS:
- [Section Name]: [Specific advice on what to add/change based on the JD]
- [Section Name]: [Specific advice on what to add/change based on the JD]
- [Section Name]: [Specific advice on what to add/change based on the JD]

JOB DESCRIPTION:
${jdText.substring(0, 6000)}

RESUME:
${resumeText.substring(0, 8000)}
`;

    const payload = {
        model: "openai/gpt-4o-mini",
        messages: [
            {
                role: "user",
                content: prompt
            }
        ],
        temperature: 0.2
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://waterlooworks.uwaterloo.ca/",
            "X-Title": "CoopSync AI Resume Optimizer"
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API Error: ${err}`);
    }

    const result = await response.json();

    const textResponse =
        result?.choices?.[0]?.message?.content || "";

    return parseResponse(textResponse);
}


// ---- Parse model output ----
function parseResponse(text) {

    let score = 0;
    let analysis = "";
    let suggestions = [];

    try {

        const scoreMatch = text.match(/SCORE:\s*(\d+)/i);

        if (scoreMatch) {
            score = parseInt(scoreMatch[1]);
        }

        // We removed analysis from the prompt, so this might be null.
        const analysisMatch =
            text.match(/ANALYSIS:[\s\S]*?(?=SUGGESTIONS:|$)/i);

        if (analysisMatch) {
            analysis = analysisMatch[0]
                .replace(/ANALYSIS:/i, "")
                .trim();
        }

        const suggestionsMatch =
            text.match(/SUGGESTIONS:[\s\S]*$/i);

        if (suggestionsMatch) {

            const sugText =
                suggestionsMatch[0]
                    .replace(/SUGGESTIONS:/i, "")
                    .trim();

            suggestions = sugText
                .split("\n")
                .filter(line => line.trim().startsWith("-"))
                .map(line => line.replace("-", "").trim());
        }

        return {
            score,
            analysis,
            suggestions,
            raw: text
        };

    } catch (e) {

        console.error("Failed to parse model response:", e);

        return {
            score: 0,
            analysis: "Failed to parse model output.",
            suggestions: [],
            raw: text
        };

    }
}