# Cleo Frontend (Electron + React)

This folder is a standalone Electron desktop app (Vite + React renderer).

## Requirements

- Node.js 18+
- npm 9+

## Setup

```powershell
cd Frontend
npm install
```

## Configure

Create `Frontend/.env` (optional) or copy from `.env.example`.

Important variables:

- `VITE_ANALYZE_URL` (defaults to `http://127.0.0.1:8787/analyze`)
  - Point this to wherever you run the backend.

Performance-related (optional):

- `SMART_ASSISTANT_CLIP_WATCH=true` to enable the background clipboard image watcher.
  - Default is off (to avoid lag on some Windows setups with large clipboard images).

Screenshot mode (optional):

- Default: click Screenshot captures the current screen instantly.
- `SMART_ASSISTANT_CAPTURE_MODE=os` to use the Windows screen-clip overlay (you select a region).

## Run (Dev)

In one terminal:

```powershell
cd Frontend
npm run dev
```

Notes:

- The dev runner will automatically pick a free Vite port starting from `5173`.
- To force a specific port: `set VITE_PORT=5175` (cmd) or `$env:VITE_PORT=5175` (PowerShell) before running `npm run dev`.

This starts:

- TypeScript watch for Electron main/preload
- Vite dev server for the renderer
- Electron pointing at the dev server

## Move To Another Folder

You can copy this entire `Frontend/` folder elsewhere and run the same steps (`npm install` then `npm run dev`).

If you run the backend in a different location/machine, set `VITE_ANALYZE_URL` accordingly.
