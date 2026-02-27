from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Dict, List, Tuple


def _team_seed(name: str) -> int:
    return sum(ord(ch) for ch in name.lower()) % 97


def _build_team_splits(team: str, season: str, seed: int) -> List[Dict[str, Any]]:
    base_pace = 67.5 + (seed % 6) * 0.6
    off = 108.0 + (seed % 12) * 0.8
    deff = 101.0 + (seed % 10) * 0.7
    efg = 0.49 + (seed % 8) * 0.006
    ts = 0.53 + (seed % 8) * 0.006
    tov = 0.155 + (seed % 7) * 0.005
    orb = 0.275 + (seed % 7) * 0.008
    drb = 0.705 + (seed % 7) * 0.006
    ftr = 0.305 + (seed % 7) * 0.01

    rows = []
    split_multipliers = {
        "overall": (1.0, 1.0, 1.0),
        "home": (1.01, 1.02, 0.98),
        "away": (0.99, 0.98, 1.02),
        "conference": (1.0, 0.99, 1.01),
        "non_conference": (1.0, 1.01, 0.99),
    }

    for split, (pace_m, off_m, def_m) in split_multipliers.items():
        rows.append(
            {
                "team": team,
                "season": season,
                "split": split,
                "games": 28 if split == "overall" else 14,
                "pace": round(base_pace * pace_m, 2),
                "off_rating": round(off * off_m, 2),
                "def_rating": round(deff * def_m, 2),
                "efg_pct": round(efg + (0.004 if split == "home" else -0.002 if split == "away" else 0.0), 4),
                "ts_pct": round(ts + (0.004 if split == "home" else -0.002 if split == "away" else 0.0), 4),
                "tov_rate": round(tov + (0.005 if split == "away" else 0.0), 4),
                "orb_rate": round(orb + (0.01 if split == "conference" else 0.0), 4),
                "drb_rate": round(drb + (0.008 if split == "home" else 0.0), 4),
                "ft_rate": round(ftr, 4),
            }
        )
    return rows


def _build_players(team: str, season: str, seed: int) -> List[Dict[str, Any]]:
    if team.lower() in {"ucsb", "uc santa barbara", "ucsb gauchos"}:
        names = [
            "Cole Anderson",
            "Tyson Degenhart",
            "Myles Norris",
            "Calvin Wishart",
            "Jordan Marsh",
            "Kenny Pohto",
            "Bryce Pope",
            "Deuce Turner",
        ]
    else:
        names = [
            f"{team.split()[0]} Guard {i}" if i < 5 else f"{team.split()[0]} Wing {i}"
            for i in range(1, 9)
        ]

    out: List[Dict[str, Any]] = []
    for i, name in enumerate(names):
        usage = 0.16 + (i % 4) * 0.04 + (seed % 5) * 0.002
        points = 7.5 + (7 - i) * 1.1 + (seed % 6) * 0.2
        rebounds = 2.2 + (i % 5) * 0.9
        assists = 1.1 + (i % 4) * 0.8
        out.append(
            {
                "team": team,
                "season": season,
                "player_name": name,
                "games": 28,
                "minutes": round(15 + (7 - i) * 2.2, 1),
                "points": round(points, 1),
                "rebounds": round(rebounds, 1),
                "assists": round(assists, 1),
                "steals": round(0.6 + (i % 4) * 0.3, 1),
                "blocks": round(0.2 + (i % 3) * 0.2, 1),
                "turnovers": round(0.8 + (i % 4) * 0.4, 1),
                "fouls": round(1.3 + (i % 3) * 0.4, 1),
                "usage_rate": round(usage, 3),
                "ts_pct": round(0.53 + (i % 4) * 0.015, 3),
                "efg_pct": round(0.49 + (i % 4) * 0.017, 3),
            }
        )
    return out


def _build_game_logs(team: str, season: str, seed: int) -> List[Dict[str, Any]]:
    base_date = date(2026, 2, 1)
    rows: List[Dict[str, Any]] = []
    for i in range(10):
        pace = 66.5 + (seed % 5) * 0.8 + ((i % 3) - 1) * 1.4
        off = 106 + (seed % 7) * 1.1 + ((i % 4) - 1.5) * 3.0
        deff = 101 + (seed % 6) * 0.9 + ((i % 4) - 1.5) * 2.7
        pf = int(off * pace / 100)
        pa = int(deff * pace / 100)
        rows.append(
            {
                "team": team,
                "season": season,
                "game_date": (base_date - timedelta(days=i * 3)).isoformat(),
                "opponent": f"Opponent {i+1}",
                "home_away": "home" if i % 2 == 0 else "away",
                "conference": i >= 4,
                "pace": round(pace, 2),
                "off_rating": round(off, 2),
                "def_rating": round(deff, 2),
                "efg_pct": round(0.5 + ((i % 5) - 2) * 0.01, 4),
                "ts_pct": round(0.54 + ((i % 5) - 2) * 0.011, 4),
                "tov_rate": round(0.16 + ((i % 4) - 1.5) * 0.01, 4),
                "orb_rate": round(0.29 + ((i % 4) - 1.5) * 0.012, 4),
                "drb_rate": round(0.72 + ((i % 4) - 1.5) * 0.012, 4),
                "points_for": pf,
                "points_against": pa,
            }
        )
    return rows


def build_manual_season_data(team: str, season: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    seed = _team_seed(team)
    team_rows = _build_team_splits(team, season, seed)
    players = _build_players(team, season, seed)
    games = _build_game_logs(team, season, seed)
    return team_rows, players, games
