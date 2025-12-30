import * as http from "node:http";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import { app } from "electron";

type StreamAnswer = (input: unknown) => AsyncGenerator<string, void, void>;
type Handler = (evt: { body: string; headers: http.IncomingHttpHeaders; httpMethod: string; path: string }) => Promise<{
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
}>;

type BackendModule = {
  streamAnswer: StreamAnswer;
  handler: Handler;
};

let backendModulePromise: Promise<BackendModule> | null = null;

const getBackendIndexPath = (): string => {
  // Packaged: ship backend-dist inside app.asar so it can resolve app dependencies.
  if (app.isPackaged) {
    return path.join(app.getAppPath(), "backend-dist", "index.js");
  }

  // Dev: allow running from this monorepo layout.
  // In dev via scripts/dev.mjs, cwd is Frontend/.
  return path.resolve(process.cwd(), "..", "backend", "dist", "index.js");
};

const loadBackendModule = async (): Promise<BackendModule> => {
  if (backendModulePromise) return backendModulePromise;
  backendModulePromise = (async () => {
    const p = getBackendIndexPath();
    // TS compiles this file under a CommonJS main process build.
    // Using a Function wrapper forces Node's native dynamic import so it can load ESM backend code.
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)"
    ) as (specifier: string) => Promise<unknown>;
    const modUnknown = await dynamicImport(pathToFileURL(p).toString());
    const mod = modUnknown as Partial<BackendModule>;
    if (!mod?.streamAnswer || !mod?.handler) {
      throw new Error(`backend module missing streamAnswer: ${p}`);
    }
    return mod as BackendModule;
  })();
  return backendModulePromise;
};

const DEFAULT_MAX_BODY_BYTES = 25_000_000;

const isSseRequest = (req: http.IncomingMessage) => {
  const accept = String(req.headers?.accept ?? "").toLowerCase();
  return accept.includes("text/event-stream");
};

const writeSse = (res: http.ServerResponse, event: string, data: unknown) => {
  const payload = JSON.stringify(data);
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
};

const sendJson = (res: http.ServerResponse, statusCode: number, obj: unknown, extraHeaders: Record<string, string> = {}) => {
  const body = JSON.stringify(obj);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    ...extraHeaders
  });
  res.end(body);
};

const sendText = (res: http.ServerResponse, statusCode: number, text: string, extraHeaders: Record<string, string> = {}) => {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    ...extraHeaders
  });
  res.end(text);
};

export type LocalApiServerHandle = {
  port: number;
  close: () => Promise<void>;
};

export async function startLocalApiServer(opts?: { port?: number; host?: string; maxBodyBytes?: number }): Promise<LocalApiServerHandle> {
  const backend = await loadBackendModule();

  const host = opts?.host ?? "127.0.0.1";
  const port = Number.parseInt(String(opts?.port ?? process.env.LOCAL_API_PORT ?? process.env.PORT ?? "8787"), 10);
  const maxBodyBytes = Number.parseInt(String(opts?.maxBodyBytes ?? process.env.LOCAL_API_MAX_BODY_BYTES ?? ""), 10) || DEFAULT_MAX_BODY_BYTES;

  // Ensure these are set similarly to backend local-api defaults.
  if (process.env.MOCK_OPENAI === undefined) {
    process.env.MOCK_OPENAI = process.env.OPENAI_API_KEY ? "false" : "true";
  }
  if (process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE === undefined) {
    process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = "1";
  }

  const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept"
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
      req.on("data", (chunk: string) => {
        rawBody += chunk;
        if (rawBody.length > maxBodyBytes) {
          if (!res.writableEnded) {
            sendJson(res, 413, { error: `Request body too large (max ${maxBodyBytes} bytes)` });
          }
          req.destroy();
        }
      });

      await new Promise<void>((resolve, reject) => {
        req.on("end", () => resolve());
        req.on("error", reject);
      });

      if (isSseRequest(req)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody || "{}");
        } catch {
          return sendJson(res, 400, { error: "Invalid JSON" });
        }

        const parsedObj = (typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}) as Record<
          string,
          unknown
        >;

        const question = parsedObj["question"];
        const messages = parsedObj["messages"];
        if (!question && (!Array.isArray(messages) || messages.length === 0)) {
          return sendJson(res, 400, { error: "Missing question" });
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept"
        });

        writeSse(res, "meta", { ok: true });

        try {
          const input = Array.isArray(messages) && messages.length > 0
            ? { question, messages, image: parsedObj["image"] }
            : { question, image: parsedObj["image"] };

          for await (const chunk of backend.streamAnswer(input)) {
            writeSse(res, "delta", { delta: chunk });
          }
          writeSse(res, "done", { done: true });
        } catch (e) {
          writeSse(res, "error", { error: e instanceof Error ? e.message : String(e) });
        }

        return res.end();
      }

      const lambdaResult = await backend.handler({
        body: rawBody,
        headers: req.headers,
        httpMethod: "POST",
        path: "/analyze"
      });

      const statusCode = Number(lambdaResult?.statusCode ?? 200);
      const headers = lambdaResult?.headers ?? {};
      const body = lambdaResult?.body ?? "";

      res.writeHead(statusCode, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        ...headers
      });
      res.end(body);
      return;
    } catch (e) {
      return sendJson(res, 500, { error: e instanceof Error ? e.message : "Internal Server Error" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  return {
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      })
  };
}
