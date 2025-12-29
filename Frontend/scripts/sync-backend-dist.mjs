import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(frontendRoot, "..");

const srcDist = process.env.BACKEND_DIST_DIR
  ? path.resolve(process.env.BACKEND_DIST_DIR)
  : path.resolve(repoRoot, "backend", "dist");

const destDist = path.resolve(frontendRoot, "vendor", "backend-dist");

const ensureDir = (p) => fs.mkdirSync(p, { recursive: true });
const rmDir = (p) => fs.rmSync(p, { recursive: true, force: true });

const copyDir = (from, to) => {
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dst);
    }
  }
};

if (!fs.existsSync(srcDist)) {
  console.error(`[prepare-backend] backend dist not found: ${srcDist}`);
  console.error(`[prepare-backend] Build backend first, or set BACKEND_DIST_DIR to a folder containing index.js`);
  process.exit(1);
}

const required = ["index.js"];
for (const f of required) {
  const p = path.join(srcDist, f);
  if (!fs.existsSync(p)) {
    console.error(`[prepare-backend] missing ${f} in ${srcDist}`);
    process.exit(1);
  }
}

rmDir(destDist);
copyDir(srcDist, destDist);

console.log(`[prepare-backend] synced ${srcDist} -> ${destDist}`);
