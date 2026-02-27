# Analytics Dashboard (ESPN Core API)

Prompt-driven basketball analytics dashboard with:
- React frontend (`apps/web`) using `react-resizable-panels`
- Python API backend (`apps/api`) for ESPN Core API season + play-by-play ingestion and OpenAI insights
- Evidence-linked insight bubbles that jump to table rows

## Data source
Season team/player stats for the Data tab are loaded from the **first page** of PDFs in `analytics_engine/data/`:
- **UCSB**: `ucsb-season-stats.pdf` → UCSB team stats and player stats
- **UCR (opponent)**: `ucr-season-stats.pdf` → opponent team stats and player stats

The API serves these when `team_id` is `2540`/`ucsb` or `ucr`. For any other team, season data falls back to ESPN Core API.

ESPN Core API (fallback / teams list):

`https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball`

Play-by-play comes from ESPN Core API:

`https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/401809115/competitions/401809115/plays`

Data tab defaults:
- Team: `2540` / `ucsb` (UC Santa Barbara, from PDF)
- Opponent: `ucr` (UC Riverside, from PDF; selectable in UI; other ESPN teams use API)

## Data artifacts
Per ESPN `team_id`, season data is stored under:
- `data/espn/{team_id}/team.csv`
- `data/espn/{team_id}/player.csv`
- `data/espn/{team_id}/manifest.json`

Team list cache:
- `data/espn/teams-2025-26.json`

Play-by-play data is stored under:
- `data/pbp-401809115.json`

## API endpoints
- `GET /api/espn/teams`
  - Returns ESPN teams for the season (`team_id`, `school_name`, `abbreviation`)
- `POST /api/espn/season/:team_id/update`
  - Fetches season team + player stats from ESPN and regenerates stored datasets
- `GET /api/espn/season/:team_id/team`
  - Returns season team stats table for the ESPN `team_id`
- `GET /api/espn/season/:team_id/player`
  - Returns season player stats table for the ESPN `team_id`
- `POST /api/scrape/:team_id`
  - Backward-compatible alias to ESPN season update
- `GET /api/data/:team_id/:dataset`
  - Backward-compatible season data route (`dataset` in `team | player | players`)
- `GET /api/pbp`
  - Returns notebook-schema PBP rows and stable `row_key` values
- `POST /api/pbp/update`
  - Re-fetches ESPN PBP and overwrites `data/pbp-401809115.json`
- `POST /api/evidence/validate`
  - Validates evidence refs against stored rows/columns
- `POST /api/insights`
  - Calls OpenAI and validates strict evidence schema

## Frontend behavior
- Three resizable columns of equal width:
  - Left: Team/Opponent ESPN season data table (`team.csv` / `player.csv`)
  - Center: Play-by-play table with ESPN Update button
  - Right: Prompt + generated insights with Saved Insights below
- Left panel keeps Team tree and table UX:
  - Team side fixed to UCSB ESPN team id `2540`
  - Opponent side uses selectable ESPN team ids (names shown)
  - `Update season data` re-scrapes ESPN season stats for each side
- Prompt behavior:
  - Full PBP table is always included as the primary LLM context (no truncation/toggle)
  - Season CSV seed buttons remain optional additional context
- Evidence click behavior:
  - Switches side/tab or centers PBP row, depending on evidence dataset
  - Forces referenced row visible and highlighted

## Setup
```bash
cd /Users/quinnkoster/Developer/analytics-toolbase
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm --prefix apps/web install
cp .env.example .env
```

Required env:
- `OPENAI_API_KEY`

## Run
```bash
npm run dev
```

Or separately:
```bash
npm run dev:api
npm run dev:web
```

## Tests
```bash
npm run test
```

## Known limitations
- ESPN Core API structure can change and may require parser updates.
- If ESPN blocks or key `$ref` links are missing, season update endpoints return explicit errors.
- ESPN Core API changes can affect PBP ingestion.
- Saved insights are in-memory only.
