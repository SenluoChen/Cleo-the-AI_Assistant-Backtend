"use strict";
process.env.MOCK_OPENAI = "true";
process.env.OPENAI_SECRET_ID = "dummy";
async function run() {
    const { handler } = await import("./index.js");
    const result = await handler({
        body: JSON.stringify({ question: "Just text analysis" }),
    });
    console.log("Lambda response:", result);
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
