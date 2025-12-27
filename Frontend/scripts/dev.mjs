import { spawn } from "child_process";
import http from "http";
import net from "net";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    socket.once("connect", () => done(true));
    socket.once("error", (err) => {
      // ECONNREFUSED means nothing is listening (good). Any other error treat as "in use".
      const code = err?.code;
      if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EHOSTUNREACH") {
        done(false);
        return;
      }
      done(true);
    });
    socket.setTimeout(300, () => done(true));
  });
}

async function isPortFree(port) {
  // If anything is listening on either IPv4 or IPv6 localhost, treat it as occupied.
  const ipv4Busy = await canConnect("127.0.0.1", port);
  const ipv6Busy = await canConnect("::1", port);
  return !(ipv4Busy || ipv6Busy);
}

async function findFreePort(startPort) {
  let port = startPort;
  while (!(await isPortFree(port))) port += 1;
  return port;
}

function waitForHttpOk(url, timeoutMs) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }

      const req = http.get(url, (res) => {
        res.resume();
        // Vite root should respond quickly (often 200).
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        setTimeout(attempt, 300);
      });

      req.on("error", () => {
        setTimeout(attempt, 300);
      });
    };

    attempt();
  });
}

function spawnChild(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    windowsHide: false,
    shell: process.platform === "win32"
  });
}

async function main() {
  const requestedPort = Number.parseInt(process.env.VITE_PORT ?? "5173", 10);
  const port = await findFreePort(Number.isFinite(requestedPort) ? requestedPort : 5173);
  const devUrl = `http://localhost:${port}`;

  console.log(`[DEV] Using Vite dev server: ${devUrl}`);

  const tsc = spawnChild(npmCmd, ["run", "dev:tsc"]);
  const vite = spawnChild(npmCmd, ["run", "dev:renderer", "--", "--port", String(port), "--strictPort"]);

  await waitForHttpOk(devUrl, 60_000);

  const electron = spawnChild(npxCmd, ["--no-install", "cross-env", `VITE_DEV_SERVER_URL=${devUrl}`, "electron", "."]);

  const children = [tsc, vite, electron];

  const shutdown = () => {
    for (const child of children) {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
  };

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });

  // If any child exits, shut down the rest.
  for (const child of children) {
    child.on("exit", (code) => {
      if (code && code !== 0) {
        console.log(`[DEV] Child exited with code ${code}; shutting down.`);
      }
      shutdown();
      process.exit(code ?? 0);
    });
  }
}

main().catch((err) => {
  console.error("[DEV] Failed:", err);
  process.exit(1);
});
