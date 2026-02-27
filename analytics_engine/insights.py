from __future__ import annotations

from typing import Any, Dict, List

from .models import ComparisonReport, GameAnalyticsResult


class InsightGenerator:
    def generate(
        self,
        analytics: GameAnalyticsResult,
        comparison: ComparisonReport,
        broadcast_summary_mode: bool = False,
    ) -> Dict[str, Any]:
        sections = {
            "GAME FLOW INSIGHTS (Play-by-Play Only)": self._game_flow_insights(analytics),
            "RECENT TRENDS (Last 5-8 Minutes Emphasis)": self._recent_trends(analytics),
            "TEAM PERFORMANCE VS SEASON": [f.message for f in comparison.team_findings],
            "PLAYER PERFORMANCE VS SEASON": [f.message for f in comparison.player_findings],
            "HIGH-LEVERAGE CONTEXT": [f.message for f in comparison.leverage_findings],
        }

        # Always report source used; never fail silently about provenance.
        source_line = "Data source used: " + ", ".join(
            f"{team}={src}" for team, src in comparison.data_sources.items()
        )
        sections["HIGH-LEVERAGE CONTEXT"].append(source_line)

        if comparison.warnings:
            sections["HIGH-LEVERAGE CONTEXT"].append(
                "Warnings: " + " | ".join(comparison.warnings[:3])
            )

        if broadcast_summary_mode:
            sections = {k: v[:3] for k, v in sections.items()}

        # Ensure every section has at least one quantitative bullet.
        for key, vals in sections.items():
            if not vals:
                sections[key] = [
                    f"[{analytics.current_timestamp}] No qualifying deviations detected; sample size={len(analytics.player_metrics)} player records"
                ]

        return {
            "sections": sections,
            "current_timestamp": analytics.current_timestamp,
            "momentum_index": analytics.momentum_index,
            "win_probability": analytics.win_probability,
        }

    def to_text(self, structured: Dict[str, Any]) -> str:
        lines: List[str] = []
        for heading in [
            "GAME FLOW INSIGHTS (Play-by-Play Only)",
            "RECENT TRENDS (Last 5-8 Minutes Emphasis)",
            "TEAM PERFORMANCE VS SEASON",
            "PLAYER PERFORMANCE VS SEASON",
            "HIGH-LEVERAGE CONTEXT",
        ]:
            lines.append(heading)
            for bullet in structured["sections"].get(heading, []):
                lines.append(f"- {bullet}")
            lines.append("")
        return "\n".join(lines).strip()

    def _game_flow_insights(self, analytics: GameAnalyticsResult) -> List[str]:
        team = "UCSB"
        opp = analytics.context.opponent
        t = analytics.team_metrics[team]
        o = analytics.team_metrics[opp]

        out: List[str] = []
        out.append(
            f"[{analytics.current_timestamp}] Score impact profile: UCSB {t.points} pts, {t.points_in_paint} paint pts, {t.points_off_turnovers} pts off TO, {t.second_chance_points} second-chance pts"
        )
        out.append(
            f"[{analytics.current_timestamp}] Possession estimate: UCSB {t.possessions:.1f}, {opp} {o.possessions:.1f}; efficiency split ORtg {t.off_eff:.1f}, DRtg {t.def_eff:.1f}"
        )

        for run in analytics.runs[:3]:
            if run.team != team and run.team != opp:
                continue
            duration = run.end_elapsed - run.start_elapsed
            end_stamp = self._elapsed_to_stamp(run.end_elapsed)
            out.append(
                f"[{end_stamp}] Run: {run.team} {run.points_for}-{run.points_against} over last {self._fmt_duration(duration)}"
            )

        for dr in analytics.droughts[:2]:
            stamp = self._elapsed_to_stamp(dr.end_elapsed)
            out.append(
                f"[{stamp}] Scoring drought: {dr.team} scoreless for {self._fmt_duration(dr.duration_sec)}"
            )

        top_lineup = self._top_lineup(analytics.lineup_plus_minus.get(team, {}))
        if top_lineup:
            out.append(
                f"[{analytics.current_timestamp}] Lineup +/- leader: {top_lineup[0]} ({top_lineup[1]:+d})"
            )

        return out

    def _recent_trends(self, analytics: GameAnalyticsResult) -> List[str]:
        team = "UCSB"
        opp = analytics.context.opponent
        rw = analytics.recent_window_metrics["teams"]
        u = rw.get(team, {})
        v = rw.get(opp, {})
        window_sec = analytics.recent_window_metrics.get("window_seconds", 0)

        out: List[str] = []
        out.append(
            f"[{analytics.current_timestamp}] Last {self._fmt_duration(window_sec)}: UCSB {u.get('points', 0)}-{v.get('points', 0)}; ORtg {u.get('off_eff', 0):.1f} vs {v.get('off_eff', 0):.1f}"
        )
        out.append(
            f"[{analytics.current_timestamp}] Last {self._fmt_duration(window_sec)} shooting: eFG {u.get('efg_pct', 0)*100:.1f}% vs {v.get('efg_pct', 0)*100:.1f}%, TS {u.get('ts_pct', 0)*100:.1f}% vs {v.get('ts_pct', 0)*100:.1f}%"
        )
        out.append(
            f"[{analytics.current_timestamp}] Last {self._fmt_duration(window_sec)} possession control: TOV% {u.get('tov_rate', 0)*100:.1f}% vs {v.get('tov_rate', 0)*100:.1f}%, ORB% {u.get('orb_rate', 0)*100:.1f}% vs {v.get('orb_rate', 0)*100:.1f}%"
        )

        recent_runs = [
            run for run in analytics.runs if run.end_elapsed >= analytics.recent_window_metrics.get("window_start_elapsed", 0)
        ]
        for run in recent_runs[:2]:
            out.append(
                f"[{self._elapsed_to_stamp(run.end_elapsed)}] Momentum run in window: {run.team} {run.points_for}-{run.points_against} over {self._fmt_duration(run.end_elapsed-run.start_elapsed)}"
            )

        out.append(
            f"[{analytics.current_timestamp}] Momentum index: {analytics.momentum_index:+.1f} (scale -100 to +100)"
        )
        return out

    def _fmt_duration(self, sec: float) -> str:
        sec_int = int(round(sec))
        m = sec_int // 60
        s = sec_int % 60
        return f"{m}:{s:02d}"

    def _elapsed_to_stamp(self, elapsed: float) -> str:
        if elapsed <= 1200:
            rem = max(0, 1200 - int(elapsed))
            return f"1H {rem//60}:{rem%60:02d}"
        if elapsed <= 2400:
            rem = max(0, 2400 - int(elapsed))
            return f"2H {rem//60}:{rem%60:02d}"
        ot_elapsed = elapsed - 2400
        ot_num = int(ot_elapsed // 300) + 1
        rem = max(0, 300 - int(ot_elapsed % 300))
        return f"OT{ot_num} {rem//60}:{rem%60:02d}"

    def _top_lineup(self, lineup_table: Dict[str, Any]):
        if not lineup_table:
            return None
        lineup, payload = sorted(
            lineup_table.items(),
            key=lambda kv: kv[1].get("plus_minus", 0),
            reverse=True,
        )[0]
        return lineup, int(payload.get("plus_minus", 0))
