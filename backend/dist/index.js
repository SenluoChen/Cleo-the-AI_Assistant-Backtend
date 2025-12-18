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
export const handler = async (event) => {
    try {
        if (!event.body)
            return resp(400, "Missing body");
        const { question, image } = JSON.parse(event.body || "{}");
        if (!question)
            return resp(400, "Missing question");
        const openai = await getClient();
        if (image) {
            console.warn("Image payload received but screenshot support is disabled. Ignoring image.");
        }
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: question }],
            temperature: 0.2,
            max_tokens: 600,
        });
        return resp(200, { answer: completion.choices?.[0]?.message?.content ?? "" });
    }
    catch (err) {
        console.error("Analyze error", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        return resp(500, { error: message });
    }
};
const resp = (status, body) => ({
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
});
