from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from .models import GameContext, ParsedPlayByPlay, PlayEvent


class PlayByPlayParseError(Exception):
    pass


class PlayByPlayParser:
    CLOCK_RE = re.compile(r"(?P<min>\d{1,2}):(?P<sec>\d{2})")
    SCORE_RE = re.compile(r"(?P<a>\d+)\s*[-:]\s*(?P<b>\d+)")
    UCSB_OPP_RE = re.compile(r"(?:UCSB|UC\s*Santa\s*Barbara)\s+vs\.?\s+([A-Za-z0-9 .&'\-]+)", re.IGNORECASE)
    OPERATIONAL_PROMPT_RE = re.compile(
        r"play-by-play\s+for\s+UCSB\s+vs\s+([A-Za-z0-9 .&'\-]+?)(?:[\.,;]|$)",
        re.IGNORECASE,
    )

    def parse(
        self,
        pbp_input: Union[str, Path, List[Dict[str, Any]], Dict[str, Any]],
        season: str = "2025-26",
        instruction_prompt: Optional[str] = None,
    ) -> ParsedPlayByPlay:
        warnings: List[str] = []

        prompt_opponent = self._opponent_from_prompt(instruction_prompt)

        if isinstance(pbp_input, list):
            metadata = {}
            records = pbp_input
        elif isinstance(pbp_input, dict):
            metadata = pbp_input.get("metadata", {})
            records = pbp_input.get("events") or pbp_input.get("plays") or []
            if not isinstance(records, list):
                raise PlayByPlayParseError("Input dict must include a list under 'events' or 'plays'.")
        else:
            metadata, records = self._load_from_path_or_text(pbp_input)

        context = self._build_context(metadata, season, prompt_opponent)
        events: List[PlayEvent] = []

        for idx, record in enumerate(records):
            try:
                event = self._normalize_event(record, idx, context)
                if event:
                    events.append(event)
            except Exception as exc:
                warnings.append(f"event[{idx}] skipped: {exc}")

        if not events:
            raise PlayByPlayParseError("No parseable events found in play-by-play input.")

        events.sort(key=lambda e: (e.absolute_elapsed, e.idx))

        if not context.opponent:
            inferred = self._infer_opponent_from_events(events)
            if inferred:
                context.opponent = inferred
            else:
                warnings.append("Unable to infer opponent from header/events; using 'Opponent'.")
                context.opponent = "Opponent"

        return ParsedPlayByPlay(context=context, events=events, warnings=warnings)

    def _opponent_from_prompt(self, instruction_prompt: Optional[str]) -> Optional[str]:
        if not instruction_prompt:
            return None
        m = self.OPERATIONAL_PROMPT_RE.search(instruction_prompt)
        if not m:
            return None
        return m.group(1).strip().rstrip(".")

    def _load_from_path_or_text(self, pbp_input: Union[str, Path]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        path = None
        if isinstance(pbp_input, Path):
            path = pbp_input
        else:
            try:
                candidate = Path(str(pbp_input))
                if candidate.exists():
                    path = candidate
            except OSError:
                path = None

        if path is not None:
            suffix = path.suffix.lower()
            text = path.read_text(encoding="utf-8")
            if suffix == ".json":
                data = json.loads(text)
                if isinstance(data, list):
                    return {}, data
                if isinstance(data, dict):
                    return data.get("metadata", {}), data.get("events") or data.get("plays") or []
                raise PlayByPlayParseError("JSON play-by-play must be an object or list.")
            if suffix == ".csv":
                return {}, self._read_csv(path)
            return self._parse_text_lines(text)

        # Treat as raw JSON string or plain text.
        raw_text = str(pbp_input)
        try:
            data = json.loads(raw_text)
            if isinstance(data, list):
                return {}, data
            if isinstance(data, dict):
                return data.get("metadata", {}), data.get("events") or data.get("plays") or []
        except Exception:
            pass
        return self._parse_text_lines(raw_text)

    def _read_csv(self, path: Path) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        with path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                out.append(row)
        return out

    def _parse_text_lines(self, text: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        metadata: Dict[str, Any] = {}
        records: List[Dict[str, Any]] = []

        for line in lines[:8]:
            m = self.UCSB_OPP_RE.search(line)
            if m:
                metadata["opponent"] = m.group(1).strip()
                break

        for line in lines:
            if "vs" in line.lower() and "ucsb" in line.lower():
                continue

            clock = self._find_clock(line)
            if not clock:
                continue

            period = self._extract_period_from_line(line)
            record = {
                "period": period,
                "clock": clock,
                "description": line,
            }
            records.append(record)

        return metadata, records

    def _build_context(self, metadata: Dict[str, Any], season: str, prompt_opponent: Optional[str]) -> GameContext:
        opponent = prompt_opponent or metadata.get("opponent") or metadata.get("away_team") or metadata.get("opponent_name")

        location = (
            metadata.get("location")
            or metadata.get("home_away")
            or ("home" if metadata.get("home_team") in {"UCSB", "UC Santa Barbara"} else "unknown")
        )

        conference = metadata.get("conference_game")
        if isinstance(conference, str):
            conference = conference.lower() in {"1", "true", "yes", "y"}

        return GameContext(
            team="UCSB",
            opponent=(opponent or "").strip(),
            season=season,
            location=str(location).lower(),
            conference_game=conference,
            game_date=metadata.get("game_date") or metadata.get("date"),
        )

    def _normalize_event(self, record: Dict[str, Any], idx: int, context: GameContext) -> Optional[PlayEvent]:
        period = self._normalize_period(record)
        clock = self._normalize_clock(record)
        if period is None or clock is None:
            return None

        team = self._normalize_team(record, context)
        desc = str(
            record.get("description")
            or record.get("text")
            or record.get("play")
            or record.get("event")
            or ""
        ).strip()
        if not desc:
            return None

        event_type = self._event_type(desc)
        points = self._infer_points(desc, event_type, record)
        player, assist_player = self._extract_players(desc)
        sub_in, sub_out = self._extract_substitution(desc)
        rebound_type = self._extract_rebound_type(desc)
        foul_type = self._extract_foul_type(desc)
        score_ucsb, score_opp = self._extract_score(record, desc)

        absolute_elapsed, game_seconds_remaining = self._clock_to_elapsed(period, clock)

        return PlayEvent(
            idx=idx,
            period=period,
            clock=clock,
            absolute_elapsed=absolute_elapsed,
            game_seconds_remaining=game_seconds_remaining,
            team=team,
            description=desc,
            event_type=event_type,
            points=points,
            player=player,
            assist_player=assist_player,
            rebound_type=rebound_type,
            foul_type=foul_type,
            substitution_in=sub_in,
            substitution_out=sub_out,
            score_ucsb=score_ucsb,
            score_opponent=score_opp,
            raw=record,
        )

    def _normalize_period(self, record: Dict[str, Any]) -> Optional[int]:
        val = record.get("period")
        if val is None:
            val = record.get("quarter")
        if val is None:
            val = record.get("half")
        if val is None:
            line = str(record.get("description") or record.get("text") or "")
            return self._extract_period_from_line(line)

        if isinstance(val, int):
            return max(1, val)
        s = str(val).strip().lower()
        if s in {"1", "1st", "first", "first half", "h1"}:
            return 1
        if s in {"2", "2nd", "second", "second half", "h2"}:
            return 2
        if "ot" in s:
            m = re.search(r"(\d+)", s)
            return 2 + (int(m.group(1)) if m else 1)
        try:
            return int(s)
        except Exception:
            return 1

    def _normalize_clock(self, record: Dict[str, Any]) -> Optional[str]:
        clock = record.get("clock") or record.get("time") or record.get("game_clock")
        if clock:
            return self._coerce_clock(str(clock))
        line = str(record.get("description") or record.get("text") or "")
        found = self._find_clock(line)
        if found:
            return found
        return None

    def _normalize_team(self, record: Dict[str, Any], context: GameContext) -> str:
        raw = (
            record.get("team")
            or record.get("team_name")
            or record.get("school")
            or record.get("possession")
            or ""
        )
        raw_s = str(raw).strip()
        desc = str(record.get("description") or record.get("text") or "")

        if raw_s:
            if "ucsb" in raw_s.lower() or "santa barbara" in raw_s.lower():
                return "UCSB"
            if context.opponent and context.opponent.lower() in raw_s.lower():
                return context.opponent
            return raw_s

        if re.search(r"\bucsb\b|\buc\s*santa\s*barbara\b", desc, re.IGNORECASE):
            return "UCSB"
        if context.opponent and re.search(re.escape(context.opponent), desc, re.IGNORECASE):
            return context.opponent

        # If team is absent, leave unknown; metrics calculator will ignore unknown-team rows.
        return "UNKNOWN"

    def _event_type(self, desc: str) -> str:
        d = desc.lower()
        if "substitution" in d or "enters the game" in d:
            return "substitution"
        if "timeout" in d:
            return "timeout"
        if "turnover" in d:
            return "turnover"
        if "offensive rebound" in d:
            return "off_rebound"
        if "defensive rebound" in d or ("rebound" in d and "offensive" not in d):
            return "def_rebound"
        if "foul" in d:
            return "foul"
        if "free throw" in d and "made" in d:
            return "free_throw_made"
        if "free throw" in d and ("miss" in d or "no good" in d):
            return "free_throw_miss"
        if (
            ("3pt" in d or "three" in d or "3-point" in d)
            and ("made" in d or "good" in d)
        ):
            return "three_made"
        if (
            ("3pt" in d or "three" in d or "3-point" in d)
            and ("miss" in d or "no good" in d)
        ):
            return "three_miss"
        if any(word in d for word in ["layup", "dunk", "jumper", "hook", "tip-in", "shot"]):
            if "made" in d or "good" in d:
                return "two_made"
            if "miss" in d or "no good" in d:
                return "two_miss"
        if "start" in d and "period" in d:
            return "period_start"
        if "end" in d and "period" in d:
            return "period_end"
        return "unknown"

    def _infer_points(self, desc: str, event_type: str, record: Dict[str, Any]) -> int:
        for key in ("points", "pts", "score_value"):
            if record.get(key) is not None:
                try:
                    return int(record[key])
                except Exception:
                    pass

        d = desc.lower()
        if event_type in {"free_throw_made"}:
            return 1
        if event_type in {"three_made"}:
            return 3
        if event_type in {"two_made"}:
            return 2

        # Some logs write only "good!" and include 2/3 in text.
        if "made" in d or "good" in d:
            if "three" in d or "3-point" in d or "3pt" in d:
                return 3
            if "free throw" in d:
                return 1
            if any(k in d for k in ["layup", "dunk", "jumper", "tip-in", "hook"]):
                return 2
        return 0

    def _extract_players(self, desc: str) -> Tuple[Optional[str], Optional[str]]:
        player = None
        assist = None

        m = re.match(r"^([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){0,2})\s+(made|missed|turnover|foul|rebound)", desc)
        if m:
            player = m.group(1).strip()

        a = re.search(r"\(([^\)]*assist[^\)]*)\)", desc, re.IGNORECASE)
        if a:
            text = a.group(1)
            name_m = re.search(r"([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){0,2})", text)
            if name_m:
                assist = name_m.group(1).strip()

        return player, assist

    def _extract_substitution(self, desc: str) -> Tuple[Optional[str], Optional[str]]:
        d = desc.strip()
        m = re.search(
            r"substitution\s*(?:in)?\s*([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){0,2})\s*(?:for|replaces)\s*([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){0,2})",
            d,
            re.IGNORECASE,
        )
        if m:
            return m.group(1).strip(), m.group(2).strip()

        m = re.search(
            r"([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){0,2})\s+enters\s+the\s+game\s+for\s+([A-Z][A-Za-z'\-.]+(?:\s+[A-Z][A-Za-z'\-.]+){0,2})",
            d,
            re.IGNORECASE,
        )
        if m:
            return m.group(1).strip(), m.group(2).strip()

        return None, None

    def _extract_rebound_type(self, desc: str) -> Optional[str]:
        d = desc.lower()
        if "offensive rebound" in d:
            return "offensive"
        if "defensive rebound" in d:
            return "defensive"
        if "rebound" in d:
            return "unknown"
        return None

    def _extract_foul_type(self, desc: str) -> Optional[str]:
        d = desc.lower()
        if "offensive" in d and "foul" in d:
            return "offensive"
        if "technical" in d:
            return "technical"
        if "shooting" in d:
            return "shooting"
        if "foul" in d:
            return "personal"
        return None

    def _extract_score(self, record: Dict[str, Any], desc: str) -> Tuple[Optional[int], Optional[int]]:
        su = record.get("score_ucsb")
        so = record.get("score_opponent")
        if su is not None and so is not None:
            try:
                return int(su), int(so)
            except Exception:
                pass

        score_text = str(record.get("score") or "")
        raw = f"{score_text} {desc}"
        m = self.SCORE_RE.search(raw)
        if not m:
            return None, None
        a, b = int(m.group("a")), int(m.group("b"))

        if re.search(r"UCSB\s*[-:]\s*\d+", raw, re.IGNORECASE) or re.search(r"\d+\s*[-:]\s*UCSB", raw, re.IGNORECASE):
            # Best effort: if UCSB appears near the first number, assume first is UCSB.
            ucsb_before = re.search(r"UCSB[^0-9]{0,6}(\d+\s*[-:]\s*\d+)", raw, re.IGNORECASE)
            if ucsb_before:
                return a, b
            return b, a

        return None, None

    def _clock_to_elapsed(self, period: int, clock: str) -> Tuple[float, float]:
        rem = self._clock_to_seconds(clock)
        period_len = 1200 if period <= 2 else 300

        if period <= 2:
            base = (period - 1) * 1200
            absolute_elapsed = base + (period_len - rem)
            game_seconds_remaining = max(0.0, 2400 - absolute_elapsed)
        else:
            base = 2400 + (period - 3) * 300
            absolute_elapsed = base + (period_len - rem)
            game_seconds_remaining = 0.0

        return float(absolute_elapsed), float(game_seconds_remaining)

    def _extract_period_from_line(self, line: str) -> int:
        l = line.lower()
        if any(tok in l for tok in ["2nd", "second half", "h2"]):
            return 2
        if "ot" in l:
            m = re.search(r"(\d+)\s*ot|ot\s*(\d+)", l)
            if m:
                val = m.group(1) or m.group(2)
                return 2 + int(val)
            return 3
        return 1

    def _find_clock(self, line: str) -> Optional[str]:
        m = self.CLOCK_RE.search(line)
        if not m:
            return None
        return f"{int(m.group('min'))}:{m.group('sec')}"

    def _coerce_clock(self, val: str) -> Optional[str]:
        m = self.CLOCK_RE.search(val)
        if not m:
            return None
        return f"{int(m.group('min'))}:{m.group('sec')}"

    def _clock_to_seconds(self, clock: str) -> int:
        m, s = clock.split(":")
        return int(m) * 60 + int(s)

    def _infer_opponent_from_events(self, events: List[PlayEvent]) -> Optional[str]:
        counts: Dict[str, int] = {}
        for ev in events:
            t = ev.team
            if not t or t == "UNKNOWN" or t == "UCSB":
                continue
            counts[t] = counts.get(t, 0) + 1
        if not counts:
            return None
        return sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[0][0]
