#!/usr/bin/env node
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const candidates = [
    path.join(projectRoot, "public", "cleo-logo.png"),
    path.join(projectRoot, "public", "cleo logo.png"),
  ].filter((p) => fs.existsSync(p));

  if (candidates.length === 0) {
    console.error(
      "Source image not found. Expected one of:",
      path.join(projectRoot, "public", "cleo-logo.png"),
      "or",
      path.join(projectRoot, "public", "cleo logo.png"),
    );
    process.exit(1);
  }

  const src = candidates
    .map((p) => ({ p, mtimeMs: fs.statSync(p).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;

  console.log("Using source image:", src);

  const outDir = path.join(projectRoot, "build");
  const iconsDir = path.join(outDir, "icons");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(iconsDir, { recursive: true });

  let tmpFiles = [];

  try {
    // Generate multiple PNG sizes using sharp, then combine into a multi-size .ico
    const sizes = [16, 32, 48, 64, 128, 256];
    tmpFiles = [];
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default ?? sharpModule;
    for (const s of sizes) {
      const tmp = path.join(outDir, `tmp-${s}.png`);
      await sharp(src).resize(s, s, { fit: 'contain' }).png().toFile(tmp);
      tmpFiles.push(tmp);
    }

    const icoBuffer = await pngToIco(tmpFiles);

    const targets = [
      path.join(outDir, "icon.ico"),
      path.join(iconsDir, "icon.ico"),
      path.join(iconsDir, "installerIcon.ico"),
      path.join(iconsDir, "uninstallerIcon.ico"),
    ];

    for (const t of targets) {
      fs.writeFileSync(t, icoBuffer);
      console.log("Wrote", t);
    }
  } finally {
    for (const f of (tmpFiles || [])) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
