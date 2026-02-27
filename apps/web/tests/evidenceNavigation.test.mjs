import assert from "node:assert/strict";
import { evidenceLabel, resolveEvidenceTarget } from "../src/evidenceNavigation.js";

const UCSB = "ucsb";
const OPPONENT = "ucirvine";

{
  const ref = {
    team_id: UCSB,
    dataset: "players",
    row_key: "player_joe_smith",
    fields: ["player", "pts"]
  };
  const target = resolveEvidenceTarget(ref, UCSB, OPPONENT);
  assert.equal(target.panel, "data");
  assert.equal(target.side, "ucsb");
  assert.equal(target.dataset, "players");
  assert.equal(target.rowKey, "player_joe_smith");
}

{
  const ref = {
    team_id: OPPONENT,
    dataset: "team",
    row_key: "team_row_3",
    fields: ["opp_fg", "opp_fg_per_g"]
  };
  const target = resolveEvidenceTarget(ref, UCSB, OPPONENT);
  assert.equal(target.panel, "data");
  assert.equal(target.side, "opponent");
  assert.equal(
    evidenceLabel(ref, (teamId) => (teamId === OPPONENT ? "UC Irvine" : "Unknown")),
    "UC Irvine/team -> team_row_3 (opp_fg, opp_fg_per_g)"
  );
}

{
  const ref = {
    team_id: "pbp",
    dataset: "pbp",
    row_key: "play_401809115118670338",
    fields: ["clock", "text"]
  };
  const target = resolveEvidenceTarget(ref, UCSB, OPPONENT);
  assert.equal(target.panel, "pbp");
  assert.equal(target.dataset, "pbp");
  assert.equal(target.rowKey, "play_401809115118670338");
}

{
  const bad = resolveEvidenceTarget({ team_id: "unknown", dataset: "team", row_key: "x", fields: [] }, UCSB, OPPONENT);
  assert.equal(bad, null);
}

console.log("evidenceNavigation tests passed");
