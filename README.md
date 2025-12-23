# Cleo the Smart Assistant Backend

Electron + React desktop companion for the Smart Assistant experience. The renderer delivers a modern chat UI, while the Electron main process manages native capabilities such as window pinning and screen capture.

## Project Layout

```
smart-assistant Backend/
├─ backend/                  # Local API + backend services
└─ web/smart-assistant/Frontend/ # Electron + Vite application (ONLY frontend)
```

## Prerequisites

- Node.js 18+ (Electron 28 requires a modern runtime)
- npm 9+
- Playwright browsers (only if you plan to run the E2E suite): `npx playwright install`

## Getting Started

```powershell
cd web/smart-assistant/Frontend
npm install
```

### Development workflow

```powershell
npm run dev
```

The dev task:
- Compiles the Electron main + preload processes in watch mode.
- Boots Vite for the renderer with hot module replacement.
- Launches Electron once the renderer is ready.

### Production build
# Smart Assistant

Desktop smart assistant (Electron + React) with a local API backend that proxies to OpenAI.

## Repo Structure (frontend/backend separated)

```
.
├─ Frontend/   # Electron + Vite + React (desktop app)
├─ backend/    # Local API server (Node)
└─ infra/      # Infrastructure (optional)
```

## Prerequisites

- Node.js 18+ (Electron 28 requires a modern runtime)
- npm 9+

## Quick Start (recommended)

From the repo root:

```powershell
npm install
npm run install:all
npm run dev
```

What `npm run dev` does:

- Starts backend local API at `http://127.0.0.1:8787`
- Waits for `/health`
- Starts the Electron desktop app dev workflow

## Manual Start (two terminals)

Terminal A:

```powershell
cd backend
node .\dist\local-api.js
```

Terminal B:

```powershell
cd Frontend
npm run dev
```

## Environment Variables

Backend: `backend/.env`

- `OPENAI_API_KEY` (required for real responses)
- `MOCK_OPENAI=true` (force mock responses)
- `LOCAL_API_PORT=8787` (optional)

Frontend: `Frontend/.env` (optional)

- `VITE_ANALYZE_URL` (optional; defaults to `http://127.0.0.1:8787/analyze`)
