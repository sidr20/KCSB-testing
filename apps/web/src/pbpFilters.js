export const DEFAULT_PBP_ADVANCED_FILTERS = {
  teamIds: [],
  types: [],
  periods: [],
  clockMode: "",
  clockLastNMinutes: "",
  clockFrom: "",
  clockTo: ""
};

export function normalizeClockInput(value) {
  return String(value || "").trim();
}

export function isValidClockFormat(value) {
  if (!value) {
    return false;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const seconds = Number(match[2]);
  return Number.isFinite(seconds) && seconds >= 0 && seconds < 60;
}

export function clockToSeconds(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
    return null;
  }
  return minutes * 60 + seconds;
}

export function validatePbpAdvancedFilters(filters) {
  if (filters.clockMode === "last_n") {
    const minutes = Number(filters.clockLastNMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return "Last N minutes must be a number greater than 0.";
    }
  }
  if (filters.clockMode === "range") {
    const from = normalizeClockInput(filters.clockFrom);
    const to = normalizeClockInput(filters.clockTo);
    if (!isValidClockFormat(from) || !isValidClockFormat(to)) {
      return "Clock range must use MM:SS format (example: 05:00).";
    }
    const fromSeconds = clockToSeconds(from);
    const toSeconds = clockToSeconds(to);
    if (fromSeconds == null || toSeconds == null) {
      return "Clock range must use valid MM:SS values.";
    }
    if (fromSeconds < toSeconds) {
      return "For time-remaining clocks, From must be greater than or equal to To (example: 05:00 to 02:00).";
    }
  }
  return "";
}

export function canApplyPbpAdvancedFilters(filters) {
  return validatePbpAdvancedFilters(filters) === "";
}

export function buildPbpFilterQuery(filters) {
  const params = new URLSearchParams();
  for (const teamId of filters.teamIds || []) {
    if (teamId) {
      params.append("team_id", teamId);
    }
  }
  for (const typeValue of filters.types || []) {
    if (typeValue) {
      params.append("type", typeValue);
    }
  }
  for (const period of filters.periods || []) {
    if (period) {
      params.append("period", period);
    }
  }
  if (filters.clockMode === "last_n") {
    params.set("clock_mode", "last_n");
    params.set("clock_last_n_minutes", String(filters.clockLastNMinutes).trim());
  } else if (filters.clockMode === "range") {
    params.set("clock_mode", "range");
    params.set("clock_from", normalizeClockInput(filters.clockFrom));
    params.set("clock_to", normalizeClockInput(filters.clockTo));
  }
  return params.toString();
}

export function pbpAdvancedFiltersEqual(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}
