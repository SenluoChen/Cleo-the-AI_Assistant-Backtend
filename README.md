# Cleo Desktop AI Assistant

- Cleo is a lightweight desktop assistant built to help with small, practical tasks such as answering questions, translating text, and analyzing what is currently on screen. The goal is to reduce friction by letting users interact with AI directly from their desktop, without opening a browser or copying content into another tool.

- The project combines an Electron-based desktop application with a local or cloud-hosted Node.js API. It is designed for short, focused interactions rather than long chat sessions.

---

## Features

- Desktop popup assistant  
  - After launching the app, a small floating control stays visible on the desktop. Clicking it opens a chat window where questions can be asked at any time.

- Active window analysis  
  - The assistant can capture the current window or a selected screen area and analyze its content to provide context-aware responses.

- Conversation history  
  - Recent conversations are stored locally, allowing users to review previous answers and continue short contextual exchanges.

- Local first and secure  
  - By default, everything runs locally. When using cloud proxy mode, API keys remain on the server and are never exposed to the client.

---

## Repository Structure

- Project layout

.
├─ Frontend/   # Electron + Vite + React desktop application
├─ backend/    # Node.js local API and cloud proxy
└─ infra/      # Optional cloud deployment (Docker, AWS CDK)

---

## Default Ports

- Backend API  
  - http://127.0.0.1:8787  
  - GET /health  
  - POST /analyze  

- Frontend development server  
  - http://localhost:5173  
  - An available port is selected automatically during development.

---

## Requirements

- Runtime and tools  
  - Node.js 18 or newer (Electron 28 runtime)  
  - npm 9 or newer  

- Optional for cloud deployment  
  - Docker Desktop  
  - AWS CLI (configured)  
  - AWS CDK v2  

---

## Quick Start

- Development startup

npm install  
npm run install:all  
npm run dev  

- This starts the local backend, waits for the health endpoint to become available, and then launches the frontend development environment using Vite and Electron.

---

## Manual Start

- Backend

cd backend  
npm install  
npm run build  
npm run start  

- Frontend

cd Frontend  
npm install  
npm run dev  

---

## Environment Variables

### Backend (backend/.env)

- Common settings  

  - OPENAI_API_KEY  
    - OpenAI API key for local mode.

  - MOCK_OPENAI=true  
    - Forces mock responses for UI and flow testing without real API calls.

  - LOCAL_API_PORT=8787  
    - Port used by the local API.

- Cloud and security settings  

  - OPENAI_SECRET_ID  
    - Loads the OpenAI key from AWS Secrets Manager.

  - APP_TOKEN  
    - Optional bearer token required by the cloud proxy.

- Limits  

  - MAX_HISTORY_MESSAGES  
    - Maximum number of stored messages (default 40).

  - MAX_HISTORY_CHARS  
    - Maximum total character count for stored history (default 12000).

---

### Frontend (Frontend/.env, optional)

- Configuration options  

  - VITE_ANALYZE_URL  
    - Backend analyze endpoint. Defaults to http://127.0.0.1:8787/analyze.

  - SMART_ASSISTANT_CLIP_WATCH=true  
    - Enables clipboard image monitoring.

  - SMART_ASSISTANT_CAPTURE_MODE=os  
    - Uses the operating system capture overlay for screenshots.

  - VITE_PORT=5175  
    - Forces the Vite development server to use a specific port.

---

## API Reference

- Health check

GET /health  

- Expected response

{ "status": "ok" }

- Analyze endpoint

POST /analyze  
Content-Type: application/json  
Authorization: Bearer <token>

- Request body

{
  "question": "string",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "image": "data:image/png;base64,..."
}

- If the Accept header includes text/event-stream, the backend responds using Server-Sent Events.

---

## Tests and Quality Checks

- From the repository root

npm test  
npm run lint  

- Frontend tests

cd Frontend  
npm run test:unit  
npm run test:e2e  
npm run check  

- Backend tests

cd backend  
npm run build  
npm run test:integration  
npm run test:analyze  

---

## Packaging and Release (Windows)

- Packaging process  
  - Packaging is handled from the Frontend directory using an isolated build script. The build runs inside a temporary copy of the repository to avoid modifying the working tree or leaking local configuration.

- Packaging environment variables  

  - CLEO_REMOTE_API_URL  
    - API base URL baked into the installer.

  - CLEO_APP_TOKEN  
    - Optional token used to access the cloud proxy.

- Build command

$env:CLEO_REMOTE_API_URL = "https://your-api.example"  
$env:CLEO_APP_TOKEN = "<token>"  

PowerShell -NoProfile -ExecutionPolicy Bypass  
-File .\scripts\package-isolated.ps1  

- Output  
  - Installer artifacts are copied to Frontend/release/.

---

## Cloud Proxy Deployment

- Cloud mode behavior  
  - In cloud mode, the OpenAI API key never reaches the client. The desktop application communicates only with the proxy.

- Node.js server

cd backend  
npm install  
npm run build  

$env:OPENAI_API_KEY = "<your-openai-key>"  
$env:APP_TOKEN = "<your-app-token>"  

node .\dist\cloud-api.js  

- Docker Compose

cd infra/cloud-proxy  

$env:OPENAI_API_KEY = "<your-openai-key>"  
$env:APP_TOKEN = "<your-app-token>"  

docker compose up -d --build  

- AWS CDK  
  - Deployment uses ECS Fargate with an Application Load Balancer.  
  - See infra/aws-cdk/README.md for full instructions.

---

## Further Reading

- Frontend/README.md  
  - Desktop application development and packaging.

- backend/README.md  
  - Local API and cloud proxy details.

- infra/aws-cdk/README.md  
  - AWS deployment instructions.
