import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  buildPbpFilterQuery,
  canApplyPbpAdvancedFilters,
  DEFAULT_PBP_ADVANCED_FILTERS,
  normalizeClockInput,
  pbpAdvancedFiltersEqual,
  validatePbpAdvancedFilters
} from "./pbpFilters";

function CollapseButton({ panelRef, collapsed, onCollapsedChange, title }) {
  return (
    <button
      type="button"
      className="collapse-btn"
      onClick={() => {
        if (collapsed) {
          panelRef.current?.expand();
          onCollapsedChange?.(false);
        } else {
          panelRef.current?.collapse();
          onCollapsedChange?.(true);
        }
      }}
      title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
      aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
    >
      {collapsed ? "◀" : "▶"}
    </button>
  );
}
import { evidenceLabel, resolveEvidenceTarget } from "./evidenceNavigation";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const UCSB_TEAM_ID = "2540";
const PBP_TEAM_ID = "pbp";
const PBP_GAME_OPTIONS = [
  { value: "401809115", label: "401809115" },
  { value: "401826049", label: "401826049" }
];
const HIDDEN_COLUMNS = new Set(["row_key"]);

const DEFAULT_TABLE_STATE = {
  filter: "",
  sortColumn: "",
  sortDirection: "asc",
  selectedRowKey: "",
  forcedRowKey: "",
  highlightRowKey: ""
};

function normalizeTeamIdInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function comparableValue(value) {
  const normalized = String(value ?? "").trim();
  const numeric = Number(normalized.replace(/,/g, "").replace(/%/g, ""));
  if (!Number.isNaN(numeric) && normalized !== "") {
    return { type: "number", value: numeric };
  }
  return { type: "string", value: normalized.toLowerCase() };
}

async function fetchJson(url, options = {}, retries = 0) {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, options);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || `Request failed (${response.status})`);
      }
      return json;
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      attempt += 1;
    }
  }
}

function DataTable({ columns, rows, state, onChange, extraControls = null }) {
  const rowRefs = useRef({});

  const sortedRows = useMemo(() => {
    const filter = state.filter.toLowerCase();
    const filtered = rows.filter((row) => {
      if (row.row_key === state.forcedRowKey) {
        return true;
      }
      if (!filter) {
        return true;
      }
      return columns.some((column) => String(row[column] ?? "").toLowerCase().includes(filter));
    });

    if (!state.sortColumn) {
      return filtered;
    }

    const sorted = [...filtered].sort((left, right) => {
      const a = comparableValue(left[state.sortColumn]);
      const b = comparableValue(right[state.sortColumn]);
      if (a.type === "number" && b.type === "number") {
        return a.value - b.value;
      }
      return String(a.value).localeCompare(String(b.value));
    });

    if (state.sortDirection === "desc") {
      sorted.reverse();
    }
    return sorted;
  }, [rows, columns, state]);

  useEffect(() => {
    if (!state.highlightRowKey) {
      return;
    }
    const target = rowRefs.current[state.highlightRowKey];
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [state.highlightRowKey]);

  if (!columns.length) {
    return <div className="table-empty">No columns available.</div>;
  }

  return (
    <div className="table-shell">
      <div className="table-controls">
        <input
          type="text"
          value={state.filter}
          placeholder="Filter rows"
          onChange={(event) => onChange({ filter: event.target.value })}
        />
        <select
          value={state.sortColumn}
          onChange={(event) => onChange({ sortColumn: event.target.value })}
        >
          <option value="">Sort by</option>
          {columns.map((column) => (
            <option value={column} key={column}>
              {column}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onChange({ sortDirection: state.sortDirection === "asc" ? "desc" : "asc" })}
          disabled={!state.sortColumn}
        >
          {state.sortDirection === "asc" ? "Asc" : "Desc"}
        </button>
        {state.forcedRowKey ? (
          <button type="button" className="neutral" onClick={() => onChange({ forcedRowKey: "", highlightRowKey: "" })}>
            Clear evidence focus
          </button>
        ) : null}
        {extraControls}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, index) => {
              const rowKeyValue = row.row_key || `${index}_${columns[0] || "row"}`;
              const isSelected = row.row_key && row.row_key === state.selectedRowKey;
              const isHighlighted = row.row_key && row.row_key === state.highlightRowKey;
              return (
                <tr
                  key={rowKeyValue}
                  ref={(node) => {
                    if (row.row_key && node) {
                      rowRefs.current[row.row_key] = node;
                    }
                  }}
                  className={`${isSelected ? "selected" : ""} ${isHighlighted ? "highlighted" : ""}`.trim()}
                  onClick={() =>
                    onChange({
                      selectedRowKey: row.row_key || "",
                      highlightRowKey: row.row_key || state.highlightRowKey
                    })
                  }
                >
                  {columns.map((column) => (
                    <td key={`${rowKeyValue}_${column}`}>{row[column]}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InsightBubble({ insight, onSave, onEvidenceClick, saveText, resolveTeamName }) {
  return (
    <article className="bubble">
      <header>
        <h4>Insight</h4>
        <button type="button" onClick={onSave}>
          {saveText}
        </button>
      </header>
      <p>{insight.insight}</p>
      <div className="evidence-list">
        {(insight.evidence || []).map((ref, index) => (
          <button key={`${ref.row_key}_${index}`} type="button" className="evidence-chip" onClick={() => onEvidenceClick(ref)}>
            {evidenceLabel(ref, resolveTeamName)}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function App() {
  const [activeSeasonSide, setActiveSeasonSide] = useState("ucsb");
  const [seasonDataCollapsed, setSeasonDataCollapsed] = useState(false);
  const [gameDataCollapsed, setGameDataCollapsed] = useState(false);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [savedCollapsed, setSavedCollapsed] = useState(false);
  const [insightsColumnCollapsed, setInsightsColumnCollapsed] = useState(false);

  const seasonDataPanelRef = useRef();
  const gameDataPanelRef = useRef();
  const promptPanelRef = useRef();
  const savedPanelRef = useRef();
  const insightsColumnRef = useRef();

  const [opponentTeamId, setOpponentTeamId] = useState("ucr");
  const [espnTeams, setEspnTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [seasonPlayers, setSeasonPlayers] = useState({
    ucsb: { columns: [], rows: [] },
    opponent: { columns: [], rows: [] }
  });
  const [seasonPlayersLoading, setSeasonPlayersLoading] = useState({ ucsb: false, opponent: false });
  const [seasonPlayersError, setSeasonPlayersError] = useState({ ucsb: "", opponent: "" });
  const [seasonPlayersTableState, setSeasonPlayersTableState] = useState({
    ucsb: { ...DEFAULT_TABLE_STATE },
    opponent: { ...DEFAULT_TABLE_STATE }
  });

  const [pbpData, setPbpData] = useState({ columns: [], rows: [], team_id: PBP_TEAM_ID, updated_at: "", source_url: "" });
  const [pbpGameId, setPbpGameId] = useState("401809115");
  const [pbpTableState, setPbpTableState] = useState({ ...DEFAULT_TABLE_STATE });
  const [pbpAdvancedFiltersDraft, setPbpAdvancedFiltersDraft] = useState({ ...DEFAULT_PBP_ADVANCED_FILTERS });
  const [pbpAppliedFilters, setPbpAppliedFilters] = useState({ ...DEFAULT_PBP_ADVANCED_FILTERS });
  const [pbpAdvancedOpen, setPbpAdvancedOpen] = useState(false);
  const [pbpLoading, setPbpLoading] = useState(false);
  const [pbpUpdating, setPbpUpdating] = useState(false);
  const [pbpError, setPbpError] = useState("");

  const [gameDataSubtab, setGameDataSubtab] = useState("live-stats");
  const [liveStats, setLiveStats] = useState(() => ({
    ucsb_team: { columns: [], rows: [] },
    ucsb_players: { columns: [], rows: [] },
    opponent_team: { columns: [], rows: [] },
    opponent_players: { columns: [], rows: [] }
  }));
  const [activeLiveSide, setActiveLiveSide] = useState("ucsb");
  const [liveStatsLoading, setLiveStatsLoading] = useState(false);
  const [liveStatsError, setLiveStatsError] = useState("");
  const [livePlayersTableState, setLivePlayersTableState] = useState({
    ucsb: { ...DEFAULT_TABLE_STATE },
    opponent: { ...DEFAULT_TABLE_STATE }
  });

  const [prompt, setPrompt] = useState("");
  const [contextEnabled, setContextEnabled] = useState({
    ucsbTeam: true,
    ucsbPlayers: true,
    opponentTeam: true,
    opponentPlayers: true
  });
  const [insights, setInsights] = useState([]);
  const [savedInsights, setSavedInsights] = useState([]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");

  const normalizedOpponentTeamId = useMemo(() => normalizeTeamIdInput(opponentTeamId), [opponentTeamId]);
  const teamNameById = useMemo(() => {
    const map = {};
    for (const team of espnTeams) {
      const id = normalizeTeamIdInput(team.team_id);
      if (!id) {
        continue;
      }
      map[id] = team.school_name || team.abbreviation || id;
    }
    map[UCSB_TEAM_ID] = map[UCSB_TEAM_ID] || "UC Santa Barbara";
    return map;
  }, [espnTeams]);

  const loadEspnTeams = useCallback(async () => {
    setTeamsLoading(true);
    setTeamsError("");
    try {
      const payload = await fetchJson(`${API_BASE}/api/espn/teams`, {}, 1);
      const teams = Array.isArray(payload.teams) ? payload.teams : [];
      setEspnTeams(teams);
    } catch (error) {
      setTeamsError(error.message);
    } finally {
      setTeamsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEspnTeams();
  }, [loadEspnTeams]);

  const loadSeasonPlayers = useCallback(async (side, teamId) => {
    const normalizedTeamId = normalizeTeamIdInput(teamId);
    if (!normalizedTeamId) {
      return;
    }
    setSeasonPlayersLoading((prev) => ({ ...prev, [side]: true }));
    setSeasonPlayersError((prev) => ({ ...prev, [side]: "" }));
    try {
      const payload = await fetchJson(`${API_BASE}/api/espn/season/${normalizedTeamId}/player`, {}, 1);
      const safeColumns = (payload.columns || []).filter((column) => !HIDDEN_COLUMNS.has(column));
      setSeasonPlayers((prev) => ({
        ...prev,
        [side]: { columns: safeColumns, rows: payload.rows || [] }
      }));
    } catch (error) {
      setSeasonPlayersError((prev) => ({ ...prev, [side]: error.message }));
      setSeasonPlayers((prev) => ({
        ...prev,
        [side]: { columns: [], rows: [] }
      }));
    } finally {
      setSeasonPlayersLoading((prev) => ({ ...prev, [side]: false }));
    }
  }, []);

  useEffect(() => {
    loadSeasonPlayers("ucsb", UCSB_TEAM_ID);
  }, [loadSeasonPlayers]);

  useEffect(() => {
    if (!normalizedOpponentTeamId) {
      setSeasonPlayers((prev) => ({
        ...prev,
        opponent: { columns: [], rows: [] }
      }));
      setSeasonPlayersError((prev) => ({ ...prev, opponent: "" }));
      return;
    }
    loadSeasonPlayers("opponent", normalizedOpponentTeamId);
  }, [loadSeasonPlayers, normalizedOpponentTeamId]);

  const loadPbp = useCallback(async (gameId) => {
    const gid = gameId ?? pbpGameId;
    const clientValidationError = validatePbpAdvancedFilters(pbpAppliedFilters);
    if (clientValidationError) {
      // Defensive: applied filters should already be valid via disabled Apply.
      return;
    }
    const filterQuery = buildPbpFilterQuery(pbpAppliedFilters);
    const url = `${API_BASE}/api/pbp?game_id=${encodeURIComponent(gid)}${filterQuery ? `&${filterQuery}` : ""}`;
    setPbpLoading(true);
    setPbpError("");
    try {
      const payload = await fetchJson(url, {}, 1);
      const safeColumns = (payload.columns || []).filter((column) => !HIDDEN_COLUMNS.has(column));
      setPbpData({
        columns: safeColumns,
        rows: payload.rows || [],
        team_id: payload.team_id || PBP_TEAM_ID,
        updated_at: payload.updated_at || "",
        source_url: payload.source_url || ""
      });
    } catch (error) {
      setPbpError(error.message);
      setPbpData((prev) => ({ ...prev, columns: [], rows: [] }));
    } finally {
      setPbpLoading(false);
    }
  }, [pbpAppliedFilters, pbpGameId]);

  useEffect(() => {
    loadPbp();
  }, [loadPbp]);

  const loadLiveStats = useCallback(async () => {
    setLiveStatsLoading(true);
    setLiveStatsError("");
    const ucsb = encodeURIComponent(UCSB_TEAM_ID);
    const opponent = normalizedOpponentTeamId ? encodeURIComponent(normalizedOpponentTeamId) : "";
    const gameId = encodeURIComponent(pbpGameId);
    const url = `${API_BASE}/api/pbp/live-stats?ucsb=${ucsb}${opponent ? `&opponent=${opponent}` : ""}&game_id=${gameId}`;
    try {
      const payload = await fetchJson(url, {}, 1);
      setLiveStats({
        ucsb_team: { columns: payload.ucsb_team?.columns || [], rows: payload.ucsb_team?.rows || [] },
        ucsb_players: { columns: payload.ucsb_players?.columns || [], rows: payload.ucsb_players?.rows || [] },
        opponent_team: { columns: payload.opponent_team?.columns || [], rows: payload.opponent_team?.rows || [] },
        opponent_players: { columns: payload.opponent_players?.columns || [], rows: payload.opponent_players?.rows || [] }
      });
    } catch (error) {
      setLiveStatsError(error.message);
      setLiveStats({
        ucsb_team: { columns: [], rows: [] },
        ucsb_players: { columns: [], rows: [] },
        opponent_team: { columns: [], rows: [] },
        opponent_players: { columns: [], rows: [] }
      });
    } finally {
      setLiveStatsLoading(false);
    }
  }, [normalizedOpponentTeamId, pbpGameId]);

  useEffect(() => {
    if (!pbpLoading && !pbpError) {
      loadLiveStats();
    }
  }, [pbpLoading, pbpError, loadLiveStats]);

  const updatePbp = useCallback(async () => {
    setPbpUpdating(true);
    setPbpError("");
    setInsightError("");
    try {
      await fetchJson(
        `${API_BASE}/api/pbp/update`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true, game_id: pbpGameId })
        },
        1
      );
      await loadPbp();
    } catch (error) {
      setPbpError(error.message);
      setInsightError(error.message);
    } finally {
      setPbpUpdating(false);
    }
  }, [loadPbp, pbpGameId]);

  const resolveTeamName = useCallback(
    (teamId) => {
      const normalized = normalizeTeamIdInput(teamId);
      if (normalized === PBP_TEAM_ID) {
        return "PBP";
      }
      if (teamNameById[normalized]) {
        return teamNameById[normalized];
      }
      if (normalized === UCSB_TEAM_ID) {
        return "UC Santa Barbara";
      }
      return normalized || "Team";
    },
    [teamNameById]
  );

  const handleEvidenceClick = useCallback(
    (ref) => {
      const target = resolveEvidenceTarget(ref, UCSB_TEAM_ID, normalizedOpponentTeamId);
      if (!target) {
        setInsightError("Evidence target could not be resolved for the currently selected teams.");
        return;
      }

      if (target.panel === "pbp") {
        setPbpTableState((prev) => ({
          ...prev,
          selectedRowKey: target.rowKey,
          highlightRowKey: target.rowKey,
          forcedRowKey: target.rowKey
        }));
        window.setTimeout(() => {
          setPbpTableState((prev) => ({
            ...prev,
            highlightRowKey: prev.highlightRowKey === target.rowKey ? "" : prev.highlightRowKey
          }));
        }, 3500);
        return;
      }

      setActiveSeasonSide(target.side);
      if (target.dataset === "players") {
        setSeasonPlayersTableState((prev) => ({
          ...prev,
          [target.side]: {
            ...prev[target.side],
            selectedRowKey: target.rowKey,
            highlightRowKey: target.rowKey,
            forcedRowKey: target.rowKey
          }
        }));
      }
    },
    [normalizedOpponentTeamId]
  );

  const generateInsights = useCallback(async () => {
    setInsightLoading(true);
    setInsightError("");

    const contexts = [{ team_id: PBP_TEAM_ID, dataset: "pbp", game_id: pbpGameId }];

    if (!pbpData.rows.length) {
      setInsightLoading(false);
      setInsightError("PBP data is empty. Click Update in the PBP panel first.");
      return;
    }

    if (contextEnabled.ucsbTeam) {
      contexts.push({ team_id: UCSB_TEAM_ID, dataset: "team" });
    }
    if (contextEnabled.ucsbPlayers) {
      contexts.push({ team_id: UCSB_TEAM_ID, dataset: "players" });
    }

    if (normalizedOpponentTeamId) {
      if (contextEnabled.opponentTeam) {
        contexts.push({ team_id: normalizedOpponentTeamId, dataset: "team" });
      }
      if (contextEnabled.opponentPlayers) {
        contexts.push({ team_id: normalizedOpponentTeamId, dataset: "players" });
      }
    }

    try {
      const payload = await fetchJson(
        `${API_BASE}/api/insights`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, contexts })
        },
        1
      );
      setInsights(payload.insights || []);
    } catch (error) {
      setInsightError(error.message);
    } finally {
      setInsightLoading(false);
    }
  }, [contextEnabled, normalizedOpponentTeamId, pbpData.rows.length, prompt, pbpGameId]);

  const ucsbDisplayName = teamNameById[UCSB_TEAM_ID] || "UC Santa Barbara";
  const opponentDisplayName = teamNameById[normalizedOpponentTeamId] || normalizedOpponentTeamId || "Opponent";
  const activeSeasonName = activeSeasonSide === "ucsb" ? ucsbDisplayName : opponentDisplayName;
  const activeLivePrefix = activeLiveSide === "ucsb" ? "ucsb" : "opponent";
  const activeSeasonPlayers = seasonPlayers[activeSeasonSide];
  const activeSeasonPlayersLoading = seasonPlayersLoading[activeSeasonSide];
  const activeSeasonPlayersError = seasonPlayersError[activeSeasonSide];
  const activeSeasonPlayersTableState = seasonPlayersTableState[activeSeasonSide];
  const livePlayersData = liveStats[`${activeLivePrefix}_players`] || { columns: [], rows: [] };
  const livePlayerRows = liveStats[`${activeLivePrefix}_players`]?.rows?.length ?? 0;
  const activeLivePlayersTableState = livePlayersTableState[activeLiveSide];
  const pbpCanApply = canApplyPbpAdvancedFilters(pbpAdvancedFiltersDraft);
  const pbpFiltersDirty = !pbpAdvancedFiltersEqual(pbpAdvancedFiltersDraft, pbpAppliedFilters);
  const pbpClockHint = useMemo(() => {
    if (pbpAdvancedFiltersDraft.clockMode === "last_n" && !pbpCanApply) {
      return "Enter minutes greater than 0 to apply.";
    }
    if (pbpAdvancedFiltersDraft.clockMode === "range" && !pbpCanApply) {
      return "Enter From and To in MM:SS format.";
    }
    return "";
  }, [pbpAdvancedFiltersDraft.clockMode, pbpCanApply]);
  const pbpTeamOptions = useMemo(() => {
    const opts = new Set(["UCSB", "Opponent"]);
    for (const row of pbpData.rows) {
      const value = String(row.team_id || "").trim();
      if (value) {
        opts.add(value);
      }
    }
    for (const selected of pbpAdvancedFiltersDraft.teamIds) {
      if (selected) {
        opts.add(selected);
      }
    }
    return Array.from(opts);
  }, [pbpAdvancedFiltersDraft.teamIds, pbpData.rows]);
  const pbpTypeOptions = useMemo(() => {
    const opts = new Set();
    for (const row of pbpData.rows) {
      const value = String(row.type || "").trim();
      if (value) {
        opts.add(value);
      }
    }
    for (const selected of pbpAdvancedFiltersDraft.types) {
      if (selected) {
        opts.add(selected);
      }
    }
    return Array.from(opts).sort((a, b) => a.localeCompare(b));
  }, [pbpAdvancedFiltersDraft.types, pbpData.rows]);
  const pbpPeriodOptions = useMemo(() => {
    const opts = new Set();
    for (const row of pbpData.rows) {
      const value = String(row.period || "").trim();
      if (value) {
        opts.add(value);
      }
    }
    for (const selected of pbpAdvancedFiltersDraft.periods) {
      if (selected) {
        opts.add(selected);
      }
    }
    return Array.from(opts).sort((a, b) => a.localeCompare(b));
  }, [pbpAdvancedFiltersDraft.periods, pbpData.rows]);

  const handleApplyPbpAdvancedFilters = useCallback(() => {
    if (!canApplyPbpAdvancedFilters(pbpAdvancedFiltersDraft)) {
      return;
    }
    setPbpAppliedFilters({ ...pbpAdvancedFiltersDraft });
  }, [pbpAdvancedFiltersDraft]);

  const handleClearPbpAdvancedFilters = useCallback(() => {
    setPbpAdvancedFiltersDraft({ ...DEFAULT_PBP_ADVANCED_FILTERS });
    setPbpAppliedFilters({ ...DEFAULT_PBP_ADVANCED_FILTERS });
  }, []);

  const pbpAdvancedControls = (
    <details
      className="pbp-advanced-panel"
      open={pbpAdvancedOpen}
      onToggle={(event) => setPbpAdvancedOpen(event.currentTarget.open)}
    >
      <summary className="pbp-advanced-summary">Advanced filters</summary>
      <div className="pbp-advanced-filters">
      <label>
        Team
        <select
          className="compact-multi"
          multiple
          value={pbpAdvancedFiltersDraft.teamIds}
          onChange={(event) =>
            setPbpAdvancedFiltersDraft((prev) => ({
              ...prev,
              teamIds: Array.from(event.target.selectedOptions).map((option) => option.value)
            }))
          }
        >
          {pbpTeamOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type
        <select
          className="compact-multi"
          multiple
          value={pbpAdvancedFiltersDraft.types}
          onChange={(event) =>
            setPbpAdvancedFiltersDraft((prev) => ({
              ...prev,
              types: Array.from(event.target.selectedOptions).map((option) => option.value)
            }))
          }
        >
          {pbpTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Period
        <select
          className="compact-multi"
          multiple
          value={pbpAdvancedFiltersDraft.periods}
          onChange={(event) =>
            setPbpAdvancedFiltersDraft((prev) => ({
              ...prev,
              periods: Array.from(event.target.selectedOptions).map((option) => option.value)
            }))
          }
        >
          {pbpPeriodOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="clock-filter-group">
        <span>Clock</span>
        <label>
          <input
            type="radio"
            name="pbp-clock-mode"
            checked={pbpAdvancedFiltersDraft.clockMode === "last_n"}
            onChange={() =>
              setPbpAdvancedFiltersDraft((prev) => ({
                ...prev,
                clockMode: "last_n",
                clockFrom: "",
                clockTo: ""
              }))
            }
          />
          Last N minutes
        </label>
        <label>
          <input
            type="radio"
            name="pbp-clock-mode"
            checked={pbpAdvancedFiltersDraft.clockMode === "range"}
            onChange={() =>
              setPbpAdvancedFiltersDraft((prev) => ({
                ...prev,
                clockMode: "range",
                clockLastNMinutes: ""
              }))
            }
          />
          Range
        </label>
        <label>
          <input
            type="radio"
            name="pbp-clock-mode"
            checked={!pbpAdvancedFiltersDraft.clockMode}
            onChange={() =>
              setPbpAdvancedFiltersDraft((prev) => ({
                ...prev,
                clockMode: "",
                clockLastNMinutes: "",
                clockFrom: "",
                clockTo: ""
              }))
            }
          />
          Off
        </label>
        {pbpAdvancedFiltersDraft.clockMode === "last_n" ? (
          <input
            type="number"
            min="0"
            step="0.1"
            required
            value={pbpAdvancedFiltersDraft.clockLastNMinutes}
            placeholder="Minutes (e.g., 2.5)"
            onChange={(event) =>
              setPbpAdvancedFiltersDraft((prev) => ({ ...prev, clockLastNMinutes: event.target.value }))
            }
          />
        ) : null}
        {pbpAdvancedFiltersDraft.clockMode === "range" ? (
          <>
            <input
              type="text"
              required
              value={pbpAdvancedFiltersDraft.clockFrom}
              placeholder="From MM:SS"
              onChange={(event) => setPbpAdvancedFiltersDraft((prev) => ({ ...prev, clockFrom: event.target.value }))}
            />
            <input
              type="text"
              required
              value={pbpAdvancedFiltersDraft.clockTo}
              placeholder="To MM:SS"
              onChange={(event) => setPbpAdvancedFiltersDraft((prev) => ({ ...prev, clockTo: event.target.value }))}
            />
          </>
        ) : null}
      </div>
      {pbpClockHint ? <div className="pbp-inline-hint">{pbpClockHint}</div> : null}
      <button
        type="button"
        className="neutral apply-filters-btn"
        onClick={handleApplyPbpAdvancedFilters}
        disabled={!pbpCanApply || !pbpFiltersDirty}
      >
        Apply
      </button>
      <button
        type="button"
        className="neutral"
        onClick={handleClearPbpAdvancedFilters}
      >
        Clear filters
      </button>
      </div>
    </details>
  );

  return (
    <div className="app-shell">
      <PanelGroup direction="horizontal">
        <Panel
          ref={seasonDataPanelRef}
          defaultSize={33.33}
          minSize={22}
          collapsible
          collapsedSize={4}
          onCollapse={() => setSeasonDataCollapsed(true)}
          onExpand={() => setSeasonDataCollapsed(false)}
        >
          <div className="panel data-panel">
            {seasonDataCollapsed ? (
              <div className="panel-collapsed" onClick={() => seasonDataPanelRef.current?.expand()}>
                <span>Season Data</span>
              </div>
            ) : (
              <>
            <div className="section-header">
              <h2>Season Data</h2>
              <span>Viewing: {activeSeasonName}</span>
              <CollapseButton
                panelRef={seasonDataPanelRef}
                collapsed={seasonDataCollapsed}
                onCollapsedChange={setSeasonDataCollapsed}
                title="Season Data"
              />
            </div>

            <div className="tab-tree">
              <div className="branch">
                <h3>Team View</h3>
                <div className="leaf-list">
                  <button type="button" className={`leaf ${activeSeasonSide === "ucsb" ? "active" : ""}`} onClick={() => setActiveSeasonSide("ucsb")}>
                    UCSB
                  </button>
                  <button
                    type="button"
                    className={`leaf ${activeSeasonSide === "opponent" ? "active" : ""}`}
                    onClick={() => setActiveSeasonSide("opponent")}
                    disabled={!normalizedOpponentTeamId}
                  >
                    Opponent
                  </button>
                </div>
                <div className="team-line opponent-line">
                  {espnTeams.length > 0 ? (
                    <select value={normalizedOpponentTeamId} onChange={(event) => setOpponentTeamId(event.target.value)}>
                      <option value="">Select ESPN team</option>
                      {espnTeams
                        .filter((team) => normalizeTeamIdInput(team.team_id) !== UCSB_TEAM_ID)
                        .map((team) => (
                          <option key={team.team_id} value={team.team_id}>
                            {team.school_name} ({team.team_id})
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={opponentTeamId}
                      placeholder="Team ID (e.g., ucr)"
                      onChange={(event) => setOpponentTeamId(event.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="table-status">
              {activeSeasonPlayersLoading ? <span> Loading season players...</span> : null}
              {activeSeasonPlayersError ? <span className="error"> {activeSeasonPlayersError}</span> : null}
              {teamsLoading ? <span> Loading ESPN teams...</span> : null}
              {teamsError ? <span className="error"> {teamsError}</span> : null}
              {activeSeasonSide === "opponent" && !normalizedOpponentTeamId ? <span> Select an opponent team to view opponent data.</span> : null}
            </div>
            <DataTable
              columns={activeSeasonPlayers.columns}
              rows={activeSeasonPlayers.rows}
              state={activeSeasonPlayersTableState}
              onChange={(patch) =>
                setSeasonPlayersTableState((prev) => ({
                  ...prev,
                  [activeSeasonSide]: {
                    ...prev[activeSeasonSide],
                    ...patch
                  }
                }))
              }
            />
              </>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle vertical" />

        <Panel
          ref={gameDataPanelRef}
          defaultSize={33.33}
          minSize={22}
          collapsible
          collapsedSize={4}
          onCollapse={() => setGameDataCollapsed(true)}
          onExpand={() => setGameDataCollapsed(false)}
        >
          <div className="panel game-data-panel">
            {gameDataCollapsed ? (
              <div className="panel-collapsed" onClick={() => gameDataPanelRef.current?.expand()}>
                <span>Game Data</span>
              </div>
            ) : (
              <>
            <div className="section-header">
              <h2>Game Data</h2>
              <div className="game-data-subtabs">
                <button
                  type="button"
                  className={gameDataSubtab === "live-stats" ? "active" : ""}
                  onClick={() => setGameDataSubtab("live-stats")}
                >
                  Live Stats
                </button>
                <button
                  type="button"
                  className={gameDataSubtab === "pbp" ? "active" : ""}
                  onClick={() => setGameDataSubtab("pbp")}
                >
                  Play-by-Play
                </button>
              </div>
              <div className="panel-header-actions">
                <label>
                  <span className="label-inline">Game ID:</span>
                  <select
                    value={pbpGameId}
                    onChange={(e) => setPbpGameId(e.target.value)}
                    disabled={pbpUpdating}
                  >
                    {PBP_GAME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={updatePbp} disabled={pbpUpdating}>
                  {pbpUpdating ? "Updating..." : "Update"}
                </button>
                <span>{pbpData.updated_at ? `Updated ${new Date(pbpData.updated_at).toLocaleString()}` : "No saved PBP yet"}</span>
              </div>
              <CollapseButton
                panelRef={gameDataPanelRef}
                collapsed={gameDataCollapsed}
                onCollapsedChange={setGameDataCollapsed}
                title="Game Data"
              />
            </div>

            {gameDataSubtab === "live-stats" ? (
              <>
                <div className="tab-tree live-stats-tree">
                  <div className="branch">
                    <h3>Team View</h3>
                    <div className="leaf-list">
                      <button type="button" className={`leaf ${activeLiveSide === "ucsb" ? "active" : ""}`} onClick={() => setActiveLiveSide("ucsb")}>
                        UCSB
                      </button>
                      <button
                        type="button"
                        className={`leaf ${activeLiveSide === "opponent" ? "active" : ""}`}
                        onClick={() => setActiveLiveSide("opponent")}
                        disabled={!normalizedOpponentTeamId}
                      >
                        Opponent
                      </button>
                    </div>
                  </div>
                </div>
                <div className="table-status">
                  {liveStatsLoading ? <span> Loading live stats...</span> : null}
                  {liveStatsError ? <span className="error"> {liveStatsError}</span> : null}
                  {!pbpData.rows.length ? (
                    <span> Live stats are derived from play-by-play data. Click Update above to fetch PBP first.</span>
                  ) : (
                    <span> Derived from play-by-play ({pbpData.rows.length} plays).</span>
                  )}
                </div>
                <div className="table-status">
                  <span>
                    {activeLiveSide === "ucsb" ? "UCSB" : "Opponent"} live player rows: {livePlayerRows}
                  </span>
                </div>
                <DataTable
                  columns={livePlayersData.columns}
                  rows={livePlayersData.rows}
                  state={activeLivePlayersTableState}
                  onChange={(patch) =>
                    setLivePlayersTableState((prev) => ({
                      ...prev,
                      [activeLiveSide]: {
                        ...prev[activeLiveSide],
                        ...patch
                      }
                    }))
                  }
                />
              </>
            ) : (
              <>
                <div className="table-status">
                  {pbpLoading ? <span> Loading PBP...</span> : null}
                  {pbpError ? <span className="error"> {pbpError}</span> : null}
                  {!pbpLoading && !pbpError && pbpData.rows.length ? <span> Rows: {pbpData.rows.length}</span> : null}
                  {!pbpLoading && !pbpError && pbpData.source_url ? (
                    <span>
                      {" "}
                      Source:{" "}
                      <a href={pbpData.source_url} target="_blank" rel="noreferrer">
                        ESPN Core API
                      </a>
                    </span>
                  ) : null}
                </div>
                <DataTable
                  columns={pbpData.columns}
                  rows={pbpData.rows}
                  state={pbpTableState}
                  onChange={(patch) => setPbpTableState((prev) => ({ ...prev, ...patch }))}
                  extraControls={pbpAdvancedControls}
                />
              </>
            )}
              </>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="resize-handle vertical" />

        <Panel
          ref={insightsColumnRef}
          defaultSize={33.33}
          minSize={22}
          collapsible
          collapsedSize={4}
          onCollapse={() => setInsightsColumnCollapsed(true)}
          onExpand={() => setInsightsColumnCollapsed(false)}
        >
          {insightsColumnCollapsed ? (
            <div className="panel-collapsed" onClick={() => insightsColumnRef.current?.expand()}>
              <span>Insights</span>
            </div>
          ) : (
          <div className="insights-column">
            <div className="insights-column-header">
              <span>Insights</span>
              <CollapseButton
                panelRef={insightsColumnRef}
                collapsed={insightsColumnCollapsed}
                onCollapsedChange={setInsightsColumnCollapsed}
                title="Insights"
              />
            </div>
            <PanelGroup direction="vertical" className="insights-panel-group">
            <Panel
              ref={promptPanelRef}
              defaultSize={68}
              minSize={36}
              collapsible
              collapsedSize={4}
              onCollapse={() => setPromptCollapsed(true)}
              onExpand={() => setPromptCollapsed(false)}
            >
              <div className="panel prompt-panel">
                {promptCollapsed ? (
                  <div className="panel-collapsed" onClick={() => promptPanelRef.current?.expand()}>
                    <span>Prompt + Insights</span>
                  </div>
                ) : (
                  <>
                <div className="section-header">
                  <h2>Prompt + Insights</h2>
                  <span>Structured output with evidence refs</span>
                  <CollapseButton
                    panelRef={promptPanelRef}
                    collapsed={promptCollapsed}
                    onCollapsedChange={setPromptCollapsed}
                    title="Prompt + Insights"
                  />
                </div>

                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Enter Prompt"
                />

                <div className="prompt-actions">
                  <button type="button" onClick={generateInsights} disabled={insightLoading || !prompt.trim()}>
                    {insightLoading ? "Submitting..." : "Submit"}
                  </button>
                  {insightError ? <span className="error">{insightError}</span> : null}
                </div>

                <p className="prompt-note">Full PBP table is always included as primary context.</p>

                <div className="context-buttons">
                  <button type="button" className={contextEnabled.ucsbTeam ? "active" : ""} onClick={() => setContextEnabled((prev) => ({ ...prev, ucsbTeam: !prev.ucsbTeam, ucsbPlayers: !prev.ucsbTeam }))}>
                    Include UCSB Season Data
                  </button>
                  <button type="button" className={contextEnabled.opponentTeam ? "active" : ""} onClick={() => setContextEnabled((prev) => ({ ...prev, opponentTeam: !prev.opponentTeam, opponentPlayers: !prev.opponentTeam }))} disabled={!normalizedOpponentTeamId}>
                    Include Opponent Season Data
                  </button>
                </div>

                <div className="bubbles">
                  {insights.length === 0 ? <p className="placeholder">Generated insights will appear here.</p> : null}
                  {insights.map((insight, index) => (
                    <InsightBubble
                      key={`insight_${index}`}
                      insight={insight}
                      onEvidenceClick={handleEvidenceClick}
                      onSave={() => setSavedInsights((prev) => [...prev, insight])}
                      saveText="Save"
                      resolveTeamName={resolveTeamName}
                    />
                  ))}
                </div>
                  </>
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="resize-handle horizontal" />

            <Panel
              ref={savedPanelRef}
              defaultSize={32}
              minSize={20}
              collapsible
              collapsedSize={4}
              onCollapse={() => setSavedCollapsed(true)}
              onExpand={() => setSavedCollapsed(false)}
            >
              <div className="panel saved-panel">
                {savedCollapsed ? (
                  <div className="panel-collapsed" onClick={() => savedPanelRef.current?.expand()}>
                    <span>Saved Insights</span>
                  </div>
                ) : (
                  <>
                <div className="section-header">
                  <h2>Saved Insights</h2>
                  <span>{savedInsights.length} saved</span>
                  <CollapseButton
                    panelRef={savedPanelRef}
                    collapsed={savedCollapsed}
                    onCollapsedChange={setSavedCollapsed}
                    title="Saved Insights"
                  />
                </div>
                <div className="bubbles">
                  {savedInsights.length === 0 ? <p className="placeholder">Saved insights are global and in-memory only.</p> : null}
                  {savedInsights.map((insight, index) => (
                    <InsightBubble
                      key={`saved_${index}`}
                      insight={insight}
                      onEvidenceClick={handleEvidenceClick}
                      onSave={() => setSavedInsights((prev) => prev.filter((_, savedIndex) => savedIndex !== index))}
                      saveText="Remove"
                      resolveTeamName={resolveTeamName}
                    />
                  ))}
                </div>
                  </>
                )}
              </div>
            </Panel>
          </PanelGroup>
          </div>
          )}
        </Panel>
      </PanelGroup>
    </div>
  );
}
