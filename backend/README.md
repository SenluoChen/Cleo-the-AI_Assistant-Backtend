# Cleo Backend (Local API)

This folder is a standalone Node.js service that exposes a local HTTP API used by the Electron app.

## Requirements

- Node.js 18+
- npm 9+

## Setup

```powershell
cd backend
npm install
```

## Configure

Create `backend/.env` (or copy from `.env.example`).

Common variables:

- `OPENAI_API_KEY` (required unless using mock)
- `MOCK_OPENAI=true` (returns mock responses)
- `LOCAL_API_PORT=8787` (optional)

## Run

```powershell
cd backend
npm run start
```

Health check:

- `GET http://127.0.0.1:8787/health`

Analyze endpoint:

- `POST http://127.0.0.1:8787/analyze`

## Move To Another Folder

You can copy this entire `backend/` folder elsewhere and run the same steps (`npm install` then `npm run start`).
