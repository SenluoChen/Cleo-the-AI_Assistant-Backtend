# Smart Assistant Frontend

Electron + React desktop companion for the Smart Assistant experience. The renderer delivers a modern chat UI, while the Electron main process manages native capabilities such as window pinning and screen capture.

## Project Layout

```
smart-assistant/
├─ desktop/        # Electron + Vite application source
│  ├─ src/         # Main process, preload, renderer, shared code
│  ├─ tests/       # Vitest unit specs and Playwright E2E suite
│  ├─ build/       # Application icons and packaging assets
│  └─ vite.config  # Vite configuration for the renderer bundle
└─ README.md
```

## Prerequisites

- Node.js 18+ (Electron 28 requires a modern runtime)
- npm 9+
- Playwright browsers (only if you plan to run the E2E suite): `npx playwright install`

## Getting Started

```powershell
cd desktop
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

```powershell
npm run build          # Produces dist/main + dist/preload + renderer bundle
npm start              # Launches the compiled app locally
npm run build:dist     # Optional: package installers via electron-builder
```

### Quality gates

```powershell
npm run lint           # ESLint rules for TypeScript + React
npm run test:unit      # Vitest unit suite
npm run test:e2e       # Playwright E2E tests (requires browsers installed)
```

## Environment Variables

Duplicate `.env.example` to `.env` (development) or `.env.production` (packaged builds) inside the `desktop` directory.

| Variable | Description |
| --- | --- |
| `VITE_ANALYZE_URL` | API endpoint consumed by the renderer client. |
| `SMART_ASSISTANT_ENABLE_SCREEN_CAPTURE` | Set to `true` to allow native screen capture functionality. |

## Packaging Notes

Electron Builder configuration lives in `desktop/electron-builder.yml`. Generated installers are written to `desktop/release/` (ignored by Git).

## Contributing

1. Fork the repo and create a feature branch.
2. Run `npm run lint` and the relevant test suite before opening a PR.
3. Keep pull requests focused and include screenshots or recordings when UI changes are involved.
