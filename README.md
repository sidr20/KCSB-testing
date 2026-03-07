# Basketball Live Analytics Toolkit

Monorepo with:

- Python API in [`apps/api`](/Users/quinnkoster/Developer/basketball-live-analytics-toolkit/apps/api)
- React/Vite frontend in [`apps/web`](/Users/quinnkoster/Developer/basketball-live-analytics-toolkit/apps/web)

Current stack:

- Python `http.server` backend
- React 18 frontend built with Vite
- Local Python virtualenv in `.venv`
- npm-managed frontend dependencies in `apps/web`
- GitHub Actions CI in [`.github/workflows/ci.yml`](/Users/quinnkoster/Developer/basketball-live-analytics-toolkit/.github/workflows/ci.yml)

## Local setup

Requirements:

- Python 3.9+
- Node.js and npm

From the repo root:

```bash
npm run setup
```

This creates `.venv`, installs Python dependencies, installs frontend dependencies, and creates `.env` from `.env.example` if needed.

Use the existing repo layout and commands when making changes:

- backend entrypoint: `python -m apps.api`
- frontend dev server: `npm --prefix apps/web run dev`
- root helper commands: `npm run dev`, `npm run test`, `npm run test:ci`

Frontend changes should fit the current app structure in [`apps/web/src/App.jsx`](/Users/quinnkoster/Developer/basketball-live-analytics-toolkit/apps/web/src/App.jsx) and the existing Vite setup.

## Local development

Run both API and frontend:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:api
npm run dev:web
```

Default local URLs:

- API: `http://127.0.0.1:8000`
- Web: `http://127.0.0.1:5173`

## Environment

Set these in `.env` for local API usage:

- `OPENAI_API_KEY` for `/api/insights`
- `API_HOST` optional, defaults to `0.0.0.0`
- `API_PORT` optional, defaults to `8000`

Optional frontend env:

- `VITE_API_BASE_URL`

In local dev, leave `VITE_API_BASE_URL` unset unless you want the frontend to call a non-local backend.

## Tests

Run the full local CI-equivalent suite:

```bash
npm run test:ci
```

Or run the main test commands individually:

```bash
npm run test
npm --prefix apps/web run build
```

GitHub Actions runs CI on pushes to `main` and on pull requests. The workflow checks:

- API entrypoint import
- Python backend tests
- frontend tests
- production web build

## Using the deployed app

Frontend:

- Deploy [`apps/web`](/Users/quinnkoster/Developer/basketball-live-analytics-toolkit/apps/web) on Vercel
- Set the Vercel project root directory to `apps/web`

Backend:

- Deploy the Python API on Render as a Web Service
- Start command:

```bash
python -m apps.api
```

Frontend production env:

- Set `VITE_API_BASE_URL` to your deployed backend base URL, for example `https://your-service.onrender.com`

## Contributing

Do not push directly to `main`.

Use a branch instead:

```bash
git switch -c your-branch-name
```

Then commit, push the branch, and open a pull request:

```bash
git push -u origin your-branch-name
```

Before pushing, run:

```bash
npm run test:ci
```

This matches the GitHub Actions CI checks and is the fastest way to catch repo-setup issues locally.

## Notes

- The frontend uses relative `/api/...` requests in local development through the Vite proxy.
- Some data is cached locally in development. If you want a clean local state, remove `data/` and any local SQLite file.
