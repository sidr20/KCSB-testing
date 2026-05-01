import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

const UCSB_TEAM_ID = "2540";
const PBP_TEAM_ID = "pbp";
// NOTE: ONLY PDF VALID GAME IDS: 401809115 AND 401826049

const HIDDEN_COLUMNS = new Set(["row_key"]);
const TRENDS_STAT_THRESHOLDS_TEAM = [
  { stat_key: "points", value: 1.8 },
  { stat_key: "field_goals_made", value: 0.65 },
  { stat_key: "three_pointers_made", value: 0.19 },
  { stat_key: "free_throws_made", value: 0.33 },
  { stat_key: "rebounds", value: 0.9 },
  { stat_key: "offensive_rebounds", value: 0.25 },
  { stat_key: "defensive_rebounds", value: 0.65 },
  { stat_key: "assists", value: 0.38 },
  { stat_key: "steals", value: 0.18 },
  { stat_key: "blocks", value: 0.1 },
  { stat_key: "turnovers", value: 0.3 },
  { stat_key: "fouls", value: 0.43 }
];

const TRENDS_STAT_THRESHOLDS_PLAYER = [
  { stat_key: "points", value: 0.4 },
  { stat_key: "field_goals_made", value: 0.15 },
  { stat_key: "three_pointers_made", value: 0.044 },
  { stat_key: "free_throws_made", value: 0.068 },
  { stat_key: "rebounds", value: 0.16 },
  { stat_key: "offensive_rebounds", value: 0.048 },
  { stat_key: "defensive_rebounds", value: 0.112 },
  { stat_key: "assists", value: 0.08 },
  { stat_key: "steals", value: 0.032 },
  { stat_key: "blocks", value: 0.02 },
  { stat_key: "turnovers", value: 0.06 },
  { stat_key: "fouls", value: 0.1 }
];

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

function PlayerPerformanceStory({ playerTimeline, teamName, seasonAvg }) {
  const [activeStat, setActiveStat] = useState("points");

  if (!playerTimeline || !playerTimeline.stats) {
    return <div className="placeholder" style={{ padding: '40px', textAlign: 'center' }}>
      Select a player to visualize their game impact.
    </div>;
  }

  const statEntry = playerTimeline.stats.find(s => s.stat_key === activeStat);
  
  // Clean data for the chart
  const chartData = [
    { time: 0, total: 0, displayTime: "0:00" },
    ...(statEntry?.events || []).map(event => ({
      time: event.timestamp || 0,
      total: event.total || 0,
      displayTime: `${event.period}H ${Math.floor(event.timestamp / 60)}:${String(event.timestamp % 60).padStart(2, '0')}`
    }))
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <span className="label">{payload[0].payload.displayTime}</span>
          <span className="value">{payload[0].value} {activeStat.toUpperCase()}</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="player-story-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--ink)' }}>
            {playerTimeline.player_name}
          </h3>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 500 }}>{teamName}</span>
        </div>
        <select 
          value={activeStat} 
          onChange={(e) => setActiveStat(e.target.value)} 
          className="stat-selector"
          style={{ padding: '6px 12px', borderRadius: '10px', background: 'var(--panel-strong)' }}
        >
          <option value="points">Points</option>
          <option value="rebounds">Rebounds</option>
          <option value="assists">Assists</option>
        </select>
      </div>
      
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorStat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis dataKey="time" hide />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{fill: 'var(--muted)', fontSize: 11}}
              allowDecimals={false} 
            />
            <Tooltip content={<CustomTooltip />} />
            
            {/* Horizontal Line representing Season Average */}
            {seasonAvg && (
              <ReferenceLine 
                y={seasonAvg} 
                stroke="var(--warning)" 
                strokeDasharray="5 5"
                label={{ position: 'right', value: 'Season Avg', fill: 'var(--warning)', fontSize: 10 }} 
              />
            )}

            <Area 
              type="monotone" 
              dataKey="total" 
              stroke="var(--accent)" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorStat)"
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      
      <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
         <div className="stat-summary-chip">
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Current Total</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{chartData[chartData.length-1].total}</div>
         </div>
      </div>
    </div>
  );
}

function TeamPieComparison({ liveStats, teamName }) {
  const chartData = useMemo(() => {
    return (liveStats?.rows || []).map(row => ({
      name: row.Player,
      pie: parseFloat(row.PIE) || 0 
    })).sort((a, b) => b.pie - a.pie); 
  }, [liveStats]);

  return (
    <div className="player-story-card" style={{ height: '100%', padding: '20px' }}>
      <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: 800 }}>
        {teamName} Impact Efficiency (PIE)
      </h3>
      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(0,0,0,0.05)" />
            <XAxis type="number" domain={[0, 'auto']} hide />
            <YAxis 
              dataKey="name" 
              type="category" 
              width={120} 
              tick={{fill: 'var(--ink)', fontSize: 11, fontWeight: 600}} 
            />
            <Tooltip 
              formatter={(value) => [`${value.toFixed(1)}%`, 'PIE']}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
            />
            <Bar dataKey="pie" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
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

function formatInsightErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("OPENAI_API_KEY is not configured")) {
    return "Insights are unavailable because `OPENAI_API_KEY` is not set in `.env` for the API server.";
  }
  return message;
}

function collectTrendIncrements(row) {
  const increments = {};
  const playType = String(row.type || "");
  const text = String(row.text || "").toLowerCase();
  const scoringPlay = Boolean(row.scoring_play);
  const shootingPlay = Boolean(row.shooting_play);
  const scoreValue = Number(row.score_value || 0);
  const pointsAttempted = Number(row.points_attempted || 0);
  const assistId = String(row.assist_athlete_id || "").trim();

  if (scoringPlay && scoreValue > 0) increments.points = scoreValue;
  if (shootingPlay && (pointsAttempted === 2 || pointsAttempted === 3)) {
    increments.field_goals_attempted = 1;
    if (pointsAttempted === 2) increments.two_pointers_attempted = 1;
    if (pointsAttempted === 3) increments.three_pointers_attempted = 1;
  }
  if (scoringPlay && (scoreValue === 2 || scoreValue === 3)) {
    increments.field_goals_made = 1;
    if (scoreValue === 2) increments.two_pointers_made = 1;
    if (scoreValue === 3) increments.three_pointers_made = 1;
  }
  if (text.includes("free throw")) {
    increments.free_throws_attempted = 1;
    if (scoringPlay && scoreValue === 1) increments.free_throws_made = 1;
  }
  if (playType === "Offensive Rebound") {
    increments.offensive_rebounds = 1;
    increments.rebounds = 1;
  } else if (playType === "Defensive Rebound") {
    increments.defensive_rebounds = 1;
    increments.rebounds = 1;
  }
  if (playType === "Steal") increments.steals = 1;
  if (playType === "Block Shot") increments.blocks = 1;
  if (playType.toLowerCase().includes("turnover")) increments.turnovers = 1;
  if (playType.toLowerCase().includes("foul")) increments.fouls = 1;
  if (assistId && scoringPlay) increments.assists = 1;
  return increments;
}

function normalizeTrendPeriod(periodValue) {
  const raw = String(periodValue || "")
    .toLowerCase()
    .trim();
  if (!raw) return "2";
  if (raw.includes("1") || raw.includes("first") || raw === "1h" || raw === "1st") {
    return "1";
  }
  return "2";
}

function getPointsFromPbp(row) {
  const text = String(row.text || "").toLowerCase();
  const playType = String(row.type || "").toLowerCase();
  const actorId = String(row.athlete_id || "").trim();

  if (!actorId) return 0;
  if (text.includes("miss")) return 0;

  if (playType === "madefreethrow" || /makes .*free throw/.test(text)) {
    return 1;
  }

  if (
    /makes .*three point/.test(text) ||
    /makes .*three pointer/.test(text) ||
    /makes .*3-pt/.test(text) ||
    /makes .*3pt/.test(text)
  ) {
    return 3;
  }

  if (text.includes("makes")) {
    return 2;
  }

  return 0;
}


function buildCustomPlayerTimeline(rows, playerId, playerName, teamId) {
  if (!playerId || !rows || rows.length === 0) return null;

  let totalPoints = 0;
  const pointEvents = [];

  // Iterate through the raw PBP rows
  rows.forEach((row) => {
    const rowActorId = String(row.athlete_id || "").trim();
    
    if (rowActorId === String(playerId)) {
      const pts = getPointsFromPbp(row);
      
      // If the player scored, record the event and the running total
      if (pts > 0) {
        totalPoints += pts;
        pointEvents.push({
          timestamp: halfTimestampSeconds(row), 
          period: normalizeTrendPeriod(row.period),
          increment: pts,
          total: totalPoints
        });
      }
    }
  });

  // Return it in the exact format PlayerPerformanceStory expects!
  return {
    player_name: playerName || "Selected Player",
    team_id: teamId || "",
    stats: [
      {
        stat_key: "points",
        events: pointEvents
      }
    ]
  };
}

function parseClockRemainingSeconds(clockValue) {
  const raw = String(clockValue || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds > 59) {
    return null;
  }
  return minutes * 60 + seconds;
}

function halfTimestampSeconds(row) {
  const HALF_LENGTH_SECONDS = 20 * 60;
  const remaining = parseClockRemainingSeconds(row.clock);
  if (remaining === null) return 0;
  const elapsed = HALF_LENGTH_SECONDS - remaining;
  if (elapsed < 0) return 0;
  if (elapsed > HALF_LENGTH_SECONDS) return HALF_LENGTH_SECONDS;
  return elapsed;
}

function formatHalfRemainingClock(elapsedSeconds) {
  const HALF_LENGTH_SECONDS = 20 * 60;
  const safeElapsed = Math.max(0, Math.min(HALF_LENGTH_SECONDS, elapsedSeconds));
  const remaining = HALF_LENGTH_SECONDS - safeElapsed;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function deriveTrendsCheckpoint(rows) {
  const fallback = {
    currentHalf: "1",
    currentTimestamp: 10 * 60,
    label: "1st Half 10:00"
  };
  if (!Array.isArray(rows) || !rows.length) {
    return fallback;
  }

  let latest = null;
  for (const row of rows) {
    const currentHalf = normalizeTrendPeriod(row?.period);
    const halfRank = Number(currentHalf || 0);
    const currentTimestamp = halfTimestampSeconds(row);
    if (!latest || halfRank > latest.halfRank || (halfRank === latest.halfRank && currentTimestamp > latest.currentTimestamp)) {
      const rawPeriod = String(row?.period || "").trim();
      const periodLabel = rawPeriod || (currentHalf === "1" ? "1st Half" : "2nd Half");
      const rawClock = String(row?.clock || "").trim();
      latest = {
        halfRank,
        currentHalf,
        currentTimestamp,
        label: `${periodLabel} ${rawClock || formatHalfRemainingClock(currentTimestamp)}`
      };
    }
  }

  if (!latest) {
    return fallback;
  }
  return {
    currentHalf: latest.currentHalf,
    currentTimestamp: latest.currentTimestamp,
    label: latest.label
  };
}

function buildTrendsAnalyticsTimelines(rows) {
  const perTeamTotals = {};
  const perTeamStats = {};

  rows.forEach((row) => {
    const rawTeamId = String(row.team_id || "").trim();
    if (!rawTeamId) return;
    const normalizedTeamId = normalizeTeamIdInput(rawTeamId);
    let teamId = normalizedTeamId;
    if (normalizedTeamId === "ucsb" || normalizedTeamId === UCSB_TEAM_ID) {
      teamId = UCSB_TEAM_ID;
    } else if (normalizedTeamId === "opponent") {
      teamId = "opponent";
    }
    if (!teamId) return;
    const increments = collectTrendIncrements(row);
    const statKeys = Object.keys(increments);
    if (!statKeys.length) return;
    if (!perTeamTotals[teamId]) perTeamTotals[teamId] = {};
    if (!perTeamStats[teamId]) perTeamStats[teamId] = {};

    statKeys.forEach((statKey) => {
      const increment = Number(increments[statKey] || 0);
      if (increment <= 0) return;
      const total = Number(perTeamTotals[teamId][statKey] || 0) + increment;
      perTeamTotals[teamId][statKey] = total;
      if (!perTeamStats[teamId][statKey]) perTeamStats[teamId][statKey] = [];
      perTeamStats[teamId][statKey].push({
        timestamp: halfTimestampSeconds(row),
        period: normalizeTrendPeriod(row.period),
        increment,
        total
      });
    });
  });

  const out = {};
  Object.entries(perTeamStats).forEach(([teamId, statMap]) => {
    out[teamId] = Object.entries(statMap).map(([statKey, events]) => ({
      stat_key: statKey,
      events
    }));
  });
  return out;
}

function buildTrendsPlayerAnalyticsTimelines(rows, playerNameById = {}) {
  const perPlayerTotals = {};
  const perPlayerStats = {};
  const perPlayerTeam = {};

  rows.forEach((row) => {
    const rawTeamId = String(row.team_id || "").trim();
    const normalizedTeamId = normalizeTeamIdInput(rawTeamId);
    const teamId =
      normalizedTeamId === "ucsb" || normalizedTeamId === UCSB_TEAM_ID
        ? UCSB_TEAM_ID
        : normalizedTeamId === "opponent"
          ? "opponent"
          : normalizedTeamId;

    const actorId = String(row.athlete_id || "").trim();
    const assistId = String(row.assist_athlete_id || "").trim();
    const actorIncrements = collectTrendIncrements(row);
    const perPlayerIncrements = {};

    if (actorId) {
      perPlayerIncrements[actorId] = { ...actorIncrements };
      delete perPlayerIncrements[actorId].assists;
      if (teamId) {
        perPlayerTeam[actorId] = teamId;
      }
    }
    if (assistId && row.scoring_play) {
      if (!perPlayerIncrements[assistId]) {
        perPlayerIncrements[assistId] = {};
      }
      perPlayerIncrements[assistId].assists = Number(perPlayerIncrements[assistId].assists || 0) + 1;
      if (teamId && !perPlayerTeam[assistId]) {
        perPlayerTeam[assistId] = teamId;
      }
    }

    Object.entries(perPlayerIncrements).forEach(([playerId, increments]) => {
      const statKeys = Object.keys(increments);
      if (!statKeys.length) return;
      if (!perPlayerTotals[playerId]) perPlayerTotals[playerId] = {};
      if (!perPlayerStats[playerId]) perPlayerStats[playerId] = {};

      statKeys.forEach((statKey) => {
        const increment = Number(increments[statKey] || 0);
        if (increment <= 0) return;
        const total = Number(perPlayerTotals[playerId][statKey] || 0) + increment;
        perPlayerTotals[playerId][statKey] = total;
        if (!perPlayerStats[playerId][statKey]) perPlayerStats[playerId][statKey] = [];
        perPlayerStats[playerId][statKey].push({
          timestamp: halfTimestampSeconds(row),
          period: normalizeTrendPeriod(row.period),
          increment,
          total
        });
      });
    });
  });

  const out = {};
  Object.entries(perPlayerStats).forEach(([playerId, statMap]) => {
    out[playerId] = {
      player_name: playerNameById[playerId] || `Player ${playerId}`,
      team_id: perPlayerTeam[playerId] || "",
      stats: Object.entries(statMap).map(([statKey, events]) => ({
        stat_key: statKey,
        events
      }))
    };
  });
  return out;
}

function trendsStatLabel(statKey) {
  return String(statKey || "")
    .replace(/_/g, " ")
    .trim();
}

function buildTrendsMessages({
  teamTimelines,
  playerTimelines,
  teamNameById,
  overMultiplier,
  underMultiplier,
  currentHalf,
  currentTimestamp
}) {
  const thresholdByStat = Object.fromEntries(
    TRENDS_STAT_THRESHOLDS_TEAM.map((threshold) => [threshold.stat_key, threshold])
  );
  const thresholdByPlayerStat = Object.fromEntries(
    TRENDS_STAT_THRESHOLDS_PLAYER.map((threshold) => [threshold.stat_key, threshold])
  );
  const effectiveHalf = currentHalf || "1";
  const effectiveTimestamp =
    typeof currentTimestamp === "number" && currentTimestamp >= 0
      ? currentTimestamp
      : 10 * 60;
  const maxWindowMinutes = Math.floor(effectiveTimestamp / 60);
  const messages = [];
  const playerMessages = [];

  for (const [teamId, stats] of Object.entries(teamTimelines || {})) {
    const teamLabel =
      teamId === UCSB_TEAM_ID
        ? "UCSB"
        : teamId === "opponent"
          ? "Opponent"
          : teamNameById[teamId] || teamId || "Opponent";

    for (const statEntry of stats) {
      const statKey = String(statEntry.stat_key || "");
      const threshold = thresholdByStat[statKey];
      if (!threshold) continue;
      const nationalAverage = Number(threshold.value || 0);
      if (nationalAverage <= 0) continue;

      const overThreshold = nationalAverage * overMultiplier;
      const underThreshold = nationalAverage * underMultiplier;
      const events = (statEntry.events || [])
        .filter((event) => event.period === effectiveHalf && typeof event.timestamp === "number" && event.timestamp <= effectiveTimestamp)
        .sort((left, right) => left.timestamp - right.timestamp);
      if (!events.length) continue;

      let bestOverMinutes = 0;
      let bestOverTotal = 0;
      let bestUnderMinutes = 0;
      let bestUnderTotal = 0;
      for (let minutes = 3; minutes <= maxWindowMinutes; minutes += 1) {
        const windowStart = effectiveTimestamp - minutes * 60;
        let total = 0;
        for (const event of events) {
          if (event.timestamp > windowStart) {
            total += Number(event.increment || 0);
          }
        }
        const rate = total / minutes;
        if (rate >= overThreshold && minutes > bestOverMinutes) {
          bestOverMinutes = minutes;
          bestOverTotal = total;
        }
        if (rate <= underThreshold && minutes > bestUnderMinutes) {
          bestUnderMinutes = minutes;
          bestUnderTotal = total;
        }
      }

      if (bestOverMinutes && bestOverTotal >= 3) {
        messages.push({
          text:
            statKey === "points"
              ? `${teamLabel} has scored ${bestOverTotal} points in the last ${bestOverMinutes} minutes.`
              : `${teamLabel} has ${bestOverTotal} ${trendsStatLabel(statKey)} in the last ${bestOverMinutes} minutes.`,
          tone: "good"
        });
      }

      if (bestUnderMinutes) {
        messages.push({
          text:
            statKey === "points"
              ? `${teamLabel} has scored ${bestUnderTotal} points in the last ${bestUnderMinutes} minutes.`
              : `${teamLabel} has ${bestUnderTotal} ${trendsStatLabel(statKey)} in the last ${bestUnderMinutes} minutes.`,
          tone: "bad"
        });
      }
    }
  }

  for (const [playerId, playerData] of Object.entries(playerTimelines || {})) {
    const teamId = String(playerData.team_id || "");
    const teamLabel =
      teamId === UCSB_TEAM_ID
        ? "UCSB"
        : teamId === "opponent"
          ? "Opponent"
          : teamNameById[teamId] || teamId || "";
    const playerLabel = `${playerData.player_name || `Player ${playerId}`}${teamLabel ? ` (${teamLabel})` : ""}`;

    for (const statEntry of playerData.stats || []) {
      const statKey = String(statEntry.stat_key || "");
      const threshold = thresholdByPlayerStat[statKey];
      if (!threshold) continue;
      const nationalAverage = Number(threshold.value || 0);
      if (nationalAverage <= 0) continue;

      const overThreshold = nationalAverage * overMultiplier;
      const events = (statEntry.events || [])
        .filter((event) => event.period === effectiveHalf && typeof event.timestamp === "number" && event.timestamp <= effectiveTimestamp)
        .sort((left, right) => left.timestamp - right.timestamp);
      if (!events.length) continue;

      let bestOverMinutes = 0;
      let bestOverTotal = 0;
      for (let minutes = 3; minutes <= maxWindowMinutes; minutes += 1) {
        const windowStart = effectiveTimestamp - minutes * 60;
        let total = 0;
        for (const event of events) {
          if (event.timestamp > windowStart) {
            total += Number(event.increment || 0);
          }
        }
        if (total / minutes >= overThreshold && minutes > bestOverMinutes) {
          bestOverMinutes = minutes;
          bestOverTotal = total;
        }
      }

      if (bestOverMinutes && bestOverTotal >= 3) {
        playerMessages.push({
          text:
            statKey === "points"
              ? `${playerLabel} has scored ${bestOverTotal} points in the last ${bestOverMinutes} minutes.`
              : `${playerLabel} has ${bestOverTotal} ${trendsStatLabel(statKey)} in the last ${bestOverMinutes} minutes.`,
          tone: "good"
        });
      }
    }
  }

  return { messages, playerMessages };
}

function buildPlayerNameMapFromLiveStats(payload) {
  const map = {};
  const datasets = [payload?.ucsb_players?.rows || [], payload?.opponent_players?.rows || []];
  for (const rows of datasets) {
    for (const row of rows) {
      const rowKey = String(row?.row_key || "");
      const playerName = String(row?.Player || "").trim();
      const match = rowKey.match(/_player_([A-Za-z0-9_-]+)$/);
      if (!match || !playerName) continue;
      map[match[1]] = playerName;
    }
  }
  return map;
}

function getPerformanceColor(liveStats, seasonStatsPer, threshold) {
 const stat = parseFloat(liveStats);
  const per_game = parseFloat(seasonStatsPer);

  // If data is missing or PPG is 0, don't apply color
  if (isNaN(stat) || isNaN(per_game) || per_game === 0) {
      return undefined;
  }
  
  const diff = (stat - per_game) / per_game;

  if (diff >= threshold) {
      return "rgba(0, 255, 0, 0.2)"; 
  } else if (diff <= -threshold) {
      return "rgba(255, 0, 0, 0.2)"; 
  }
  
  return undefined; 
}

function DataTable({ columns, rows, state, onChange, extraControls = null, getRowStyle }) {
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
                  style={getRowStyle ? getRowStyle(row) : {}}
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
  const [trendsCollapsed, setTrendsCollapsed] = useState(false);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [selectedStoryPlayerId, setSelectedStoryPlayerId] = useState("");
  const [insightsView, setInsightsView] = useState("timeline");
  const [savedCollapsed, setSavedCollapsed] = useState(false);
  const [insightsColumnCollapsed, setInsightsColumnCollapsed] = useState(false);

  const seasonDataPanelRef = useRef();
  const gameDataPanelRef = useRef();
  const trendsPanelRef = useRef();
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
  const [pbpGameOptions, setPbpGameOptions] = useState([]);
  const [pbpTableState, setPbpTableState] = useState({ ...DEFAULT_TABLE_STATE });
  const [pbpAdvancedFiltersDraft, setPbpAdvancedFiltersDraft] = useState({ ...DEFAULT_PBP_ADVANCED_FILTERS });
  const [pbpAppliedFilters, setPbpAppliedFilters] = useState({ ...DEFAULT_PBP_ADVANCED_FILTERS });
  const [pbpAdvancedOpen, setPbpAdvancedOpen] = useState(false);
  const [pbpLoading, setPbpLoading] = useState(false);
  const [pbpUpdating, setPbpUpdating] = useState(false);
  const [pbpError, setPbpError] = useState("");

  const [gameDataSubtab, setGameDataSubtab] = useState("live-stats");
  const [performanceMetric, setPerformanceMetric] = useState("PTS");

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
  const [trendsUpdating, setTrendsUpdating] = useState(false);
  const [trendsError, setTrendsError] = useState("");
  const [trendsUpdatedAt, setTrendsUpdatedAt] = useState("");
  const [trendsTimelines, setTrendsTimelines] = useState({});
  const [trendsPlayerTimelines, setTrendsPlayerTimelines] = useState({});
  const [trendsMessages, setTrendsMessages] = useState([]);
  const [trendsPlayerMessages, setTrendsPlayerMessages] = useState([]);
  const [trendsOverMultiplier, setTrendsOverMultiplier] = useState(1);
  const [trendsUnderMultiplier, setTrendsUnderMultiplier] = useState(1);
  const [trendsCurrentHalf, setTrendsCurrentHalf] = useState("1");
  const [trendsCurrentTimestamp, setTrendsCurrentTimestamp] = useState(10 * 60);
  const [trendsCheckpointLabel, setTrendsCheckpointLabel] = useState("1st Half 10:00");

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
  const sortedPlayers = useMemo(() => {
  return Object.entries(trendsPlayerTimelines).sort(([, a], [, b]) => {
    const aIsUcsb = a.team_id === UCSB_TEAM_ID;
    const bIsUcsb = b.team_id === UCSB_TEAM_ID;

    // Prioritize UCSB players at the top
    if (aIsUcsb && !bIsUcsb) return -1;
    if (!aIsUcsb && bIsUcsb) return 1;

    // Secondary sort: Alphabetical by player name
    return (a.player_name || "").localeCompare(b.player_name || "");
  });
}, [trendsPlayerTimelines]);
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

  const allPlayersList = useMemo(() => {
    const list = [];
    const datasets = [
      { rows: liveStats?.ucsb_players?.rows || [], team_id: UCSB_TEAM_ID },
      { rows: liveStats?.opponent_players?.rows || [], team_id: normalizedOpponentTeamId }
    ];

    for (const { rows, team_id } of datasets) {
      for (const row of rows) {
        const rowKey = String(row?.row_key || "");
        const playerName = String(row?.Player || "").trim();
        const match = rowKey.match(/_player_([A-Za-z0-9_-]+)$/);
        if (!match || !playerName) continue;
        
        list.push({
          id: match[1],
          name: playerName,
          team_id: team_id
        });
      }
    }

    return list.sort((a, b) => {
      const aIsUcsb = a.team_id === UCSB_TEAM_ID;
      const bIsUcsb = b.team_id === UCSB_TEAM_ID;
      if (aIsUcsb && !bIsUcsb) return -1;
      if (!aIsUcsb && bIsUcsb) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [liveStats, normalizedOpponentTeamId]);

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

  const loadPbpIds = useCallback(async () => {
    try {
      const payload = await fetchJson(`${API_BASE}/api/gameids`, {}, 1);
      setPbpGameOptions(
        payload.games.map(g => ({ value: g.id, label: g.label }))
      );
    } catch (error) {
      console.error("Error fetching PBP IDs:", error);
    }
  }, []);

  useEffect(() => {
    loadPbpIds();
  }, [loadPbpIds]);

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

  const updateTrends = useCallback(async () => {
    setTrendsUpdating(true);
    setTrendsError("");
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
      const payload = await fetchJson(`${API_BASE}/api/pbp?game_id=${encodeURIComponent(pbpGameId)}`, {}, 1);
      const opponent = normalizedOpponentTeamId ? `&opponent=${encodeURIComponent(normalizedOpponentTeamId)}` : "";
      const livePayload = await fetchJson(
        `${API_BASE}/api/pbp/live-stats?ucsb=${encodeURIComponent(UCSB_TEAM_ID)}${opponent}&game_id=${encodeURIComponent(pbpGameId)}`,
        {},
        1
      );
      const playerNameById = buildPlayerNameMapFromLiveStats(livePayload);
      const teamTimelines = buildTrendsAnalyticsTimelines(payload.rows || []);
      const playerTimelines = buildTrendsPlayerAnalyticsTimelines(payload.rows || [], playerNameById);
      const checkpoint = deriveTrendsCheckpoint(payload.rows || []);
      setTrendsTimelines(teamTimelines);
      setTrendsPlayerTimelines(playerTimelines);
      setTrendsCurrentHalf(checkpoint.currentHalf);
      setTrendsCurrentTimestamp(checkpoint.currentTimestamp);
      setTrendsCheckpointLabel(checkpoint.label);
      const { messages, playerMessages } = buildTrendsMessages({
        teamTimelines,
        playerTimelines,
        teamNameById,
        overMultiplier: trendsOverMultiplier,
        underMultiplier: trendsUnderMultiplier,
        currentHalf: checkpoint.currentHalf,
        currentTimestamp: checkpoint.currentTimestamp
      });
      setTrendsMessages(messages);
      setTrendsPlayerMessages(playerMessages);
      setTrendsUpdatedAt(payload.updated_at || new Date().toISOString());
    } catch (error) {
      setTrendsError(error.message);
      setTrendsTimelines({});
      setTrendsPlayerTimelines({});
      setTrendsMessages([]);
      setTrendsPlayerMessages([]);
    } finally {
      setTrendsUpdating(false);
    }
  }, [pbpGameId, normalizedOpponentTeamId, teamNameById, trendsOverMultiplier, trendsUnderMultiplier]);

  useEffect(() => {
    const { messages, playerMessages } = buildTrendsMessages({
      teamTimelines: trendsTimelines,
      playerTimelines: trendsPlayerTimelines,
      teamNameById,
      overMultiplier: trendsOverMultiplier,
      underMultiplier: trendsUnderMultiplier,
      currentHalf: trendsCurrentHalf,
      currentTimestamp: trendsCurrentTimestamp
    });
    setTrendsMessages(messages);
    setTrendsPlayerMessages(playerMessages);
  }, [
    trendsTimelines,
    trendsPlayerTimelines,
    teamNameById,
    trendsOverMultiplier,
    trendsUnderMultiplier,
    trendsCurrentHalf,
    trendsCurrentTimestamp
  ]);

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
      setInsightError(formatInsightErrorMessage(error));
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
                    <select value={opponentTeamId} onChange={(e) => setOpponentTeamId(e.target.value)}>
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
                    {pbpGameOptions.map((opt) => (
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
                  <span style={{ marginLeft: "20px", marginRight: "10px" }}>
                    Highlight Performance:
                  </span>
                  <select 
                    value={performanceMetric} 
                    onChange={(e) => setPerformanceMetric(e.target.value)}
                    style={{ padding: "4px", borderRadius: "4px" }}
                  >
                    <option value="PTS">Points (PTS)</option>
                    <option value="REB">Rebounds (REB)</option>
                    <option value="AST">Assists (AST)</option>
                    <option value="PIE">Player Impact(PIE)</option>
                  </select>
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
                  getRowStyle={(row) => {
                    try {
                      const playerName = row["Player"];
                      if (!playerName) return {};
    
                      if (performanceMetric === "PIE") {
                        const pieString = row["PIE"] || "0%";
                        const pieValue = parseFloat(pieString) / 100; 

                        if (pieValue >= 0.12) { 
                          return { backgroundColor: "rgba(0, 255, 0, 0.3)" }; 
                        } else if (pieValue <= 0.05 && pieValue > 0) {
                          return { backgroundColor: "rgba(255, 0, 0, 0.2)" };
                        }
                        else if (pieValue < 0) {
                          return { backgroundColor: "rgba(255, 0, 0, 0.2)" };
                        }
                        return {};
                      }
                      const seasonTeamRows = seasonPlayers[activeLiveSide].rows;
                      const seasonPlayer = seasonTeamRows.find((p) => {
                        const seasonName = p["Player"]; 
                        if (!seasonName) return false;
                        
                        if (seasonName.includes(",")) {
                            const [lastName, firstName] = seasonName.split(",").map(s => s.trim());
                            const flippedName = `${firstName} ${lastName}`; 
                            return flippedName === playerName;
                        }
                        
                        return seasonName === playerName;
                      });

                      const statMapping = {
                        "PTS": "PPG",
                        "REB": "RPG",
                        "AST": "APG"
                      };

                      const seasonStatsKey = statMapping[performanceMetric];

                      if (seasonPlayer && seasonPlayer[seasonStatsKey]) {

                        const liveValue = parseFloat(row[performanceMetric]) || 0;
                        const liveMin = parseFloat(row["MIN"]) || 0; 
                        const seasonAvgValue = parseFloat(seasonPlayer[seasonStatsKey]);

                        const seasonTotalMin = parseFloat(seasonPlayer["MIN"]) || 0;
                        const gpString = seasonPlayer["GP-GS"] || "";
                        const gp = parseFloat(gpString.split("-")[0]) || 0; // Grabs the first number before the dash
                        const seasonMpg = gp > 0 ? seasonTotalMin / gp : 0;                       
                        
                        // check if theyve played
                        if (liveMin > 0 && seasonMpg > 0) {
                          
                          const projectedVal = (liveValue / liveMin) * seasonMpg;
                          
                          let threshold = .25;
                          if (performanceMetric === "REB") {
                            threshold = .35; 
                          } else if (performanceMetric === "AST") {
                            threshold = .35
                          }
                          
                          const color = getPerformanceColor(projectedVal, seasonAvgValue, threshold);
                          
                          if (color) {
                            return { backgroundColor: color };
                          }
                        }
                      }
                    } catch (error) {
                      console.error("Cant change color", error);
                    }
                    
                    return {};
                  }}

                  
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
          ref={trendsPanelRef}
          defaultSize={20}
          minSize={14}
          collapsible
          collapsedSize={4}
          onCollapse={() => setTrendsCollapsed(true)}
          onExpand={() => setTrendsCollapsed(false)}
        >
          <div className="panel trends-panel">
            {trendsCollapsed ? (
              <div className="panel-collapsed" onClick={() => trendsPanelRef.current?.expand()}>
                <span>Trends</span>
              </div>
            ) : (
              <>
                <div className="section-header">
                  <h2>Trends</h2>
                  <span>Teams and players trending now</span>
                  <CollapseButton
                    panelRef={trendsPanelRef}
                    collapsed={trendsCollapsed}
                    onCollapsedChange={setTrendsCollapsed}
                    title="Trends"
                  />
                </div>
                <div className="table-status">
                  <button type="button" onClick={updateTrends} disabled={trendsUpdating}>
                    {trendsUpdating ? "Updating..." : "Update Trends"}
                  </button>
                  {trendsUpdatedAt ? <span> Updated {new Date(trendsUpdatedAt).toLocaleString()}</span> : <span> No trends snapshot yet.</span>}
                  {trendsError ? <span className="error"> {trendsError}</span> : null}
                </div>
                <div className="table-status trends-threshold-controls">
                  <label>
                    Over threshold multiplier
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="0.05"
                      value={trendsOverMultiplier}
                      onChange={(event) => setTrendsOverMultiplier(Number(event.target.value))}
                    />
                    <span>x{trendsOverMultiplier.toFixed(2)}</span>
                  </label>
                  <label>
                    Under threshold multiplier
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={trendsUnderMultiplier}
                      onChange={(event) => setTrendsUnderMultiplier(Number(event.target.value))}
                    />
                    <span>x{trendsUnderMultiplier.toFixed(2)}</span>
                  </label>
                </div>
                <div className="table-status">
                  <span>Checkpoint: {trendsCheckpointLabel}</span>
                </div>
                <div className="table-status">
                  <span>Tracked teams: {Object.keys(trendsTimelines).length}</span>
                </div>
                <div className="table-status">
                  {trendsMessages.length ? <span>Messages: {trendsMessages.length}</span> : <span>No over/under messages at the current checkpoint.</span>}
                </div>
                <div className="table-scroll">
                  {trendsMessages.length ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {trendsMessages.map((message, index) => (
                        <li
                          key={`trend_message_${index}`}
                          style={{
                            backgroundColor: message.tone === "good" ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.18)",
                            border: message.tone === "good" ? "1px solid rgba(34, 197, 94, 0.5)" : "1px solid rgba(239, 68, 68, 0.5)",
                            borderRadius: "0",
                            padding: "8px 10px",
                            marginBottom: "0",
                            fontSize: "12px"
                          }}
                        >
                          {message.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="table-scroll">
                  {trendsPlayerMessages.length ? (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {trendsPlayerMessages.map((message, index) => (
                        <li
                          key={`trend_player_message_${index}`}
                          style={{
                            backgroundColor: message.tone === "good" ? "rgba(34, 197, 94, 0.18)" : "rgba(239, 68, 68, 0.18)",
                            border: message.tone === "good" ? "1px solid rgba(34, 197, 94, 0.5)" : "1px solid rgba(239, 68, 68, 0.5)",
                            borderRadius: "0",
                            padding: "8px 10px",
                            marginBottom: "0",
                            fontSize: "12px"
                          }}
                        >
                          {message.text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span>No individual trends at the current checkpoint.</span>
                  )}
                </div>
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
              <span>Player Performance</span>
            </div>
          ) : (
            <div className="insights-column">
              <div className="insights-column-header">
                {/* These buttons act as your new tabs */}
                <div className="tab-switcher" style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    type="button"
                    className={`leaf ${insightsView === "timeline" ? "active" : ""}`}
                    onClick={() => setInsightsView("timeline")}
                  >
                    Individual Performance
                  </button>
                  <button 
                    type="button"
                    className={`leaf ${insightsView === "pie-overview" ? "active" : ""}`}
                    onClick={() => setInsightsView("pie-overview")}
                  >
                    Overall Impact
                  </button>
                </div>
                <CollapseButton
                  panelRef={insightsColumnRef}
                  collapsed={insightsColumnCollapsed}
                  onCollapsedChange={setInsightsColumnCollapsed}
                  title="Player Performance"
                />
              </div>

              <div className="panel story-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {insightsView === "timeline" ? (
            
                  <>
                    <div style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
                        SELECT PLAYER
                      </label>
                      <select 
                        style={{ width: '100%', padding: '8px' }}
                        value={selectedStoryPlayerId}
                        onChange={(e) => setSelectedStoryPlayerId(e.target.value)}
                      >
                        <option value="">Choose a player...</option>
                        {allPlayersList.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.name} ({resolveTeamName(player.team_id)})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {(() => {
                      
                        const selectedPlayer = allPlayersList.find(p => p.id === selectedStoryPlayerId);
                        
                        return (
                          <PlayerPerformanceStory 
                            playerTimeline={buildCustomPlayerTimeline(
                              pbpData.rows, 
                              selectedStoryPlayerId, 
                              selectedPlayer?.name, 
                              selectedPlayer?.team_id
                            )}
                            teamName={resolveTeamName(selectedPlayer?.team_id)}
                          />
                        );
                      })()}
                    </div>
                  </>
                ) : (
             
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <TeamPieComparison 
                      liveStats={liveStats[`${activeLivePrefix}_players`]} 
                      teamName={activeLiveSide === "ucsb" ? ucsbDisplayName : opponentDisplayName} 
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>
        </PanelGroup>
        </div>
        );
        }
