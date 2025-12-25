"use strict";
process.env.MOCK_OPENAI = "true";
process.env.OPENAI_SECRET_ID = "dummy";
async function run() {
    const { handler } = await import("./index.js");
    const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6X1pKcAAAAASUVORK5CYII=";
    const result = await handler({
        body: JSON.stringify({
            question: "請分析這張截圖並描述重點",
            image: `data:image/png;base64,${pngB64}`,
        }),
    });
    console.log("Lambda response:", result);
}
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
