# Analytics Dashboard

Monorepo with:
- Python API: `apps/api`
- React/Vite web UI: `apps/web`

## Prereqs
- Python `3.9+` (`python3 --version`)
- Node.js + npm (`node -v`, `npm -v`)

## Setup
Recommended (one command):
```bash
npm run setup
```

Manual equivalent:
```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
npm --prefix apps/web install
cp -n .env.example .env
```

## Environment
Create `.env` (copy from `.env.example`) and set:
- `OPENAI_API_KEY` (required for `/api/insights`)

Optional:
- `API_HOST` (default `0.0.0.0`)
- `API_PORT` (default `8000`)
- `OPENAI_MODEL`, `OPENAI_BASE_URL`
- `VITE_API_BASE_URL` (override the API base URL; normally not needed in dev)

## Run (dev)
```bash
npm run dev
```

Or separately:
```bash
npm run dev:api
npm run dev:web
```

Dev routing:
- Vite proxies `/api/*` to `http://localhost:${API_PORT:-8000}`.
- The web app defaults to relative `/api/...` in dev; set `VITE_API_BASE_URL` only if you want a different backend.

## Tests
```bash
npm run test
```

## Troubleshooting
- `sh: .venv/bin/python: No such file or directory`
  - Run `npm run setup` (or create `.venv` and install `requirements.txt`).
- `sh: vite: command not found`
  - Run `npm run setup` (or `npm --prefix apps/web install`).
- `/api/insights` fails with `OPENAI_API_KEY is not configured`
  - Set `OPENAI_API_KEY` in `.env` and restart the API.
- `EADDRINUSE` / port already in use
  - Change `API_PORT` in `.env` (or free the port), then restart `npm run dev`.
- CORS / wrong API base in dev
  - Prefer relative `/api/...` (Vite proxy). Only set `VITE_API_BASE_URL` if you intentionally want to bypass the proxy.
