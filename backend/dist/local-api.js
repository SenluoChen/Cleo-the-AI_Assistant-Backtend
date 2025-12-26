import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(envPath) {
  try {
    if (!fs.existsSync(envPath)) return false;
    const raw = fs.readFileSync(envPath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("\'") && val.endsWith("\'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    });
    return true;
  } catch {
    return false;
  }
}

// Simple .env loader for the built local-api.
// Support both:
// - running from backend/ (CWD has .env)
// - running from repo root (backend/.env)
// - running from anywhere (resolve relative to this dist file)
(() => {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "backend", ".env"),
    path.join(__dirname, "..", ".env"),
  ];

  for (const p of candidates) {
    if (loadEnvFile(p)) break;
  }
})();

// Suppress AWS SDK v2 maintenance warning (it writes to stderr and can break PowerShell job runners)
if (process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE === undefined) {
  process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";
}

let handler;
let streamAnswer;

async function loadHandlers() {
  // Dynamic import so env vars above are applied before index.js loads.
  const mod = await import("./index.js");
  handler = mod.handler;
  streamAnswer = mod.streamAnswer;
}

await loadHandlers();

const PORT = Number.parseInt(process.env.LOCAL_API_PORT ?? process.env.PORT ?? "8787", 10);

const MAX_BODY_BYTES = (() => {
  const raw = Number.parseInt(process.env.LOCAL_API_MAX_BODY_BYTES ?? "", 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  // Screenshots can be several MB once base64-encoded; keep a safer default.
  return 25_000_000;
})();

if (process.env.MOCK_OPENAI === undefined) {
  process.env.MOCK_OPENAI = process.env.OPENAI_API_KEY ? "false" : "true";
}

function sendJson(res, statusCode, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, statusCode, text, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    ...extraHeaders,
  });
  res.end(text);
}

function isSseRequest(req) {
  const accept = String(req.headers?.accept ?? "").toLowerCase();
  return accept.includes("text/event-stream");
}

function writeSse(res, event, data) {
  // data must be a single line per SSE spec; send JSON so we can safely include newlines.
  const payload = JSON.stringify(data);
  if (event) {
    res.write(`event: ${event}\n`);
  }
  res.write(`data: ${payload}\n\n`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      });
      return res.end();
    }

    if (req.method === "GET" && url.pathname === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "POST" || url.pathname !== "/analyze") {
      return sendText(res, 404, "Not Found");
    }

    let rawBody = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > MAX_BODY_BYTES) {
        if (!res.writableEnded) {
          sendJson(res, 413, { error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` });
        }
        req.destroy();
      }
    });

    await new Promise((resolve, reject) => {
      req.on("end", resolve);
      req.on("error", reject);
    });

    // Streaming (SSE) mode: stream token deltas to client.
    if (isSseRequest(req)) {
      let parsed;
      try {
        parsed = JSON.parse(rawBody || "{}");
      } catch {
        return sendJson(res, 400, { error: "Invalid JSON" });
      }

      const question = parsed?.question;
      const messages = parsed?.messages;
      if (!question && (!Array.isArray(messages) || messages.length === 0)) {
        return sendJson(res, 400, { error: "Missing question" });
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      });

      writeSse(res, "meta", { ok: true });

      try {
        const input = Array.isArray(messages) && messages.length > 0 ? { question, messages, image: parsed?.image } : { question, image: parsed?.image };
        for await (const chunk of streamAnswer(input)) {
          writeSse(res, "delta", { delta: chunk });
        }
        writeSse(res, "done", { done: true });
      } catch (e) {
        writeSse(res, "error", { error: e instanceof Error ? e.message : String(e) });
      }

      return res.end();
    }

    const lambdaResult = await handler({
      body: rawBody,
      headers: req.headers,
      httpMethod: "POST",
      path: "/analyze",
    });

    const statusCode = Number(lambdaResult?.statusCode ?? 200);
    const headers = lambdaResult?.headers ?? {};
    const body = lambdaResult?.body ?? "";

    res.writeHead(statusCode, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...headers,
    });
    res.end(body);
  } catch (err) {
    console.error("local-api error", err);
    return sendJson(res, 500, { error: "Internal Server Error" });
  }
});

server.on("error", (err) => {
  if (err && typeof err === "object" && "code" in err && err.code === "EADDRINUSE") {
    console.log(`Local API already running on http://127.0.0.1:${PORT}`);
    process.exit(0);
  }

  console.error("local-api listen error", err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Local API listening on http://127.0.0.1:${PORT}`);
  console.log(`- POST http://127.0.0.1:${PORT}/analyze`);
  console.log(`- GET  http://127.0.0.1:${PORT}/health`);
  console.log(`MOCK_OPENAI=${process.env.MOCK_OPENAI}`);
});
