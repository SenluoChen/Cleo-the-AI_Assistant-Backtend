import AWS from 'aws-sdk';
import OpenAI from 'openai';
const secrets = new AWS.SecretsManager();
let client = null;
async function getClient() {
    if (client)
        return client;
    if (process.env.MOCK_OPENAI === 'true') {
        client = {
            chat: {
                completions: {
                    create: async ({ messages }) => ({
                        choices: [
                            {
                                message: {
                                    content: `MOCK_RESPONSE:${JSON.stringify(messages)}`,
                                },
                            },
                        ],
                    }),
                },
            },
        };
        return client;
    }
    const directKey = process.env.OPENAI_API_KEY;
    if (directKey) {
        client = new OpenAI({ apiKey: directKey });
        return client;
    }
    const secretId = process.env.OPENAI_SECRET_ID;
    if (!secretId)
        throw new Error('OPENAI_SECRET_ID is not configured (or set OPENAI_API_KEY for local dev)');
    const sec = await secrets.getSecretValue({ SecretId: secretId }).promise();
    const parsed = JSON.parse(sec.SecretString || '{}');
    const key = parsed.OPENAI_API_KEY || parsed.OPENAI_KEY;
    if (!key)
        throw new Error('OPENAI_API_KEY not found in secret');
    client = new OpenAI({ apiKey: key });
    return client;
}

export async function* streamAnswer(question) {
    const openai = await getClient();
    const streamStart = Date.now();
    let seenFirstDelta = false;
    const system = [
        "You are a helpful assistant.",
        "Reply in natural Traditional Chinese.",
        "Format your answer using GitHub-flavored Markdown (like ChatGPT): paragraphs, bullet/numbered lists, code fences with language tags, and tables when helpful.",
        "Keep structure clean: use short sections and whitespace; avoid huge unbroken text blocks.",
    ].join("\n");

    // Mock path: yield a quick response for dev.
    if (process.env.MOCK_OPENAI === 'true') {
        yield `MOCK_RESPONSE:${JSON.stringify([{ role: 'system', content: system }, { role: 'user', content: question }])}`;
        return;
    }

    // OpenAI streaming
    const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: system },
            { role: "user", content: question },
        ],
        temperature: 0.2,
        max_tokens: 600,
        stream: true,
    });

    for await (const part of stream) {
        const delta = part?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
            if (!seenFirstDelta) {
                seenFirstDelta = true;
                const ttf = Date.now() - streamStart;
                console.debug(`[STREAM] first-delta ${ttf} ms for question len=${String(question).length}`);
            }
            yield delta;
        }
    }
}
export const handler = async (event) => {
    try {
        const start = Date.now();
        if (!event.body)
            return resp(400, "Missing body");
        const { question, image } = JSON.parse(event.body || "{}");
        if (!question)
            return resp(400, "Missing question");
        const openai = await getClient();
        if (image) {
            console.warn("Image payload received but screenshot support is disabled. Ignoring image.");
        }
        const system = [
            "You are a helpful assistant.",
            "Reply in natural Traditional Chinese.",
            "Format your answer using GitHub-flavored Markdown (like ChatGPT): paragraphs, bullet/numbered lists, code fences with language tags, and tables when helpful.",
            "Keep structure clean: use short sections and whitespace; avoid huge unbroken text blocks.",
        ].join("\n");
        const completionStart = Date.now();
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: system },
                { role: "user", content: question },
            ],
            temperature: 0.2,
            max_tokens: 600,
        });
        const completionMs = Date.now() - completionStart;
        const totalMs = Date.now() - start;
        console.debug(`[ANALYZE] completion ${completionMs} ms, total ${totalMs} ms`);
        return resp(200, { answer: completion.choices?.[0]?.message?.content ?? "", _timing: { completionMs, totalMs } });
    }
    catch (err) {
        console.error("Analyze error", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return resp(500, { error: message });
    }
};
const resp = (status, body) => ({
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: typeof body === "string" ? body : JSON.stringify(body),
});
