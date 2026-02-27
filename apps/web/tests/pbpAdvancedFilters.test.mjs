import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPbpFilterQuery,
  canApplyPbpAdvancedFilters,
  DEFAULT_PBP_ADVANCED_FILTERS
} from "../src/pbpFilters.js";

{
  const filters = {
    ...DEFAULT_PBP_ADVANCED_FILTERS,
    clockMode: "last_n",
    clockLastNMinutes: ""
  };
  assert.equal(canApplyPbpAdvancedFilters(filters), false);
}

{
  const filters = {
    ...DEFAULT_PBP_ADVANCED_FILTERS,
    clockMode: "last_n",
    clockLastNMinutes: "2.5"
  };
  assert.equal(canApplyPbpAdvancedFilters(filters), true);
}

{
  const filters = {
    ...DEFAULT_PBP_ADVANCED_FILTERS,
    clockMode: "range",
    clockFrom: "05:00",
    clockTo: "2:00"
  };
  assert.equal(canApplyPbpAdvancedFilters(filters), true);
}

{
  const filters = {
    ...DEFAULT_PBP_ADVANCED_FILTERS,
    clockMode: "range",
    clockFrom: "05:61",
    clockTo: "02:00"
  };
  assert.equal(canApplyPbpAdvancedFilters(filters), false);
}

{
  const query = buildPbpFilterQuery({
    ...DEFAULT_PBP_ADVANCED_FILTERS,
    teamIds: ["UCSB"],
    types: ["Turnover"],
    periods: ["4"],
    clockMode: "range",
    clockFrom: "05:00",
    clockTo: "02:00"
  });
  assert.equal(query.includes("text="), false);
  assert.equal(query.includes("team_id=UCSB"), true);
  assert.equal(query.includes("clock_mode=range"), true);
}

{
  const appSource = readFileSync(resolve("apps/web/src/App.jsx"), "utf8");
  assert.equal(appSource.includes("<details"), true);
  assert.equal(appSource.includes("Advanced filters"), true);
  assert.equal(appSource.includes("placeholder=\"Match text column only\""), false);
  assert.equal(appSource.includes("className=\"compact-multi\""), true);
  assert.equal(appSource.includes("disabled={!pbpCanApply || !pbpFiltersDirty}"), true);
}

console.log("pbpAdvancedFilters tests passed");
