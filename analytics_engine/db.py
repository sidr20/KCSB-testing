from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


class AnalyticsDB:
    def __init__(self, db_path: str = "analytics_engine.sqlite3") -> None:
        self.db_path = Path(db_path)
        self._ensure_parent()
        self._init_schema()

    def _ensure_parent(self) -> None:
        if self.db_path.parent and not self.db_path.parent.exists():
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS team_season_stats (
                    team TEXT NOT NULL,
                    season TEXT NOT NULL,
                    split TEXT NOT NULL,
                    games INTEGER,
                    pace REAL,
                    off_rating REAL,
                    def_rating REAL,
                    efg_pct REAL,
                    ts_pct REAL,
                    tov_rate REAL,
                    orb_rate REAL,
                    drb_rate REAL,
                    ft_rate REAL,
                    source TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (team, season, split)
                );

                CREATE TABLE IF NOT EXISTS player_season_stats (
                    team TEXT NOT NULL,
                    season TEXT NOT NULL,
                    player_name TEXT NOT NULL,
                    games INTEGER,
                    minutes REAL,
                    points REAL,
                    rebounds REAL,
                    assists REAL,
                    steals REAL,
                    blocks REAL,
                    turnovers REAL,
                    fouls REAL,
                    usage_rate REAL,
                    ts_pct REAL,
                    efg_pct REAL,
                    source TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (team, season, player_name)
                );

                CREATE TABLE IF NOT EXISTS game_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    team TEXT NOT NULL,
                    season TEXT NOT NULL,
                    game_date TEXT,
                    opponent TEXT,
                    home_away TEXT,
                    conference INTEGER,
                    pace REAL,
                    off_rating REAL,
                    def_rating REAL,
                    efg_pct REAL,
                    ts_pct REAL,
                    tov_rate REAL,
                    orb_rate REAL,
                    drb_rate REAL,
                    points_for INTEGER,
                    points_against INTEGER,
                    source TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS cache_entries (
                    cache_key TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                """
            )

    def upsert_team_stats(self, rows: Iterable[Dict[str, Any]], source: str) -> None:
        now = datetime.utcnow().isoformat()
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO team_season_stats (
                    team, season, split, games, pace, off_rating, def_rating,
                    efg_pct, ts_pct, tov_rate, orb_rate, drb_rate, ft_rate,
                    source, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(team, season, split) DO UPDATE SET
                    games=excluded.games,
                    pace=excluded.pace,
                    off_rating=excluded.off_rating,
                    def_rating=excluded.def_rating,
                    efg_pct=excluded.efg_pct,
                    ts_pct=excluded.ts_pct,
                    tov_rate=excluded.tov_rate,
                    orb_rate=excluded.orb_rate,
                    drb_rate=excluded.drb_rate,
                    ft_rate=excluded.ft_rate,
                    source=excluded.source,
                    updated_at=excluded.updated_at
                """,
                [
                    (
                        row["team"],
                        row["season"],
                        row.get("split", "overall"),
                        row.get("games"),
                        row.get("pace"),
                        row.get("off_rating"),
                        row.get("def_rating"),
                        row.get("efg_pct"),
                        row.get("ts_pct"),
                        row.get("tov_rate"),
                        row.get("orb_rate"),
                        row.get("drb_rate"),
                        row.get("ft_rate"),
                        source,
                        now,
                    )
                    for row in rows
                ],
            )

    def upsert_player_stats(self, rows: Iterable[Dict[str, Any]], source: str) -> None:
        now = datetime.utcnow().isoformat()
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO player_season_stats (
                    team, season, player_name, games, minutes, points, rebounds,
                    assists, steals, blocks, turnovers, fouls, usage_rate,
                    ts_pct, efg_pct, source, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(team, season, player_name) DO UPDATE SET
                    games=excluded.games,
                    minutes=excluded.minutes,
                    points=excluded.points,
                    rebounds=excluded.rebounds,
                    assists=excluded.assists,
                    steals=excluded.steals,
                    blocks=excluded.blocks,
                    turnovers=excluded.turnovers,
                    fouls=excluded.fouls,
                    usage_rate=excluded.usage_rate,
                    ts_pct=excluded.ts_pct,
                    efg_pct=excluded.efg_pct,
                    source=excluded.source,
                    updated_at=excluded.updated_at
                """,
                [
                    (
                        row["team"],
                        row["season"],
                        row["player_name"],
                        row.get("games"),
                        row.get("minutes"),
                        row.get("points"),
                        row.get("rebounds"),
                        row.get("assists"),
                        row.get("steals"),
                        row.get("blocks"),
                        row.get("turnovers"),
                        row.get("fouls"),
                        row.get("usage_rate"),
                        row.get("ts_pct"),
                        row.get("efg_pct"),
                        source,
                        now,
                    )
                    for row in rows
                ],
            )

    def replace_game_logs(self, team: str, season: str, rows: Iterable[Dict[str, Any]], source: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM game_logs WHERE team = ? AND season = ?",
                (team, season),
            )
            conn.executemany(
                """
                INSERT INTO game_logs (
                    team, season, game_date, opponent, home_away, conference,
                    pace, off_rating, def_rating, efg_pct, ts_pct, tov_rate,
                    orb_rate, drb_rate, points_for, points_against, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        row["team"],
                        row["season"],
                        row.get("game_date"),
                        row.get("opponent"),
                        row.get("home_away"),
                        1 if row.get("conference") else 0,
                        row.get("pace"),
                        row.get("off_rating"),
                        row.get("def_rating"),
                        row.get("efg_pct"),
                        row.get("ts_pct"),
                        row.get("tov_rate"),
                        row.get("orb_rate"),
                        row.get("drb_rate"),
                        row.get("points_for"),
                        row.get("points_against"),
                        source,
                    )
                    for row in rows
                ],
            )

    def get_team_stats(self, team: str, season: str, split: str = "overall") -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM team_season_stats
                WHERE team = ? AND season = ? AND split = ?
                """,
                (team, season, split),
            ).fetchone()
            return dict(row) if row else None

    def get_data_counts(self, team: str, season: str) -> Dict[str, int]:
        with self._connect() as conn:
            team_rows = conn.execute(
                "SELECT COUNT(*) AS c FROM team_season_stats WHERE team = ? AND season = ?",
                (team, season),
            ).fetchone()["c"]
            player_rows = conn.execute(
                "SELECT COUNT(*) AS c FROM player_season_stats WHERE team = ? AND season = ?",
                (team, season),
            ).fetchone()["c"]
            game_rows = conn.execute(
                "SELECT COUNT(*) AS c FROM game_logs WHERE team = ? AND season = ?",
                (team, season),
            ).fetchone()["c"]
        return {
            "team_rows": int(team_rows),
            "player_rows": int(player_rows),
            "game_rows": int(game_rows),
        }

    def get_team_splits(self, team: str, season: str) -> Dict[str, Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM team_season_stats WHERE team = ? AND season = ?",
                (team, season),
            ).fetchall()
        return {row["split"]: dict(row) for row in rows}

    def get_player_stats(self, team: str, season: str) -> Dict[str, Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM player_season_stats WHERE team = ? AND season = ?",
                (team, season),
            ).fetchall()
        return {row["player_name"]: dict(row) for row in rows}

    def get_last_n_game_averages(self, team: str, season: str, n: int = 5) -> Dict[str, float]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT pace, off_rating, def_rating, efg_pct, ts_pct,
                       tov_rate, orb_rate, drb_rate
                FROM game_logs
                WHERE team = ? AND season = ?
                ORDER BY COALESCE(game_date, '') DESC, id DESC
                LIMIT ?
                """,
                (team, season, n),
            ).fetchall()

        if not rows:
            return {}

        keys = [
            "pace",
            "off_rating",
            "def_rating",
            "efg_pct",
            "ts_pct",
            "tov_rate",
            "orb_rate",
            "drb_rate",
        ]
        out: Dict[str, float] = {}
        for key in keys:
            vals = [row[key] for row in rows if row[key] is not None]
            if vals:
                out[key] = sum(vals) / len(vals)
        return out

    def set_cache(self, key: str, payload: Dict[str, Any], ttl_hours: int = 24) -> None:
        now = datetime.utcnow()
        expires = now + timedelta(hours=ttl_hours)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO cache_entries (cache_key, payload_json, fetched_at, expires_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    payload_json=excluded.payload_json,
                    fetched_at=excluded.fetched_at,
                    expires_at=excluded.expires_at
                """,
                (key, json.dumps(payload), now.isoformat(), expires.isoformat()),
            )

    def get_cache(self, key: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json, expires_at FROM cache_entries WHERE cache_key = ?",
                (key,),
            ).fetchone()
        if not row:
            return None
        if datetime.fromisoformat(row["expires_at"]) < datetime.utcnow():
            return None
        return json.loads(row["payload_json"])
