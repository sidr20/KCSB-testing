from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


@dataclass
class GameContext:
    team: str = "UCSB"
    opponent: str = ""
    season: str = "2025-26"
    location: str = "unknown"  # home, away, neutral, unknown
    conference_game: Optional[bool] = None
    game_date: Optional[str] = None


@dataclass
class PlayEvent:
    idx: int
    period: int
    clock: str
    absolute_elapsed: float
    game_seconds_remaining: float
    team: str
    description: str
    event_type: str
    points: int = 0
    player: Optional[str] = None
    assist_player: Optional[str] = None
    rebound_type: Optional[str] = None
    foul_type: Optional[str] = None
    substitution_in: Optional[str] = None
    substitution_out: Optional[str] = None
    score_ucsb: Optional[int] = None
    score_opponent: Optional[int] = None
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ParsedPlayByPlay:
    context: GameContext
    events: List[PlayEvent]
    warnings: List[str] = field(default_factory=list)


@dataclass
class IngestionResult:
    team: str
    season: str
    source: str
    team_stats: List[Dict[str, Any]]
    player_stats: List[Dict[str, Any]]
    game_logs: List[Dict[str, Any]]
    retrieved_at: datetime = field(default_factory=datetime.utcnow)
    warnings: List[str] = field(default_factory=list)


@dataclass
class TeamGameMetrics:
    team: str
    points: int = 0
    fgm: int = 0
    fga: int = 0
    three_pm: int = 0
    three_pa: int = 0
    ftm: int = 0
    fta: int = 0
    oreb: int = 0
    dreb: int = 0
    turnovers: int = 0
    fouls: int = 0
    assists: int = 0
    steals: int = 0
    blocks: int = 0
    points_in_paint: int = 0
    points_off_turnovers: int = 0
    second_chance_points: int = 0
    possessions: float = 0.0
    off_eff: float = 0.0
    def_eff: float = 0.0
    efg_pct: float = 0.0
    ts_pct: float = 0.0
    tov_rate: float = 0.0
    orb_rate: float = 0.0
    drb_rate: float = 0.0
    foul_rate: float = 0.0


@dataclass
class PlayerGameMetrics:
    team: str
    player: str
    points: int = 0
    fgm: int = 0
    fga: int = 0
    three_pm: int = 0
    three_pa: int = 0
    ftm: int = 0
    fta: int = 0
    oreb: int = 0
    dreb: int = 0
    assists: int = 0
    turnovers: int = 0
    steals: int = 0
    blocks: int = 0
    fouls: int = 0
    usage_rate: float = 0.0
    ts_pct: float = 0.0
    efg_pct: float = 0.0


@dataclass
class RunSegment:
    team: str
    opponent: str
    start_elapsed: float
    end_elapsed: float
    points_for: int
    points_against: int


@dataclass
class DroughtSegment:
    team: str
    start_elapsed: float
    end_elapsed: float
    duration_sec: float


@dataclass
class GameAnalyticsResult:
    context: GameContext
    team_metrics: Dict[str, TeamGameMetrics]
    player_metrics: Dict[str, PlayerGameMetrics]
    runs: List[RunSegment]
    droughts: List[DroughtSegment]
    lineup_plus_minus: Dict[str, Dict[str, Any]]
    clutch_metrics: Dict[str, Any]
    recent_window_metrics: Dict[str, Any]
    win_probability: Optional[float]
    momentum_index: float
    current_timestamp: str
    warnings: List[str] = field(default_factory=list)


@dataclass
class ComparisonFinding:
    section: str
    importance: float
    message: str
    timestamp: Optional[str] = None


@dataclass
class ComparisonReport:
    team_findings: List[ComparisonFinding]
    player_findings: List[ComparisonFinding]
    leverage_findings: List[ComparisonFinding]
    data_sources: Dict[str, str]
    warnings: List[str] = field(default_factory=list)
