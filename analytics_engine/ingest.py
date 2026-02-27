from __future__ import annotations

import json
import re
from dataclasses import asdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from .models import IngestionResult
from .sample_data import build_manual_season_data

try:
    import requests
except Exception:  # pragma: no cover
    requests = None

try:
    from bs4 import BeautifulSoup
except Exception:  # pragma: no cover
    BeautifulSoup = None


class IngestionError(Exception):
    pass


class SeasonDataIngestor:
    def __init__(self, db, timeout: int = 10) -> None:
        self.db = db
        self.timeout = timeout

    def load_team(self, team: str, season: str, force_refresh: bool = False) -> IngestionResult:
        cache_key = f"season:{team}:{season}"
        if not force_refresh:
            cached = self.db.get_cache(cache_key)
            if cached:
                return IngestionResult(
                    team=cached["team"],
                    season=cached["season"],
                    source=cached["source"],
                    team_stats=cached["team_stats"],
                    player_stats=cached["player_stats"],
                    game_logs=cached["game_logs"],
                    retrieved_at=datetime.fromisoformat(cached["retrieved_at"]),
                    warnings=cached.get("warnings", []),
                )

        warnings: List[str] = []
        sources = [
            ("ncaa_official", self._from_ncaa),
            ("public_api_espn", self._from_espn_api),
            ("sports_reference", self._from_sports_reference),
            ("espn_scrape", self._from_espn_scrape),
            ("official_athletics", self._from_athletics_site),
        ]

        for source_name, loader in sources:
            try:
                team_stats, player_stats, game_logs = loader(team, season)
                self._validate_payload(team, season, team_stats)
                result = IngestionResult(
                    team=team,
                    season=season,
                    source=source_name,
                    team_stats=team_stats,
                    player_stats=player_stats,
                    game_logs=game_logs,
                    warnings=warnings,
                )
                self.db.set_cache(cache_key, self._as_cache_payload(result), ttl_hours=12)
                return result
            except Exception as exc:
                warnings.append(f"{source_name} failed: {exc}")

        team_stats, player_stats, game_logs = build_manual_season_data(team, season)
        warnings.append("All automated sources failed; using manual fallback dataset.")
        result = IngestionResult(
            team=team,
            season=season,
            source="manual_fallback",
            team_stats=team_stats,
            player_stats=player_stats,
            game_logs=game_logs,
            warnings=warnings,
        )
        self.db.set_cache(cache_key, self._as_cache_payload(result), ttl_hours=3)
        return result

    def _as_cache_payload(self, result: IngestionResult) -> Dict[str, Any]:
        payload = asdict(result)
        payload["retrieved_at"] = result.retrieved_at.isoformat()
        return payload

    def _validate_payload(self, team: str, season: str, team_stats: List[Dict[str, Any]]) -> None:
        if not team_stats:
            raise IngestionError("no team stats returned")
        found = any(row.get("team") == team and row.get("season") == season for row in team_stats)
        if not found:
            raise IngestionError("invalid team/season in team stats payload")

    def _from_ncaa(self, team: str, season: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        if requests is None or BeautifulSoup is None:
            raise IngestionError("requests/bs4 not installed")

        query = f"{team} men's basketball"
        url = "https://stats.ncaa.org/search_results"
        resp = requests.get(url, params={"query": query}, timeout=self.timeout)
        if resp.status_code != 200:
            raise IngestionError(f"NCAA search status {resp.status_code}")
        soup = BeautifulSoup(resp.text, "html.parser")

        first_team_href = None
        for a in soup.select("a"):
            href = a.get("href", "")
            if "/teams/" in href and team.lower().split()[0] in a.get_text(" ", strip=True).lower():
                first_team_href = href
                break

        if not first_team_href:
            raise IngestionError("team link not found in NCAA search page")

        if first_team_href.startswith("/"):
            first_team_href = "https://stats.ncaa.org" + first_team_href

        team_resp = requests.get(first_team_href, timeout=self.timeout)
        if team_resp.status_code != 200:
            raise IngestionError(f"NCAA team page status {team_resp.status_code}")
        team_soup = BeautifulSoup(team_resp.text, "html.parser")
        txt = team_soup.get_text(" ", strip=True)

        def pct(pattern: str) -> Optional[float]:
            m = re.search(pattern, txt)
            return float(m.group(1)) / 100.0 if m else None

        def val(pattern: str) -> Optional[float]:
            m = re.search(pattern, txt)
            return float(m.group(1)) if m else None

        pace = val(r"Possessions\s*Per\s*Game\s*([0-9]+\.?[0-9]*)")
        off = val(r"Offensive\s*Efficiency\s*([0-9]+\.?[0-9]*)")
        deff = val(r"Defensive\s*Efficiency\s*([0-9]+\.?[0-9]*)")

        season_row = {
            "team": team,
            "season": season,
            "split": "overall",
            "games": int(val(r"Games\s*([0-9]+)") or 0),
            "pace": pace,
            "off_rating": off,
            "def_rating": deff,
            "efg_pct": pct(r"eFG%\s*([0-9]+\.?[0-9]*)"),
            "ts_pct": pct(r"TS%\s*([0-9]+\.?[0-9]*)"),
            "tov_rate": pct(r"TOV%\s*([0-9]+\.?[0-9]*)"),
            "orb_rate": pct(r"ORB%\s*([0-9]+\.?[0-9]*)"),
            "drb_rate": pct(r"DRB%\s*([0-9]+\.?[0-9]*)"),
            "ft_rate": pct(r"FTR\s*([0-9]+\.?[0-9]*)"),
        }

        if not season_row["off_rating"]:
            raise IngestionError("NCAA page did not expose parseable advanced metrics")

        return [season_row], [], []

    def _from_espn_api(self, team: str, season: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        if requests is None:
            raise IngestionError("requests not installed")

        team_id = self._espn_team_id(team)
        if not team_id:
            raise IngestionError("unable to resolve ESPN team id")

        stats_url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{team_id}/statistics"
        stats_resp = requests.get(stats_url, timeout=self.timeout)
        if stats_resp.status_code != 200:
            raise IngestionError(f"ESPN statistics status {stats_resp.status_code}")

        payload = stats_resp.json()
        stats_items = payload.get("results", {}).get("stats", [])
        stat_map = self._espn_stats_to_map(stats_items)

        row = {
            "team": team,
            "season": season,
            "split": "overall",
            "games": int(stat_map.get("gamesPlayed", 0) or 0),
            "pace": self._safe_float(stat_map.get("possessionsPerGame")),
            "off_rating": self._safe_float(stat_map.get("offensiveEfficiency")),
            "def_rating": self._safe_float(stat_map.get("defensiveEfficiency")),
            "efg_pct": self._safe_pct(stat_map.get("effectiveFieldGoalPct")),
            "ts_pct": self._safe_pct(stat_map.get("trueShootingPct")),
            "tov_rate": self._safe_pct(stat_map.get("turnoverRate")),
            "orb_rate": self._safe_pct(stat_map.get("offensiveReboundRate")),
            "drb_rate": self._safe_pct(stat_map.get("defensiveReboundRate")),
            "ft_rate": self._safe_float(stat_map.get("freeThrowRate")),
        }

        if row["off_rating"] is None:
            raise IngestionError("ESPN API did not return advanced team metrics")

        players = self._espn_roster_players(team_id, team, season)
        games = self._espn_schedule_games(team_id, team, season)

        return [row], players, games

    def _espn_team_id(self, team: str) -> Optional[str]:
        if requests is None:
            return None
        url = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams"
        resp = requests.get(url, params={"limit": 500, "groups": 50}, timeout=self.timeout)
        if resp.status_code != 200:
            return None
        data = resp.json()
        entries = data.get("sports", [])
        target = team.lower().replace("university of", "").strip()
        best_id = None

        for sport in entries:
            for league in sport.get("leagues", []):
                for item in league.get("teams", []):
                    team_data = item.get("team", {})
                    name = " ".join(
                        [
                            team_data.get("displayName", ""),
                            team_data.get("shortDisplayName", ""),
                            team_data.get("abbreviation", ""),
                        ]
                    ).lower()
                    if target in name or name in target:
                        best_id = team_data.get("id")
                        if best_id:
                            return str(best_id)

        # UCSB hard fallback for resilience when search payload changes.
        if team.lower() in {"ucsb", "uc santa barbara", "ucsb gauchos", "uc santa barbara gauchos"}:
            return "2540"
        return best_id

    def _espn_stats_to_map(self, stats_items: List[Dict[str, Any]]) -> Dict[str, Any]:
        stat_map: Dict[str, Any] = {}
        for item in stats_items:
            key = item.get("name") or item.get("displayName") or item.get("abbreviation")
            if not key:
                continue
            stat_map[key] = item.get("value")
        return stat_map

    def _espn_roster_players(self, team_id: str, team: str, season: str) -> List[Dict[str, Any]]:
        if requests is None:
            return []

        roster_url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{team_id}/roster"
        resp = requests.get(roster_url, timeout=self.timeout)
        if resp.status_code != 200:
            return []
        data = resp.json()
        out: List[Dict[str, Any]] = []
        for athlete in data.get("athletes", []):
            name = athlete.get("displayName")
            if not name:
                continue
            out.append(
                {
                    "team": team,
                    "season": season,
                    "player_name": name,
                    "games": None,
                    "minutes": None,
                    "points": None,
                    "rebounds": None,
                    "assists": None,
                    "steals": None,
                    "blocks": None,
                    "turnovers": None,
                    "fouls": None,
                    "usage_rate": None,
                    "ts_pct": None,
                    "efg_pct": None,
                }
            )
        return out

    def _espn_schedule_games(self, team_id: str, team: str, season: str) -> List[Dict[str, Any]]:
        if requests is None:
            return []

        sched_url = f"https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/{team_id}/schedule"
        resp = requests.get(sched_url, timeout=self.timeout)
        if resp.status_code != 200:
            return []
        data = resp.json()
        games: List[Dict[str, Any]] = []
        for event in data.get("events", []):
            competitions = event.get("competitions", [])
            if not competitions:
                continue
            comp = competitions[0]
            competitors = comp.get("competitors", [])
            team_entry = next((c for c in competitors if c.get("team", {}).get("id") == team_id), None)
            opp_entry = next((c for c in competitors if c.get("team", {}).get("id") != team_id), None)
            if not team_entry or not opp_entry:
                continue
            try:
                points_for = int(team_entry.get("score"))
                points_against = int(opp_entry.get("score"))
            except Exception:
                points_for = None
                points_against = None
            games.append(
                {
                    "team": team,
                    "season": season,
                    "game_date": event.get("date", "")[:10],
                    "opponent": opp_entry.get("team", {}).get("displayName"),
                    "home_away": team_entry.get("homeAway"),
                    "conference": None,
                    "pace": None,
                    "off_rating": None,
                    "def_rating": None,
                    "efg_pct": None,
                    "ts_pct": None,
                    "tov_rate": None,
                    "orb_rate": None,
                    "drb_rate": None,
                    "points_for": points_for,
                    "points_against": points_against,
                }
            )
        return games

    def _from_sports_reference(self, team: str, season: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        if requests is None or BeautifulSoup is None:
            raise IngestionError("requests/bs4 not installed")

        year = self._season_end_year(season)
        slug = self._sports_ref_slug(team)
        url = f"https://www.sports-reference.com/cbb/schools/{slug}/men/{year}.html"
        resp = requests.get(url, timeout=self.timeout)
        if resp.status_code != 200:
            raise IngestionError(f"sports-reference status {resp.status_code}")

        soup = BeautifulSoup(resp.text, "html.parser")
        table = soup.find("table", {"id": "school_stats"})
        if table is None:
            raise IngestionError("sports-reference school_stats table missing")

        txt = table.get_text(" ", strip=True)

        def _extract(pattern: str) -> Optional[float]:
            m = re.search(pattern, txt)
            return float(m.group(1)) if m else None

        row = {
            "team": team,
            "season": season,
            "split": "overall",
            "games": int(_extract(r"G\s+([0-9]+)") or 0),
            "pace": _extract(r"Pace\s+([0-9]+\.?[0-9]*)"),
            "off_rating": _extract(r"ORtg\s+([0-9]+\.?[0-9]*)"),
            "def_rating": _extract(r"DRtg\s+([0-9]+\.?[0-9]*)"),
            "efg_pct": self._safe_pct(_extract(r"eFG%\s+([0-9]+\.?[0-9]*)")),
            "ts_pct": self._safe_pct(_extract(r"TS%\s+([0-9]+\.?[0-9]*)")),
            "tov_rate": self._safe_pct(_extract(r"TOV%\s+([0-9]+\.?[0-9]*)")),
            "orb_rate": self._safe_pct(_extract(r"ORB%\s+([0-9]+\.?[0-9]*)")),
            "drb_rate": self._safe_pct(_extract(r"DRB%\s+([0-9]+\.?[0-9]*)")),
            "ft_rate": _extract(r"FTr\s+([0-9]+\.?[0-9]*)"),
        }

        if row["off_rating"] is None:
            raise IngestionError("sports-reference advanced metrics unavailable")

        return [row], [], []

    def _from_espn_scrape(self, team: str, season: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        if requests is None or BeautifulSoup is None:
            raise IngestionError("requests/bs4 not installed")

        team_id = self._espn_team_id(team)
        if not team_id:
            raise IngestionError("unable to resolve ESPN id for scrape")

        url = f"https://www.espn.com/mens-college-basketball/team/stats/_/id/{team_id}"
        resp = requests.get(url, timeout=self.timeout)
        if resp.status_code != 200:
            raise IngestionError(f"ESPN scrape status {resp.status_code}")

        soup = BeautifulSoup(resp.text, "html.parser")
        text = soup.get_text(" ", strip=True)

        row = {
            "team": team,
            "season": season,
            "split": "overall",
            "games": None,
            "pace": self._match_float(text, r"Pace\s*([0-9]+\.?[0-9]*)"),
            "off_rating": self._match_float(text, r"Offensive\s*Efficiency\s*([0-9]+\.?[0-9]*)"),
            "def_rating": self._match_float(text, r"Defensive\s*Efficiency\s*([0-9]+\.?[0-9]*)"),
            "efg_pct": self._safe_pct(self._match_float(text, r"eFG%\s*([0-9]+\.?[0-9]*)")),
            "ts_pct": self._safe_pct(self._match_float(text, r"TS%\s*([0-9]+\.?[0-9]*)")),
            "tov_rate": self._safe_pct(self._match_float(text, r"Turnover\s*Rate\s*([0-9]+\.?[0-9]*)")),
            "orb_rate": self._safe_pct(self._match_float(text, r"Offensive\s*Rebound\s*Rate\s*([0-9]+\.?[0-9]*)")),
            "drb_rate": self._safe_pct(self._match_float(text, r"Defensive\s*Rebound\s*Rate\s*([0-9]+\.?[0-9]*)")),
            "ft_rate": self._match_float(text, r"FT\s*Rate\s*([0-9]+\.?[0-9]*)"),
        }

        if row["off_rating"] is None:
            raise IngestionError("unable to parse ESPN advanced metrics from HTML")
        return [row], [], []

    def _from_athletics_site(self, team: str, season: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        if requests is None or BeautifulSoup is None:
            raise IngestionError("requests/bs4 not installed")

        team_lower = team.lower()
        if "ucsb" not in team_lower and "santa barbara" not in team_lower:
            raise IngestionError("official athletics source currently implemented for UCSB pages only")

        url = "https://ucsbgauchos.com/sports/mens-basketball/stats"
        resp = requests.get(url, timeout=self.timeout)
        if resp.status_code != 200:
            raise IngestionError(f"ucsbgauchos status {resp.status_code}")

        soup = BeautifulSoup(resp.text, "html.parser")
        txt = soup.get_text(" ", strip=True)

        row = {
            "team": team,
            "season": season,
            "split": "overall",
            "games": self._match_int(txt, r"Games\s*([0-9]+)"),
            "pace": self._match_float(txt, r"Pace\s*([0-9]+\.?[0-9]*)"),
            "off_rating": self._match_float(txt, r"Offensive\s*Efficiency\s*([0-9]+\.?[0-9]*)"),
            "def_rating": self._match_float(txt, r"Defensive\s*Efficiency\s*([0-9]+\.?[0-9]*)"),
            "efg_pct": self._safe_pct(self._match_float(txt, r"eFG%\s*([0-9]+\.?[0-9]*)")),
            "ts_pct": self._safe_pct(self._match_float(txt, r"TS%\s*([0-9]+\.?[0-9]*)")),
            "tov_rate": self._safe_pct(self._match_float(txt, r"TOV%\s*([0-9]+\.?[0-9]*)")),
            "orb_rate": self._safe_pct(self._match_float(txt, r"ORB%\s*([0-9]+\.?[0-9]*)")),
            "drb_rate": self._safe_pct(self._match_float(txt, r"DRB%\s*([0-9]+\.?[0-9]*)")),
            "ft_rate": self._match_float(txt, r"FTr\s*([0-9]+\.?[0-9]*)"),
        }

        if row["off_rating"] is None:
            raise IngestionError("ucsbgauchos page missing parseable advanced metrics")
        return [row], [], []

    @staticmethod
    def _safe_float(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except Exception:
            return None

    @staticmethod
    def _safe_pct(value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            f = float(value)
        except Exception:
            return None
        return f / 100.0 if f > 1 else f

    @staticmethod
    def _season_end_year(season: str) -> int:
        if "-" in season:
            _, yr = season.split("-", 1)
            if len(yr) == 2:
                return int("20" + yr)
            return int(yr)
        return int(season)

    @staticmethod
    def _sports_ref_slug(team: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", team.lower()).strip("-")
        slug = slug.replace("uc-santa-barbara", "california-santa-barbara")
        slug = slug.replace("ucsb", "california-santa-barbara")
        return slug

    @staticmethod
    def _match_float(text: str, pattern: str) -> Optional[float]:
        m = re.search(pattern, text)
        return float(m.group(1)) if m else None

    @staticmethod
    def _match_int(text: str, pattern: str) -> Optional[int]:
        m = re.search(pattern, text)
        return int(m.group(1)) if m else None
