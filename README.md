# Cleo (Frontend + Backend)

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

## Moving Frontend/Backend to another folder

Both projects are standalone:

- To move the desktop app, copy the entire `Frontend/` folder elsewhere.
- To move the API server, copy the entire `backend/` folder elsewhere.

Then install and run from inside each folder.

- Frontend instructions: see `Frontend/README.md`
- Backend instructions: see `backend/README.md`
