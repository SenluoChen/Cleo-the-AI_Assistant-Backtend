"use strict";
const maybeFetch = globalThis.fetch;
if (!maybeFetch) {
    throw new Error("Global fetch API not available in this Node runtime. Please use Node.js 18+.");
}
const fetchFn = maybeFetch;
async function main() {
    const endpoint = process.env.TEST_API_URL;
    if (!endpoint) {
        throw new Error("TEST_API_URL environment variable must be set to the deployed /analyze endpoint.");
    }
    const question = process.env.TEST_QUESTION ?? "What do you want to ask?";
    const payload = { question };
    console.log("Sending request to", endpoint);
    console.log("Question:", question);
    if (process.env.TEST_IMAGE_PATH) {
        console.log("⚠️ TEST_IMAGE_PATH is set but screenshot support is disabled; ignoring image.");
    }
    const res = await fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log("Status:", res.status, res.statusText);
    console.log("Raw body:", text);
    if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
    }
    try {
        const parsed = JSON.parse(text);
        console.log("Parsed answer:", parsed.answer ?? parsed);
    }
    catch (err) {
        console.warn("Failed to parse JSON response", err);
    }
}
main().catch((err) => {
    console.error("Integration test failed:", err);
    process.exit(1);
});
