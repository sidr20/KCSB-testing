export function resolveEvidenceTarget(ref, ucsbSlug, opponentSlug) {
  if (!ref || typeof ref !== "object") {
    return null;
  }

  if (ref.dataset === "pbp") {
    return {
      panel: "pbp",
      dataset: "pbp",
      rowKey: String(ref.row_key || ""),
      fields: Array.isArray(ref.fields) ? ref.fields.filter((field) => typeof field === "string") : []
    };
  }

  const teamId = String(ref.team_id || "").toLowerCase();
  const ucsb = String(ucsbSlug || "").toLowerCase();
  const opponent = String(opponentSlug || "").toLowerCase();
  let side = null;

  if (teamId && teamId === ucsb) {
    side = "ucsb";
  } else if (teamId && teamId === opponent) {
    side = "opponent";
  }

  if (!side) {
    return null;
  }

  if (ref.dataset !== "team" && ref.dataset !== "players") {
    return null;
  }

  return {
    panel: "data",
    side,
    dataset: String(ref.dataset),
    rowKey: String(ref.row_key || ""),
    fields: Array.isArray(ref.fields) ? ref.fields.filter((field) => typeof field === "string") : []
  };
}

export function evidenceLabel(ref, displayNameResolver) {
  const displayName = typeof displayNameResolver === "function" ? displayNameResolver(ref.team_id) : ref.team_id;
  const fields = Array.isArray(ref.fields) ? ref.fields.join(", ") : "";
  return `${displayName}/${ref.dataset} -> ${ref.row_key}${fields ? ` (${fields})` : ""}`;
}
