from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pipeline import AnalyticsEngine


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="UCSB basketball in-game analytics engine"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    update = sub.add_parser("update-season", help="Fetch/cache season data for one team")
    update.add_argument("--team", required=True, help="Team name, e.g., UCSB or Cal Poly")
    update.add_argument("--season", default="2025-26", help="Season label, e.g., 2025-26")
    update.add_argument("--db", default="analytics_engine.sqlite3", help="SQLite database path")
    update.add_argument("--force-refresh", action="store_true", help="Bypass cache and refetch")

    manual = sub.add_parser("import-season", help="Import manual season stats from JSON/CSV/text")
    manual.add_argument("--team", required=True, help="Team name")
    manual.add_argument("--season", default="2025-26")
    manual.add_argument("--input", required=True, help="File path (or directory with csv files)")
    manual.add_argument("--db", default="analytics_engine.sqlite3", help="SQLite database path")
    manual.add_argument("--source", default="manual_user_upload", help="Source label for provenance")

    analyze = sub.add_parser("analyze", help="Process play-by-play and emit broadcaster insights")
    analyze.add_argument("--pbp", required=True, help="Path to play-by-play file or '-' for stdin")
    analyze.add_argument("--prompt", default=None, help="Operational prompt containing 'UCSB vs [Opponent]'")
    analyze.add_argument("--season", default="2025-26")
    analyze.add_argument("--db", default="analytics_engine.sqlite3", help="SQLite database path")
    analyze.add_argument("--force-refresh", action="store_true", help="Bypass cache and refetch")
    analyze.add_argument("--broadcast-summary", action="store_true", help="Emit condensed bullet output")
    analyze.add_argument("--json-out", default=None, help="Optional file path for full JSON output")
    analyze.add_argument("--text-out", default=None, help="Optional file path for text output")
    analyze.add_argument("--print-json", action="store_true", help="Print JSON payload instead of text")

    return parser


def _read_pbp_arg(pbp_arg: str):
    if pbp_arg == "-":
        raw = sys.stdin.read()
        return raw
    path = Path(pbp_arg)
    if path.exists():
        return str(path)
    return pbp_arg


def main(argv=None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    engine = AnalyticsEngine(db_path=args.db)

    if args.command == "update-season":
        result = engine.update_team_season_data(
            team=args.team,
            season=args.season,
            force_refresh=args.force_refresh,
        )
        print(json.dumps(result, indent=2))
        return 0

    if args.command == "analyze":
        pbp_input = _read_pbp_arg(args.pbp)
        payload = engine.process_play_by_play(
            pbp_input=pbp_input,
            instruction_prompt=args.prompt,
            season=args.season,
            force_refresh=args.force_refresh,
            broadcast_summary_mode=args.broadcast_summary,
            export_text_path=args.text_out,
            export_json_path=args.json_out,
        )
        if args.print_json:
            print(json.dumps(payload, indent=2))
        else:
            print(payload["text"])
        return 0

    if args.command == "import-season":
        result = engine.import_manual_season_data(
            team=args.team,
            season=args.season,
            input_source=args.input,
            source=args.source,
        )
        print(json.dumps(result, indent=2))
        return 0

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
