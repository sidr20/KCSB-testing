from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from .models import (
    DroughtSegment,
    GameAnalyticsResult,
    ParsedPlayByPlay,
    PlayerGameMetrics,
    RunSegment,
    TeamGameMetrics,
)


class GameMetricsCalculator:
    def compute(self, parsed: ParsedPlayByPlay) -> GameAnalyticsResult:
        context = parsed.context
        team_a = "UCSB"
        team_b = context.opponent or "Opponent"
        teams = [team_a, team_b]

        team_metrics = {team: TeamGameMetrics(team=team) for team in teams}
        player_metrics: Dict[str, PlayerGameMetrics] = {}

        scoreboard = {team_a: 0, team_b: 0}
        scoring_events: List[Dict[str, Any]] = []
        event_scores: List[Tuple[int, int]] = []
        warnings = list(parsed.warnings)

        pending_points_off_turnover_team: Optional[str] = None
        pending_pot_expire: float = -1.0
        second_chance_active = {team_a: False, team_b: False}

        last_scored_at = {team_a: 0.0, team_b: 0.0}
        droughts: List[DroughtSegment] = []

        on_court = {team_a: set(), team_b: set()}
        lineup_plus_minus: Dict[str, Dict[str, Any]] = {team_a: {}, team_b: {}}

        for ev in parsed.events:
            if ev.team not in teams and ev.team != "UNKNOWN":
                warnings.append(f"ignored event team '{ev.team}' not in game context")

            event_team = ev.team if ev.team in teams else None
            opp_team = team_b if event_team == team_a else team_a if event_team == team_b else None

            if event_team and ev.player:
                self._touch_lineup(on_court[event_team], ev.player)
            if ev.event_type == "substitution" and event_team:
                if ev.substitution_out and ev.substitution_out in on_court[event_team]:
                    on_court[event_team].discard(ev.substitution_out)
                if ev.substitution_in:
                    on_court[event_team].add(ev.substitution_in)
                while len(on_court[event_team]) > 5:
                    on_court[event_team].pop()

            if event_team:
                self._apply_event_to_team_metrics(team_metrics[event_team], ev)
                self._apply_event_to_player_metrics(player_metrics, event_team, ev)

                if ev.assist_player:
                    self._ensure_player(player_metrics, event_team, ev.assist_player).assists += 1
                    team_metrics[event_team].assists += 1

            # Track rebounding/turnover context for points-off-turnovers and second-chance points.
            if event_team and ev.event_type == "turnover":
                pending_points_off_turnover_team = opp_team
                pending_pot_expire = ev.absolute_elapsed + 45.0
                second_chance_active[event_team] = False
            elif event_team and ev.event_type == "off_rebound":
                second_chance_active[event_team] = True
            elif event_team and ev.event_type in {"def_rebound", "turnover"} and opp_team:
                second_chance_active[opp_team] = False

            if event_team and ev.points > 0:
                scoreboard[event_team] += ev.points
                margin = scoreboard[team_a] - scoreboard[team_b]
                scoring_events.append(
                    {
                        "elapsed": ev.absolute_elapsed,
                        "team": event_team,
                        "points": ev.points,
                        "margin": margin,
                        "timestamp": self._format_timestamp(ev.period, ev.clock),
                    }
                )

                # Drought closes when team finally scores.
                if ev.absolute_elapsed - last_scored_at[event_team] >= 150:
                    droughts.append(
                        DroughtSegment(
                            team=event_team,
                            start_elapsed=last_scored_at[event_team],
                            end_elapsed=ev.absolute_elapsed,
                            duration_sec=ev.absolute_elapsed - last_scored_at[event_team],
                        )
                    )
                last_scored_at[event_team] = ev.absolute_elapsed

                if pending_points_off_turnover_team == event_team and ev.absolute_elapsed <= pending_pot_expire:
                    team_metrics[event_team].points_off_turnovers += ev.points
                    pending_points_off_turnover_team = None

                if second_chance_active[event_team]:
                    team_metrics[event_team].second_chance_points += ev.points

                self._update_lineup_plus_minus(
                    lineup_plus_minus,
                    on_court,
                    scoring_team=event_team,
                    points=ev.points,
                    team_a=team_a,
                    team_b=team_b,
                )

                if ev.event_type in {"two_made", "three_made", "free_throw_made"}:
                    second_chance_active[event_team] = False

            event_scores.append((scoreboard[team_a], scoreboard[team_b]))

        max_elapsed = max(e.absolute_elapsed for e in parsed.events)
        for team in teams:
            if max_elapsed - last_scored_at[team] >= 180:
                droughts.append(
                    DroughtSegment(
                        team=team,
                        start_elapsed=last_scored_at[team],
                        end_elapsed=max_elapsed,
                        duration_sec=max_elapsed - last_scored_at[team],
                    )
                )

        # Derived rates use box-score style possession estimate to avoid double counting.
        for team in teams:
            opp = team_b if team == team_a else team_a
            t = team_metrics[team]
            o = team_metrics[opp]
            t.possessions = self._estimate_possessions(t)
            t.off_eff = (t.points / t.possessions * 100.0) if t.possessions > 0 else 0.0
            t.def_eff = (o.points / self._estimate_possessions(o) * 100.0) if self._estimate_possessions(o) > 0 else 0.0
            t.efg_pct = ((t.fgm + 0.5 * t.three_pm) / t.fga) if t.fga > 0 else 0.0
            t.ts_pct = (t.points / (2.0 * (t.fga + 0.44 * t.fta))) if (t.fga + 0.44 * t.fta) > 0 else 0.0
            t.tov_rate = (t.turnovers / t.possessions) if t.possessions > 0 else 0.0
            t.orb_rate = (t.oreb / (t.oreb + o.dreb)) if (t.oreb + o.dreb) > 0 else 0.0
            t.drb_rate = (t.dreb / (t.dreb + o.oreb)) if (t.dreb + o.oreb) > 0 else 0.0
            t.foul_rate = (t.fouls / t.possessions) if t.possessions > 0 else 0.0

        self._finalize_player_rates(player_metrics, team_metrics, teams)

        runs = self._detect_runs(scoring_events, teams)
        recent_window_metrics = self._recent_window(parsed.events, teams, max_elapsed)
        clutch_metrics = self._clutch_window(parsed.events, event_scores, teams)
        win_prob = self._win_probability(parsed.events[-1], scoreboard[team_a], scoreboard[team_b], team_a)
        momentum = self._momentum_index(recent_window_metrics, teams)

        latest = parsed.events[-1]
        return GameAnalyticsResult(
            context=context,
            team_metrics=team_metrics,
            player_metrics=player_metrics,
            runs=runs,
            droughts=sorted(droughts, key=lambda d: d.duration_sec, reverse=True),
            lineup_plus_minus=lineup_plus_minus,
            clutch_metrics=clutch_metrics,
            recent_window_metrics=recent_window_metrics,
            win_probability=win_prob,
            momentum_index=momentum,
            current_timestamp=self._format_timestamp(latest.period, latest.clock),
            warnings=warnings,
        )

    def _apply_event_to_team_metrics(self, m: TeamGameMetrics, ev) -> None:
        d = ev.description.lower()

        if ev.event_type == "two_made":
            m.fgm += 1
            m.fga += 1
            m.points += ev.points or 2
            if any(k in d for k in ["layup", "dunk", "paint", "tip-in"]):
                m.points_in_paint += ev.points or 2
        elif ev.event_type == "two_miss":
            m.fga += 1
        elif ev.event_type == "three_made":
            m.fgm += 1
            m.fga += 1
            m.three_pm += 1
            m.three_pa += 1
            m.points += ev.points or 3
        elif ev.event_type == "three_miss":
            m.fga += 1
            m.three_pa += 1
        elif ev.event_type == "free_throw_made":
            m.ftm += 1
            m.fta += 1
            m.points += ev.points or 1
        elif ev.event_type == "free_throw_miss":
            m.fta += 1
        elif ev.event_type == "off_rebound":
            m.oreb += 1
        elif ev.event_type == "def_rebound":
            m.dreb += 1
        elif ev.event_type == "turnover":
            m.turnovers += 1
            if "steal" in d:
                m.steals += 1
        elif ev.event_type == "foul":
            m.fouls += 1

        if "block" in d:
            m.blocks += 1

    def _apply_event_to_player_metrics(self, players: Dict[str, PlayerGameMetrics], team: str, ev) -> None:
        if not ev.player:
            return
        p = self._ensure_player(players, team, ev.player)

        if ev.event_type == "two_made":
            p.fgm += 1
            p.fga += 1
            p.points += ev.points or 2
        elif ev.event_type == "two_miss":
            p.fga += 1
        elif ev.event_type == "three_made":
            p.fgm += 1
            p.fga += 1
            p.three_pm += 1
            p.three_pa += 1
            p.points += ev.points or 3
        elif ev.event_type == "three_miss":
            p.fga += 1
            p.three_pa += 1
        elif ev.event_type == "free_throw_made":
            p.ftm += 1
            p.fta += 1
            p.points += ev.points or 1
        elif ev.event_type == "free_throw_miss":
            p.fta += 1
        elif ev.event_type == "off_rebound":
            p.oreb += 1
        elif ev.event_type == "def_rebound":
            p.dreb += 1
        elif ev.event_type == "turnover":
            p.turnovers += 1
        elif ev.event_type == "foul":
            p.fouls += 1

        d = ev.description.lower()
        if "steal" in d:
            p.steals += 1
        if "block" in d:
            p.blocks += 1

    def _touch_lineup(self, lineup: set, player: str) -> None:
        if len(lineup) < 5:
            lineup.add(player)

    def _update_lineup_plus_minus(
        self,
        lineup_plus_minus: Dict[str, Dict[str, Any]],
        on_court: Dict[str, set],
        scoring_team: str,
        points: int,
        team_a: str,
        team_b: str,
    ) -> None:
        other = team_b if scoring_team == team_a else team_a

        scoring_lineup = self._lineup_key(on_court[scoring_team])
        other_lineup = self._lineup_key(on_court[other])

        self._lineup_record(lineup_plus_minus[scoring_team], scoring_lineup)["plus_minus"] += points
        self._lineup_record(lineup_plus_minus[other], other_lineup)["plus_minus"] -= points

    def _lineup_key(self, lineup: set) -> str:
        if len(lineup) == 5:
            return " | ".join(sorted(lineup))
        if not lineup:
            return "UNKNOWN"
        return "PARTIAL: " + " | ".join(sorted(lineup))

    def _lineup_record(self, table: Dict[str, Any], key: str) -> Dict[str, Any]:
        if key not in table:
            table[key] = {"plus_minus": 0}
        return table[key]

    def _ensure_player(self, players: Dict[str, PlayerGameMetrics], team: str, player: str) -> PlayerGameMetrics:
        key = f"{team}::{player}"
        if key not in players:
            players[key] = PlayerGameMetrics(team=team, player=player)
        return players[key]

    def _estimate_possessions(self, m: TeamGameMetrics) -> float:
        return max(0.0, m.fga - m.oreb + m.turnovers + 0.44 * m.fta)

    def _finalize_player_rates(
        self,
        players: Dict[str, PlayerGameMetrics],
        team_metrics: Dict[str, TeamGameMetrics],
        teams: List[str],
    ) -> None:
        for player in players.values():
            tm = team_metrics[player.team]
            player_usage_denom = tm.fga + 0.44 * tm.fta + tm.turnovers
            player_usage_num = player.fga + 0.44 * player.fta + player.turnovers
            player.usage_rate = (player_usage_num / player_usage_denom) if player_usage_denom > 0 else 0.0
            player.efg_pct = ((player.fgm + 0.5 * player.three_pm) / player.fga) if player.fga > 0 else 0.0
            player.ts_pct = (
                player.points / (2.0 * (player.fga + 0.44 * player.fta))
                if (player.fga + 0.44 * player.fta) > 0
                else 0.0
            )

    def _detect_runs(self, scoring_events: List[Dict[str, Any]], teams: List[str]) -> List[RunSegment]:
        if not scoring_events:
            return []

        max_window = 260.0
        min_diff = 8
        candidates: List[RunSegment] = []

        for i in range(len(scoring_events)):
            end = scoring_events[i]
            end_t = end["elapsed"]
            totals = {teams[0]: 0, teams[1]: 0}
            for j in range(i, -1, -1):
                start = scoring_events[j]
                if end_t - start["elapsed"] > max_window:
                    break
                totals[start["team"]] += start["points"]
                a, b = totals[teams[0]], totals[teams[1]]
                if abs(a - b) >= min_diff and (a + b) >= 10:
                    run_team = teams[0] if a > b else teams[1]
                    run_opp = teams[1] if run_team == teams[0] else teams[0]
                    candidates.append(
                        RunSegment(
                            team=run_team,
                            opponent=run_opp,
                            start_elapsed=start["elapsed"],
                            end_elapsed=end_t,
                            points_for=totals[run_team],
                            points_against=totals[run_opp],
                        )
                    )

        # Deduplicate near-identical windows and keep strongest/recent first.
        candidates.sort(
            key=lambda r: ((r.points_for - r.points_against), r.end_elapsed, -(r.end_elapsed - r.start_elapsed)),
            reverse=True,
        )

        kept: List[RunSegment] = []
        for cand in candidates:
            if any(
                cand.team == ex.team
                and abs(cand.end_elapsed - ex.end_elapsed) <= 30
                and abs(cand.start_elapsed - ex.start_elapsed) <= 30
                for ex in kept
            ):
                continue
            kept.append(cand)
            if len(kept) >= 6:
                break

        kept.sort(key=lambda r: r.end_elapsed, reverse=True)
        return kept

    def _recent_window(self, events, teams: List[str], max_elapsed: float) -> Dict[str, Any]:
        start = max(0.0, max_elapsed - 480.0)
        sliced = [ev for ev in events if ev.absolute_elapsed >= start]
        metrics = self._aggregate_window_metrics(sliced, teams)
        metrics["window_seconds"] = max_elapsed - start
        metrics["window_start_elapsed"] = start
        metrics["window_end_elapsed"] = max_elapsed
        return metrics

    def _clutch_window(self, events, event_scores: List[Tuple[int, int]], teams: List[str]) -> Dict[str, Any]:
        clutch_events = []
        for ev, (u_score, o_score) in zip(events, event_scores):
            if ev.absolute_elapsed < 2100 or ev.period > 2:
                continue
            if abs(u_score - o_score) <= 5:
                clutch_events.append(ev)

        out = self._aggregate_window_metrics(clutch_events, teams)
        out["events"] = len(clutch_events)
        out["window_seconds"] = 300
        return out

    def _aggregate_window_metrics(self, events, teams: List[str]) -> Dict[str, Any]:
        tmp = {team: TeamGameMetrics(team=team) for team in teams}
        for ev in events:
            if ev.team in tmp:
                self._apply_event_to_team_metrics(tmp[ev.team], ev)

        for team in teams:
            opp = teams[1] if team == teams[0] else teams[0]
            t = tmp[team]
            o = tmp[opp]
            poss = self._estimate_possessions(t)
            t.possessions = poss
            t.off_eff = (t.points / poss * 100.0) if poss > 0 else 0.0
            t.efg_pct = ((t.fgm + 0.5 * t.three_pm) / t.fga) if t.fga > 0 else 0.0
            t.ts_pct = (t.points / (2.0 * (t.fga + 0.44 * t.fta))) if (t.fga + 0.44 * t.fta) > 0 else 0.0
            t.tov_rate = (t.turnovers / poss) if poss > 0 else 0.0
            t.orb_rate = (t.oreb / (t.oreb + o.dreb)) if (t.oreb + o.dreb) > 0 else 0.0
            t.drb_rate = (t.dreb / (t.dreb + o.oreb)) if (t.dreb + o.oreb) > 0 else 0.0

        return {
            "teams": {
                team: {
                    "points": tmp[team].points,
                    "possessions": round(tmp[team].possessions, 2),
                    "off_eff": round(tmp[team].off_eff, 2),
                    "efg_pct": round(tmp[team].efg_pct, 4),
                    "ts_pct": round(tmp[team].ts_pct, 4),
                    "tov_rate": round(tmp[team].tov_rate, 4),
                    "orb_rate": round(tmp[team].orb_rate, 4),
                    "drb_rate": round(tmp[team].drb_rate, 4),
                }
                for team in teams
            }
        }

    def _win_probability(self, latest_event, ucsb_score: int, opp_score: int, team_a: str) -> float:
        margin = ucsb_score - opp_score
        sec_remaining = latest_event.game_seconds_remaining
        time_factor = 1.0 - min(1.0, sec_remaining / 2400.0)
        possession_edge = -1.0 if latest_event.team == team_a and latest_event.points > 0 else 1.0
        x = 0.12 * margin * (0.6 + time_factor) + 0.25 * possession_edge * (1.0 - time_factor)
        prob = 1.0 / (1.0 + math.exp(-x))
        return max(0.01, min(0.99, prob))

    def _momentum_index(self, recent_window_metrics: Dict[str, Any], teams: List[str]) -> float:
        a = recent_window_metrics["teams"][teams[0]]
        b = recent_window_metrics["teams"][teams[1]]
        point_diff = a["points"] - b["points"]
        efg_diff = (a["efg_pct"] - b["efg_pct"]) * 100
        tov_diff = (b["tov_rate"] - a["tov_rate"]) * 100
        raw = point_diff * 6 + efg_diff * 1.8 + tov_diff * 1.4
        return round(max(-100.0, min(100.0, raw)), 1)

    def _format_timestamp(self, period: int, clock: str) -> str:
        if period == 1:
            return f"1H {clock}"
        if period == 2:
            return f"2H {clock}"
        return f"OT{period-2} {clock}"
