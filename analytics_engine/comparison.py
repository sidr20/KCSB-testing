from __future__ import annotations

from typing import Any, Dict, List, Tuple

from .models import ComparisonFinding, ComparisonReport, GameAnalyticsResult


class ComparisonEngine:
    def __init__(self, deviation_threshold: float = 0.12) -> None:
        self.deviation_threshold = deviation_threshold

    def compare(
        self,
        analytics: GameAnalyticsResult,
        team_splits: Dict[str, Dict[str, Any]],
        opp_splits: Dict[str, Dict[str, Any]],
        team_last5: Dict[str, float],
        opp_last5: Dict[str, float],
        team_player_season: Dict[str, Dict[str, Any]],
        opp_player_season: Dict[str, Dict[str, Any]],
        data_sources: Dict[str, str],
    ) -> ComparisonReport:
        team_findings: List[ComparisonFinding] = []
        player_findings: List[ComparisonFinding] = []
        leverage_findings: List[ComparisonFinding] = []

        team = "UCSB"
        opp = analytics.context.opponent

        team_game = analytics.team_metrics[team]
        opp_game = analytics.team_metrics[opp]

        game_minutes = self._game_minutes(analytics)
        team_pace = self._pace(team_game.possessions, game_minutes)
        opp_pace = self._pace(opp_game.possessions, game_minutes)

        team_baseline = self._pick_baseline(team_splits, analytics.context)
        opp_baseline = self._pick_baseline(opp_splits, analytics.context)

        self._append_team_deviation(
            team_findings,
            metric_name="Pace",
            current=team_pace,
            baseline=team_baseline.get("pace"),
            timestamp=analytics.current_timestamp,
            unit="poss/40",
            importance=0.94,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="Offensive Efficiency",
            current=team_game.off_eff,
            baseline=team_baseline.get("off_rating"),
            timestamp=analytics.current_timestamp,
            unit="pts/100 poss",
            importance=0.98,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="Defensive Efficiency",
            current=team_game.def_eff,
            baseline=team_baseline.get("def_rating"),
            timestamp=analytics.current_timestamp,
            unit="pts/100 poss",
            importance=0.97,
            lower_is_better=True,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="eFG%",
            current=team_game.efg_pct,
            baseline=team_baseline.get("efg_pct"),
            timestamp=analytics.current_timestamp,
            unit="pct",
            importance=0.9,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="TS%",
            current=team_game.ts_pct,
            baseline=team_baseline.get("ts_pct"),
            timestamp=analytics.current_timestamp,
            unit="pct",
            importance=0.88,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="Turnover Rate",
            current=team_game.tov_rate,
            baseline=team_baseline.get("tov_rate"),
            timestamp=analytics.current_timestamp,
            unit="pct",
            importance=0.91,
            lower_is_better=True,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="Offensive Rebound Rate",
            current=team_game.orb_rate,
            baseline=team_baseline.get("orb_rate"),
            timestamp=analytics.current_timestamp,
            unit="pct",
            importance=0.85,
        )

        # Last-5 comparison quick flags.
        self._append_team_deviation(
            team_findings,
            metric_name="Offensive Efficiency vs Last-5",
            current=team_game.off_eff,
            baseline=team_last5.get("off_rating"),
            timestamp=analytics.current_timestamp,
            unit="pts/100 poss",
            importance=0.89,
        )
        self._append_team_deviation(
            team_findings,
            metric_name="Defensive Efficiency vs Last-5",
            current=team_game.def_eff,
            baseline=team_last5.get("def_rating"),
            timestamp=analytics.current_timestamp,
            unit="pts/100 poss",
            importance=0.89,
            lower_is_better=True,
        )

        # Opponent baseline context helps identify whether UCSB is driving or being driven.
        self._append_opponent_context(
            team_findings,
            opp,
            opp_game.off_eff,
            opp_baseline.get("off_rating"),
            analytics.current_timestamp,
        )
        self._append_opponent_context(
            team_findings,
            opp,
            opp_game.tov_rate,
            opp_baseline.get("tov_rate"),
            analytics.current_timestamp,
            label="turnover rate",
            pct_metric=True,
            lower_is_better=True,
        )

        # Player over/under + usage.
        for p in analytics.player_metrics.values():
            season_row = team_player_season.get(p.player)
            if p.team != team or not season_row:
                continue
            self._append_player_findings(player_findings, p, season_row, analytics.current_timestamp)

        # Leverage context: foul trouble, bonus, clutch, fatigue, win probability.
        self._append_leverage_findings(leverage_findings, analytics, team, opp)

        team_findings.sort(key=lambda f: f.importance, reverse=True)
        player_findings.sort(key=lambda f: f.importance, reverse=True)
        leverage_findings.sort(key=lambda f: f.importance, reverse=True)

        return ComparisonReport(
            team_findings=team_findings,
            player_findings=player_findings,
            leverage_findings=leverage_findings,
            data_sources=data_sources,
            warnings=list(analytics.warnings),
        )

    def _game_minutes(self, analytics: GameAnalyticsResult) -> float:
        if not analytics.recent_window_metrics:
            return 40.0
        end = analytics.recent_window_metrics.get("window_end_elapsed", 2400.0)
        return max(1.0, end / 60.0)

    def _pace(self, possessions: float, game_minutes: float) -> float:
        return possessions * 40.0 / game_minutes if game_minutes > 0 else 0.0

    def _pick_baseline(self, splits: Dict[str, Dict[str, Any]], context) -> Dict[str, Any]:
        if not splits:
            return {}
        if context.location in splits:
            return splits[context.location]
        if context.conference_game is True and "conference" in splits:
            return splits["conference"]
        if context.conference_game is False and "non_conference" in splits:
            return splits["non_conference"]
        return splits.get("overall", next(iter(splits.values())))

    def _append_team_deviation(
        self,
        findings: List[ComparisonFinding],
        metric_name: str,
        current: float,
        baseline: Any,
        timestamp: str,
        unit: str,
        importance: float,
        lower_is_better: bool = False,
    ) -> None:
        if baseline is None:
            return
        baseline_f = float(baseline)
        if baseline_f == 0:
            return

        deviation = (current - baseline_f) / baseline_f
        if abs(deviation) < self.deviation_threshold:
            return

        direction = "above" if deviation > 0 else "below"
        if lower_is_better:
            impact = "improved" if deviation < 0 else "worse"
        else:
            impact = "improved" if deviation > 0 else "worse"

        findings.append(
            ComparisonFinding(
                section="TEAM PERFORMANCE VS SEASON",
                importance=importance + min(abs(deviation), 0.2),
                timestamp=timestamp,
                message=(
                    f"[{timestamp}] {metric_name}: {current:.2f} vs {baseline_f:.2f} "
                    f"({abs(deviation) * 100:.1f}% {direction}, {impact}); unit={unit}"
                ),
            )
        )

    def _append_opponent_context(
        self,
        findings: List[ComparisonFinding],
        opp: str,
        current: float,
        baseline: Any,
        timestamp: str,
        label: str = "offensive efficiency",
        pct_metric: bool = False,
        lower_is_better: bool = False,
    ) -> None:
        if baseline is None:
            return
        b = float(baseline)
        if b == 0:
            return
        dev = (current - b) / b
        if abs(dev) < self.deviation_threshold:
            return

        unit = "%" if pct_metric else ""
        impact = "suppressed" if lower_is_better and dev < 0 else "elevated" if lower_is_better else "elevated" if dev > 0 else "suppressed"
        findings.append(
            ComparisonFinding(
                section="TEAM PERFORMANCE VS SEASON",
                importance=0.86 + min(abs(dev), 0.18),
                timestamp=timestamp,
                message=(
                    f"[{timestamp}] Opponent {opp} {label}: {current:.3f}{unit} vs {b:.3f}{unit} "
                    f"({abs(dev)*100:.1f}% deviation, {impact})"
                ),
            )
        )

    def _append_player_findings(self, findings: List[ComparisonFinding], p, season_row: Dict[str, Any], timestamp: str) -> None:
        season_ppg = season_row.get("points")
        season_usage = season_row.get("usage_rate")

        if season_ppg and season_ppg > 0:
            diff = (p.points - season_ppg) / season_ppg
            if abs(diff) >= 0.15:
                direction = "over" if diff > 0 else "under"
                findings.append(
                    ComparisonFinding(
                        section="PLAYER PERFORMANCE VS SEASON",
                        importance=0.87 + min(abs(diff), 0.25),
                        timestamp=timestamp,
                        message=(
                            f"[{timestamp}] {p.player}: {p.points:.0f} pts vs {season_ppg:.1f} season avg "
                            f"({abs(diff)*100:.1f}% {direction})"
                        ),
                    )
                )

        if season_usage and season_usage > 0:
            usage_diff = (p.usage_rate - season_usage) / season_usage
            if abs(usage_diff) >= 0.15:
                direction = "spike" if usage_diff > 0 else "drop"
                findings.append(
                    ComparisonFinding(
                        section="PLAYER PERFORMANCE VS SEASON",
                        importance=0.82 + min(abs(usage_diff), 0.2),
                        timestamp=timestamp,
                        message=(
                            f"[{timestamp}] {p.player} usage {direction}: {p.usage_rate*100:.1f}% vs "
                            f"{season_usage*100:.1f}% season ({abs(usage_diff)*100:.1f}% deviation)"
                        ),
                    )
                )

        if p.points >= max(20, (season_ppg or 0) * 1.7):
            findings.append(
                ComparisonFinding(
                    section="PLAYER PERFORMANCE VS SEASON",
                    importance=0.9,
                    timestamp=timestamp,
                    message=(
                        f"[{timestamp}] {p.player} is on season-high scoring pace: {p.points:.0f} points "
                        f"vs {season_ppg or 0:.1f} season avg"
                    ),
                )
            )

    def _append_leverage_findings(
        self,
        findings: List[ComparisonFinding],
        analytics: GameAnalyticsResult,
        team: str,
        opp: str,
    ) -> None:
        ts = analytics.current_timestamp
        team_m = analytics.team_metrics[team]
        opp_m = analytics.team_metrics[opp]

        # Team foul situation and likely bonus state.
        if opp_m.fouls >= 10:
            findings.append(
                ComparisonFinding(
                    section="HIGH-LEVERAGE CONTEXT",
                    importance=0.97,
                    timestamp=ts,
                    message=f"[{ts}] Bonus context: {opp} has {opp_m.fouls} team fouls (double-bonus threshold 10 reached)",
                )
            )
        elif opp_m.fouls >= 7:
            findings.append(
                ComparisonFinding(
                    section="HIGH-LEVERAGE CONTEXT",
                    importance=0.9,
                    timestamp=ts,
                    message=f"[{ts}] Bonus context: {opp} has {opp_m.fouls} team fouls (bonus threshold 7 reached)",
                )
            )

        # Individual foul trouble.
        foul_risks = [
            p for p in analytics.player_metrics.values() if p.team == team and p.fouls >= 3
        ]
        for p in sorted(foul_risks, key=lambda x: x.fouls, reverse=True)[:3]:
            findings.append(
                ComparisonFinding(
                    section="HIGH-LEVERAGE CONTEXT",
                    importance=0.88 + min((p.fouls - 2) * 0.03, 0.1),
                    timestamp=ts,
                    message=f"[{ts}] Foul risk: {p.player} at {p.fouls} fouls",
                )
            )

        clutch = analytics.clutch_metrics.get("teams", {})
        if clutch:
            u = clutch.get(team, {})
            o = clutch.get(opp, {})
            if u and o and (u.get("points", 0) + o.get("points", 0) > 0):
                findings.append(
                    ComparisonFinding(
                        section="HIGH-LEVERAGE CONTEXT",
                        importance=0.86,
                        timestamp=ts,
                        message=(
                            f"[{ts}] Clutch (last 5:00, margin<=5): UCSB {u.get('points', 0)}-{o.get('points', 0)}; "
                            f"UCSB ORtg {u.get('off_eff', 0):.1f}, Opp ORtg {o.get('off_eff', 0):.1f}"
                        ),
                    )
                )

        if analytics.win_probability is not None:
            findings.append(
                ComparisonFinding(
                    section="HIGH-LEVERAGE CONTEXT",
                    importance=0.84,
                    timestamp=ts,
                    message=f"[{ts}] Live win probability estimate: UCSB {analytics.win_probability*100:.1f}%",
                )
            )

        # Fatigue indicator heuristic: limited unique player usage.
        used_players = {p.player for p in analytics.player_metrics.values() if p.team == team}
        if len(used_players) <= 7:
            findings.append(
                ComparisonFinding(
                    section="HIGH-LEVERAGE CONTEXT",
                    importance=0.8,
                    timestamp=ts,
                    message=f"[{ts}] Fatigue indicator: only {len(used_players)} UCSB players recorded in event stream",
                )
            )
