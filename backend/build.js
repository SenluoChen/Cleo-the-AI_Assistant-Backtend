// simple build script: copy src/index.js -> dist/index.js
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(''));
const src = path.join(process.cwd(), 'src', 'index.js');
const outDir = path.join(process.cwd(), 'dist');
const dest = path.join(outDir, 'index.js');

if (!fs.existsSync(src)) {
  console.error('src/index.js not found');
  process.exit(1);
}
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Built dist/index.js from src/index.js');
