const apiKey = "AIzaSyD0XDL_p8oxiZ0ww4rw3AAe8WSZnSkuw0k";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

const payload = {
    contents: [{
        parts: [{ text: "Hello, testing API key." }]
    }]
};

fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
})
    .then(res => res.json().then(data => ({ status: res.status, data })))
    .then(result => {
        console.log("Status:", result.status);
        console.log("Response:", JSON.stringify(result.data, null, 2));
    })
    .catch(err => console.error("Error:", err));
