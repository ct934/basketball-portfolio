import test from "node:test";
import assert from "node:assert/strict";
import { aggregatePbpPlayers, buildPbpBenchmarks, normalizeZone, updatePbpState } from "../scripts/derive-pbp-stats.mjs";

test("normalizes documented shot ranges without inventing unknown zones", () => {
  assert.equal(normalizeZone("rim"), "atr2");
  assert.equal(normalizeZone("paint"), "paint2");
  assert.equal(normalizeZone("mid-range"), "mid2");
  assert.equal(normalizeZone("above break three"), "atb3");
  assert.equal(normalizeZone("left corner 3"), "c3");
  assert.equal(normalizeZone("three point jumper"), null);
  assert.equal(normalizeZone("unknown"), null);
});

test("derives zone shooting and points created from raw plays", () => {
  const game = { id: 11, startDate: "2026-11-10T00:00:00Z", homeTeam: "Duke", awayTeam: "Kansas" };
  const plays = [
    shot(1, "Player One", "rim", true, 2),
    shot(1, "Player One", "corner 3", true, 3, { id: 2, name: "Player Two" }),
    shot(1, "Player One", "rim", true, 2, { id: 2, name: "Player Two" }),
    shot(2, "Player Two", "paint", false, 0),
    shot(1, "Player One", "mystery", false, 0)
  ];
  const state = updatePbpState(null, { season: 2026, games: [game], playsByGame: { 11: plays }, updatedAt: "2026-11-11T11:00:00Z" });
  const rows = aggregatePbpPlayers(state, [
    { athleteId: 1, name: "Player One", teamId: 10, team: "Duke", position: "C", games: 1, minutes: 30, points: 7, freeThrows: { made: 0 } },
    { athleteId: 2, name: "Player Two", teamId: 10, team: "Duke", position: "G", games: 1, minutes: 20, points: 0, freeThrows: { made: 0 } }
  ]);
  const one = rows.find(row => row.athleteId === 1);
  const two = rows.find(row => row.athleteId === 2);
  assert.deepEqual(one.zones.map(zone => [zone.key, zone.fgm, zone.fga]), [
    ["atr2", 2, 2], ["paint2", 0, 0], ["mid2", 0, 0], ["atb3", 0, 0], ["c3", 1, 1]
  ]);
  assert.equal(one.creation.ptsCreatedG, 7);
  assert.equal(one.creation.uPtsG, 2);
  assert.equal(one.creation.fgmAstdPct, 66.7);
  assert.equal(two.creation.ptsCreatedG, 5);
  assert.equal(two.creation.rimPaintAst40, 2);
  assert.equal(two.details.rim3sAst, 2);
  assert.equal(state.games[11].unclassifiedShots, 1);
  const benchmarks = buildPbpBenchmarks(rows);
  const bigRim = benchmarks.find(row => row.positionGroup === "Big" && row.zone === "atr2");
  assert.equal(bigRim.priorPct, 1);
  assert.equal(bigRim.leagueAttemptShare, 0.666667);
});

function shot(id, name, range, made, scoreValue, assistedBy = null) {
  return {
    teamId: 10, team: "Duke", scoreValue,
    shotInfo: { shooter: { id, name }, range, made, assisted: Boolean(assistedBy), assistedBy }
  };
}
