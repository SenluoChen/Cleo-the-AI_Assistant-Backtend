// Source copy of the runtime index.js to allow editing and rebuilding
// This file mirrors the built artifact in dist/index.js and contains
// the fix to lazy-load the OpenAI constructor via getOpenAi().
// Keep this file as the canonical editable source; run `npm run build`
// to copy it to dist/index.js used by the local-api.

// lazily import OpenAI only when needed
let openAiPromise = null;
async function getOpenAi() {
    if (openAiPromise) return openAiPromise;
    openAiPromise = (async () => {
        try { const mod = await import('openai'); return mod?.default ?? mod; } catch { return null }
    })();
    return openAiPromise;
}
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let awsSdkPromise = null;
async function getAwsSdk() {
    if (awsSdkPromise)
        return awsSdkPromise;
    awsSdkPromise = (async () => {
        try {
            const mod = await import('aws-sdk');
            return mod?.default ?? mod;
        }
        catch {
            return null;
        }
    })();
    return awsSdkPromise;
}

let secrets = null;
async function getSecretsManager() {
    if (secrets)
        return secrets;
    const AWS = await getAwsSdk();
    if (!AWS) {
        throw new Error('aws-sdk is required when using OPENAI_SECRET_ID. For local use, set OPENAI_API_KEY to avoid AWS SecretsManager.');
    }
    secrets = new AWS.SecretsManager();
    return secrets;
}
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
        const OpenAI = await getOpenAi();
        if (!OpenAI) {
            throw new Error('openai package is not available; install the "openai" npm package or set MOCK_OPENAI=true');
        }
        client = new OpenAI({ apiKey: directKey });
        return client;
    }
    const secretId = process.env.OPENAI_SECRET_ID;
    if (!secretId)
        throw new Error('OPENAI_SECRET_ID is not configured (or set OPENAI_API_KEY for local dev)');
    const sm = await getSecretsManager();
    const sec = await sm.getSecretValue({ SecretId: secretId }).promise();
    const parsed = JSON.parse(sec.SecretString || '{}');
    const key = parsed.OPENAI_API_KEY || parsed.OPENAI_KEY;
    if (!key)
        throw new Error('OPENAI_API_KEY not found in secret');
    const OpenAI = await getOpenAi();
    if (!OpenAI) {
        throw new Error('openai package is not available; install the "openai" npm package or set MOCK_OPENAI=true');
    }
    client = new OpenAI({ apiKey: key });
    return client;
}

function sanitizeHistoryMessages(messages) {
    if (!Array.isArray(messages))
        return [];
    return messages
        .filter((m) => m && typeof m === 'object')
        .map((m) => {
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        const content = typeof m.content === 'string' ? m.content : String(m.content ?? '');
        return { role, content };
    })
        .filter((m) => m.content.trim().length > 0);
}

function getPositiveIntEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const n = Number.parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trimHistoryMessages(history) {
    if (!Array.isArray(history) || history.length === 0)
        return [];
    const maxMessages = getPositiveIntEnv('MAX_HISTORY_MESSAGES', 40);
    const maxChars = getPositiveIntEnv('MAX_HISTORY_CHARS', 12000);

    let totalChars = 0;
    const keptReversed = [];
    for (let i = history.length - 1; i >= 0; i--) {
        const m = history[i];
        const content = typeof m?.content === 'string' ? m.content : String(m?.content ?? '');
        const nextTotal = totalChars + content.length;

        if (keptReversed.length >= maxMessages)
            break;
        if (nextTotal > maxChars && keptReversed.length > 0)
            break;

        totalChars = nextTotal;
        keptReversed.push(m);
    }
    return keptReversed.reverse();
}

function normalizeImageDataUrl(image) {
    if (!image)
        return null;
    const raw = String(image).trim();
    if (!raw)
        return null;
    if (raw.startsWith('data:image/'))
        return raw;
    if (raw.startsWith('data:') && raw.includes(';base64,'))
        return raw;
    const b64 = raw.replace(/^data:.*;base64,/, '');
    return `data:image/png;base64,${b64}`;
}

function trySaveScreenshotToTemp(image) {
    if (!image)
        return null;
    try {
        const m = String(image).match(/^data:(image\/[^;]+);base64,(.+)$/);
        const mime = m ? m[1] : 'image/png';
        const b64 = m ? m[2] : String(image).replace(/^data:.*;base64,/, '');
        const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
        const filename = `screenshot-${Date.now()}.${ext}`;
        const filePath = path.join(os.tmpdir(), filename);
        fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
        return filePath;
    }
    catch {
        return null;
    }
}

export async function* streamAnswer(input) {
    const openai = await getClient();
    const streamStart = Date.now();
    let seenFirstDelta = false;
    const system = [
        "You are a helpful assistant.",
        "Reply in natural Traditional Chinese.",
        "Format your answer using GitHub-flavored Markdown (like ChatGPT): paragraphs, bullet/numbered lists, code fences with language tags, and tables when helpful.",
        "Keep structure clean: use short sections and whitespace; avoid huge unbroken text blocks.",
    ].join("\n");

    const question = typeof input === 'string' ? input : input?.question;
    const image = typeof input === 'object' && input ? input.image : undefined;
    const imageUrl = normalizeImageDataUrl(image);
    const history = typeof input === 'object' && input ? sanitizeHistoryMessages(input.messages) : [];

    const trimmedQuestion = typeof question === 'string' ? question.trim() : '';
    let userText = trimmedQuestion;
    const historyCopy = [...trimHistoryMessages(history)];

    if (!userText) {
        for (let i = historyCopy.length - 1; i >= 0; i--) {
            if (historyCopy[i].role === 'user') {
                userText = historyCopy[i].content.trim();
                historyCopy.splice(i, 1);
                break;
            }
        }
    }

    if (!userText) {
        throw new Error('Missing question');
    }

    if (trimmedQuestion && historyCopy.length > 0) {
        const last = historyCopy[historyCopy.length - 1];
        if (last.role === 'user' && last.content.trim() === userText) {
            historyCopy.pop();
        }
    }

    const userMessage = imageUrl
        ? {
            role: 'user',
            content: [
                { type: 'text', text: userText },
                { type: 'image_url', image_url: { url: imageUrl } },
            ],
        }
        : { role: 'user', content: userText };

    const promptMessages = [{ role: 'system', content: system }, ...historyCopy, userMessage];

    if (process.env.MOCK_OPENAI === 'true') {
        yield `MOCK_RESPONSE:${JSON.stringify(promptMessages)}`;
        return;
    }

    const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: promptMessages,
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
        const { question, image, messages } = JSON.parse(event.body || "{}");
        const imageUrl = normalizeImageDataUrl(image);
        const history = sanitizeHistoryMessages(messages);
        const trimmedQuestion = typeof question === 'string' ? question.trim() : '';
        let userText = trimmedQuestion;
        const historyCopy = [...trimHistoryMessages(history)];

        if (!userText) {
            for (let i = historyCopy.length - 1; i >= 0; i--) {
                if (historyCopy[i].role === 'user') {
                    userText = historyCopy[i].content.trim();
                    historyCopy.splice(i, 1);
                    break;
                }
            }
        }

        if (!userText)
            return resp(400, "Missing question");

        if (trimmedQuestion && historyCopy.length > 0) {
            const last = historyCopy[historyCopy.length - 1];
            if (last.role === 'user' && last.content.trim() === userText) {
                historyCopy.pop();
            }
        }

        const userMessage = imageUrl
            ? {
                role: 'user',
                content: [
                    { type: 'text', text: userText },
                    { type: 'image_url', image_url: { url: imageUrl } },
                ],
            }
            : { role: 'user', content: userText };
        const openai = await getClient();
        const system = [
            "You are a helpful assistant.",
            "Reply in natural Traditional Chinese.",
            "Format your answer using GitHub-flavored Markdown (like ChatGPT): paragraphs, bullet/numbered lists, code fences with language tags, and tables when helpful.",
            "Keep structure clean: use short sections and whitespace; avoid huge unbroken text blocks.",
        ].join("\n");
        const completionStart = Date.now();
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: system }, ...historyCopy, userMessage],
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
