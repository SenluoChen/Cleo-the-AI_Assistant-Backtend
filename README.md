# Cleo — Local Assistant (Desktop)

[中文版本](README_zh.md) | English

Cleo is a small desktop assistant. The app ships with a tiny local HTTP API so it works out of the box on a user’s machine.

Repo at a glance

- `backend/` — Node-based local API. It serves `/health` and `/analyze` and is bundled into the desktop app.
- `Frontend/` — Electron + Vite app. The build copies the bundled backend into `Frontend/vendor/backend-dist` and produces a Windows installer in `Frontend/release/`.

What you’ll usually do here

- Run the backend during development to test endpoints.
- Run the Frontend in dev mode for UI work.
- Build the production installer when you want to create a release.

Quick start (dev)

1. Build and run the backend:

```powershell
# from repo root
npm --prefix backend ci
npm --prefix backend run build
node backend/dist/local-api.js
```

2. Start the Frontend (renderer) or build the installer:

```powershell
# renderer dev
npm --prefix Frontend ci
npm --prefix Frontend run dev

# build installer
npm --prefix Frontend ci
npm --prefix Frontend run build:dist
```

Notes & handy bits

- The VS Code task `Restart backend (8787)` restarts the local API during development — see `.vscode/tasks.json`.
- `Frontend/scripts/test-installer.ps1` runs the generated installer locally and writes logs to `installed-logs/`.

Release files you’ll see

- `Cleo Setup <version>.exe` — installer
- `Cleo Setup <version>.exe.blockmap` — blockmap used for differential updates
- `Cleo Setup <version>.exe.sha256` — SHA-256 checksum to verify the download

CI notes

- Releases are produced by the GitHub Actions workflow at `.github/workflows/release.yml` and trigger on tags `v*`.
- Keep `package-lock.json` committed and do not add `node_modules/` to source control — CI uses `npm ci` for reproducible installs.

If you want this README to sound even more casual, more formal, or tailored to end users vs contributors, tell me which voice you prefer and I’ll rewrite it. I can also commit and push the change for you.
- **Frontend**: Electron + Vite desktop app. The build copies `backend/dist` into `Frontend/vendor/backend-dist` so the desktop app contains the local API.
	- Key files: [Frontend/package.json](Frontend/package.json), [Frontend/scripts/test-installer.ps1](Frontend/scripts/test-installer.ps1)
- **Releases**: `electron-builder` produces a Windows NSIS installer in `Frontend/release/`. The GitHub Actions workflow uploads the installer and supporting assets to GitHub Releases.
	- Workflow: [.github/workflows/release.yml](.github/workflows/release.yml)

## Why this layout

- The backend runs locally and is bundled with the Electron app so end users don't have to run a separate service.
- CI builds the backend and frontend, packages the app, and uploads installer artifacts to Releases.

## Local development

1. Build and run the backend:

```powershell
# from repo root
npm --prefix backend ci
npm --prefix backend run build
node backend/dist/local-api.js
```

2. Run/build the Frontend:

```powershell
# dev renderer
npm --prefix Frontend ci
npm --prefix Frontend run dev

# build production installer
npm --prefix Frontend ci
npm --prefix Frontend run build:dist
```

3. Helper tasks
- VS Code task `Restart backend (8787)` is in [.vscode/tasks.json](.vscode/tasks.json).
- Use `Frontend/scripts/test-installer.ps1` to test the generated installer locally; logs are saved to `installed-logs/`.

## Release artifacts (what they are)

- `Cleo Setup 1.0.0.exe` — installer binary.
- `Cleo Setup 1.0.0.exe.blockmap` — blockmap for differential updates.
- `Cleo Setup 1.0.0.exe.sha256` — SHA-256 checksum for integrity verification.

## CI / Reproducible builds notes

- GitHub Actions triggers on tags `v*`. The workflow runs `npm ci` and builds backend and frontend on Windows runners.
- Keep `package-lock.json` committed and do not commit `node_modules/`. Prefer `npm ci` in CI for reproducible installs.

## Troubleshooting

- If a release job reports missing assets, check `Frontend/release/` and the release workflow step that locates assets: [.github/workflows/release.yml](.github/workflows/release.yml).
- If Actions uses an older commit, ensure fixes are committed and the tag points to the intended commit.

## Contributing

- Fork, create a branch, and open a PR. Avoid committing built artifacts.

## License

- MIT

---

If you want a Chinese `README_zh.md` or a short user quick-start checklist, I can add that next. I can also commit and push this change if you want.
