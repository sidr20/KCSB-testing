from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple, Union


class ManualInputError(Exception):
    pass


class ManualSeasonInputLoader:
    def load(
        self,
        input_source: Union[str, Path],
        team: str,
        season: str,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        path = None
        if isinstance(input_source, Path):
            path = input_source
        else:
            try:
                candidate = Path(str(input_source))
                if candidate.exists():
                    path = candidate
            except OSError:
                path = None

        if path is not None:
            if path.is_dir():
                return self._load_from_directory(path, team, season)
            return self._load_from_file(path, team, season)

        raw = str(input_source)
        try:
            payload = json.loads(raw)
            if isinstance(payload, dict):
                return self._normalize_payload(payload, team, season)
        except Exception:
            pass
        return self._load_from_structured_text(raw, team, season)

    def _load_from_directory(
        self,
        path: Path,
        team: str,
        season: str,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        team_csv = path / "team_stats.csv"
        player_csv = path / "player_stats.csv"
        game_csv = path / "game_logs.csv"

        if not team_csv.exists():
            raise ManualInputError(f"Missing required file: {team_csv}")

        team_rows = self._read_csv(team_csv)
        player_rows = self._read_csv(player_csv) if player_csv.exists() else []
        game_rows = self._read_csv(game_csv) if game_csv.exists() else []

        return self._normalize_payload(
            {
                "team_stats": team_rows,
                "player_stats": player_rows,
                "game_logs": game_rows,
            },
            team,
            season,
        )

    def _load_from_file(
        self,
        path: Path,
        team: str,
        season: str,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        suffix = path.suffix.lower()
        if suffix == ".json":
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise ManualInputError("JSON manual upload must be an object.")
            return self._normalize_payload(payload, team, season)

        if suffix == ".csv":
            rows = self._read_csv(path)
            headers = set(rows[0].keys()) if rows else set()
            if "player_name" in headers:
                payload = {"team_stats": [], "player_stats": rows, "game_logs": []}
            elif "split" in headers:
                payload = {"team_stats": rows, "player_stats": [], "game_logs": []}
            elif "opponent" in headers:
                payload = {"team_stats": [], "player_stats": [], "game_logs": rows}
            else:
                raise ManualInputError(
                    "CSV could not be typed. Use directory input with team_stats.csv/player_stats.csv/game_logs.csv."
                )
            return self._normalize_payload(payload, team, season)

        text = path.read_text(encoding="utf-8")
        return self._load_from_structured_text(text, team, season)

    def _load_from_structured_text(
        self,
        text: str,
        team: str,
        season: str,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        sections = {
            "team_stats": [],
            "player_stats": [],
            "game_logs": [],
        }
        current = None

        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue

            upper = line.upper()
            if upper in {"[TEAM_STATS]", "[PLAYER_STATS]", "[GAME_LOGS]"}:
                current = upper.strip("[]").lower()
                continue

            if current is None:
                continue

            row: Dict[str, Any] = {}
            parts = [p.strip() for p in line.split(",") if p.strip()]
            for part in parts:
                if "=" not in part:
                    continue
                k, v = part.split("=", 1)
                row[k.strip()] = self._coerce_value(v.strip())
            if row:
                sections[current].append(row)

        return self._normalize_payload(sections, team, season)

    def _normalize_payload(
        self,
        payload: Dict[str, Any],
        team: str,
        season: str,
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        team_stats = payload.get("team_stats") or []
        player_stats = payload.get("player_stats") or []
        game_logs = payload.get("game_logs") or []

        if not isinstance(team_stats, list) or not isinstance(player_stats, list) or not isinstance(game_logs, list):
            raise ManualInputError("Manual payload must include list values for team_stats/player_stats/game_logs.")

        for row in team_stats:
            row.setdefault("team", team)
            row.setdefault("season", season)
            row.setdefault("split", "overall")
        for row in player_stats:
            row.setdefault("team", team)
            row.setdefault("season", season)
        for row in game_logs:
            row.setdefault("team", team)
            row.setdefault("season", season)

        if not team_stats:
            raise ManualInputError("Manual season upload requires at least one team_stats row.")

        return team_stats, player_stats, game_logs

    def _read_csv(self, path: Path) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        with path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append({k: self._coerce_value(v) for k, v in row.items()})
        return rows

    def _coerce_value(self, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        v = value.strip()
        if v == "":
            return None
        if v.lower() in {"true", "false"}:
            return v.lower() == "true"
        if re.fullmatch(r"-?\d+", v):
            return int(v)
        if re.fullmatch(r"-?\d+\.\d+", v):
            return float(v)
        return v
