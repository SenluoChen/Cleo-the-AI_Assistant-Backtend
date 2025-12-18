import http from "node:http";

import { handler } from "./index.js";

const PORT = Number.parseInt(process.env.PORT ?? "8787", 10);

if (process.env.MOCK_OPENAI === undefined) {
  process.env.MOCK_OPENAI = process.env.OPENAI_API_KEY ? "false" : "true";
}

function sendJson(res, statusCode, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extraHeaders,
  });
  res.end(body);
}

function sendText(res, statusCode, text, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extraHeaders,
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      if (rawBody.length > 5_000_000) {
        req.destroy(new Error("Request body too large"));
      }
    });

    await new Promise((resolve, reject) => {
      req.on("end", resolve);
      req.on("error", reject);
    });

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
  console.log(`Local API listening on http://localhost:${PORT}`);
  console.log(`- POST http://localhost:${PORT}/analyze`);
  console.log(`- GET  http://localhost:${PORT}/health`);
  console.log(`MOCK_OPENAI=${process.env.MOCK_OPENAI}`);
});
