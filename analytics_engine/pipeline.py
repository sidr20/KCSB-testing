from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional, Union

from .comparison import ComparisonEngine
from .db import AnalyticsDB
from .ingest import SeasonDataIngestor
from .insights import InsightGenerator
from .manual_input import ManualSeasonInputLoader
from .metrics import GameMetricsCalculator
from .pbp_parser import PlayByPlayParser


class AnalyticsEngine:
    def __init__(self, db_path: str = "analytics_engine.sqlite3") -> None:
        self.db = AnalyticsDB(db_path=db_path)
        self.ingestor = SeasonDataIngestor(self.db)
        self.parser = PlayByPlayParser()
        self.metric_calc = GameMetricsCalculator()
        self.comparator = ComparisonEngine()
        self.insight_gen = InsightGenerator()
        self.manual_loader = ManualSeasonInputLoader()

    def update_team_season_data(self, team: str, season: str, force_refresh: bool = False) -> Dict[str, Any]:
        existing_overall = self.db.get_team_stats(team=team, season=season, split="overall")
        if (
            not force_refresh
            and existing_overall
            and existing_overall.get("source") == "manual_user_upload"
        ):
            counts = self.db.get_data_counts(team=team, season=season)
            return {
                "team": team,
                "season": season,
                "source": "manual_user_upload",
                "warnings": [],
                "team_rows": counts["team_rows"],
                "player_rows": counts["player_rows"],
                "game_rows": counts["game_rows"],
            }

        result = self.ingestor.load_team(team, season, force_refresh=force_refresh)
        self.db.upsert_team_stats(result.team_stats, source=result.source)
        self.db.upsert_player_stats(result.player_stats, source=result.source)
        self.db.replace_game_logs(team=team, season=season, rows=result.game_logs, source=result.source)
        return {
            "team": team,
            "season": season,
            "source": result.source,
            "warnings": result.warnings,
            "team_rows": len(result.team_stats),
            "player_rows": len(result.player_stats),
            "game_rows": len(result.game_logs),
        }

    def import_manual_season_data(
        self,
        team: str,
        season: str,
        input_source: Union[str, Path],
        source: str = "manual_user_upload",
    ) -> Dict[str, Any]:
        team_stats, player_stats, game_logs = self.manual_loader.load(
            input_source=input_source,
            team=team,
            season=season,
        )
        self.db.upsert_team_stats(team_stats, source=source)
        self.db.upsert_player_stats(player_stats, source=source)
        self.db.replace_game_logs(team=team, season=season, rows=game_logs, source=source)
        return {
            "team": team,
            "season": season,
            "source": source,
            "team_rows": len(team_stats),
            "player_rows": len(player_stats),
            "game_rows": len(game_logs),
        }

    def process_play_by_play(
        self,
        pbp_input: Union[str, Path, list, dict],
        instruction_prompt: Optional[str] = None,
        season: str = "2025-26",
        force_refresh: bool = False,
        broadcast_summary_mode: bool = False,
        export_text_path: Optional[str] = None,
        export_json_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        parsed = self.parser.parse(pbp_input=pbp_input, season=season, instruction_prompt=instruction_prompt)

        if not parsed.context.opponent:
            raise ValueError("Opponent could not be resolved from prompt/header/events.")

        source_meta: Dict[str, str] = {}
        ucsb_update = self.update_team_season_data("UCSB", season, force_refresh=force_refresh)
        opp_update = self.update_team_season_data(parsed.context.opponent, season, force_refresh=force_refresh)
        source_meta["UCSB"] = ucsb_update["source"]
        source_meta[parsed.context.opponent] = opp_update["source"]

        analytics = self.metric_calc.compute(parsed)

        team_splits = self.db.get_team_splits("UCSB", season)
        opp_splits = self.db.get_team_splits(parsed.context.opponent, season)
        team_last5 = self.db.get_last_n_game_averages("UCSB", season, n=5)
        opp_last5 = self.db.get_last_n_game_averages(parsed.context.opponent, season, n=5)
        team_player = self.db.get_player_stats("UCSB", season)
        opp_player = self.db.get_player_stats(parsed.context.opponent, season)

        comparison = self.comparator.compare(
            analytics=analytics,
            team_splits=team_splits,
            opp_splits=opp_splits,
            team_last5=team_last5,
            opp_last5=opp_last5,
            team_player_season=team_player,
            opp_player_season=opp_player,
            data_sources=source_meta,
        )

        structured = self.insight_gen.generate(
            analytics=analytics,
            comparison=comparison,
            broadcast_summary_mode=broadcast_summary_mode,
        )
        text_output = self.insight_gen.to_text(structured)

        payload = {
            "text": text_output,
            "structured": structured,
            "metadata": {
                "team": "UCSB",
                "opponent": parsed.context.opponent,
                "season": season,
                "timestamp": analytics.current_timestamp,
                "data_sources": source_meta,
                "warnings": parsed.warnings + ucsb_update["warnings"] + opp_update["warnings"] + comparison.warnings,
            },
        }

        if export_text_path:
            Path(export_text_path).write_text(text_output, encoding="utf-8")
        if export_json_path:
            Path(export_json_path).write_text(json.dumps(payload, indent=2), encoding="utf-8")

        return payload

    def process_operational_prompt(
        self,
        prompt: str,
        pbp_input: Union[str, Path, list, dict],
        season: str = "2025-26",
        force_refresh: bool = False,
        broadcast_summary_mode: bool = False,
        export_text_path: Optional[str] = None,
        export_json_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.process_play_by_play(
            pbp_input=pbp_input,
            instruction_prompt=prompt,
            season=season,
            force_refresh=force_refresh,
            broadcast_summary_mode=broadcast_summary_mode,
            export_text_path=export_text_path,
            export_json_path=export_json_path,
        )
