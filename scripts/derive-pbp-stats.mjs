const ZONES = [
  ["atr2", "At rim"],
  ["paint2", "Paint"],
  ["mid2", "Midrange"],
  ["atb3", "Above break 3"],
  ["c3", "Corner 3"]
];

export function summarizeGamePlays(game, plays) {
  const players = {};
  let unclassifiedShots = 0;
  for (const play of plays) {
    const shot = play?.shotInfo;
    const shooter = shot?.shooter;
    if (!shooter?.id || shot?.made === null || shot?.made === undefined) continue;
    const shooterRow = playerRow(players, play, shooter);
    const zone = normalizeZone(shot.range);
    const points = shotPoints(play, zone);
    if (zone) {
      shooterRow.zones[zone].fga += 1;
      if (shot.made) shooterRow.zones[zone].fgm += 1;
    } else unclassifiedShots += 1;
    if (!shot.made) continue;

    shooterRow.fgm += 1;
    shooterRow.fieldGoalPoints += points;
    const isThree = points === 3 || zone === "atb3" || zone === "c3";
    shooterRow[isThree ? "threeMade" : "twoMade"] += 1;
    if (shot.assisted && shot.assistedBy?.id) {
      shooterRow.assistedMade += 1;
      shooterRow[isThree ? "assistedThreeMade" : "assistedTwoMade"] += 1;
      if (zone === "atr2") shooterRow.assistedRimMade += 1;
      const assister = playerRow(players, play, shot.assistedBy);
      assister.assists += 1;
      assister.assistedPointsCreated += points;
      if (zone === "atr2") assister.rimAssists += 1;
      if (zone === "paint2") assister.paintAssists += 1;
      if (zone === "atr2" || zone === "atb3" || zone === "c3") assister.rimThreeAssists += 1;
    } else {
      shooterRow.unassistedMade += 1;
      shooterRow.unassistedFieldGoalPoints += points;
      shooterRow[isThree ? "unassistedThreeMade" : "unassistedTwoMade"] += 1;
      if (zone === "atr2") shooterRow.unassistedRimMade += 1;
    }
  }
  return {
    gameId: Number(game.id), startDate: game.startDate, homeTeam: game.homeTeam, awayTeam: game.awayTeam,
    playCount: plays.length, unclassifiedShots, players
  };
}

export function updatePbpState(previous, { season, games, playsByGame, updatedAt }) {
  const state = previous?.season === season
    ? structuredClone(previous)
    : { schemaVersion: 1, season, games: {} };
  state.updatedAt = updatedAt;
  for (const game of games) {
    const plays = playsByGame[String(game.id)];
    if (plays) state.games[String(game.id)] = summarizeGamePlays(game, plays);
  }
  return state;
}

export function aggregatePbpPlayers(state, playerSeasonStats = []) {
  const totals = {};
  for (const game of Object.values(state?.games || {})) {
    for (const [key, contribution] of Object.entries(game.players || {})) {
      const total = totals[key] ||= { ...emptyPlayer(contribution), gamesProcessed: 0 };
      total.gamesProcessed += 1;
      mergePlayer(total, contribution);
    }
  }
  const seasonByTeamPlayer = new Map(playerSeasonStats.map(row => [`${row.teamId}:${row.athleteId}`, row]));
  const rowsByPlayer = new Map();
  for (const row of playerSeasonStats) {
    const rows = rowsByPlayer.get(String(row.athleteId)) || [];
    rows.push(row);
    rowsByPlayer.set(String(row.athleteId), rows);
  }
  return Object.values(totals).map(total => {
    const exact = seasonByTeamPlayer.get(`${total.teamId}:${total.athleteId}`);
    const uniqueFallback = rowsByPlayer.get(String(total.athleteId))?.length === 1 ? rowsByPlayer.get(String(total.athleteId))[0] : null;
    return finalizePlayer(total, exact || uniqueFallback);
  });
}

export function buildPbpBenchmarks(players) {
  const groups = new Map(["All", "Big", "Guard-Wing"].map(group => [group,
    Object.fromEntries(ZONES.map(([key]) => [key, { made: 0, attempted: 0 }]))]));
  for (const player of players) {
    for (const group of ["All", player.positionGroup].filter(Boolean)) {
      for (const zone of player.zones || []) {
        if (!groups.get(group)?.[zone.key]) continue;
        groups.get(group)[zone.key].made += number(zone.fgm);
        groups.get(group)[zone.key].attempted += number(zone.fga);
      }
    }
  }
  return [...groups.entries()].flatMap(([positionGroup, zones]) => {
    const totalAttempts = Object.values(zones).reduce((sum, zone) => sum + zone.attempted, 0);
    return ZONES.map(([zone, label]) => ({
      positionGroup, zone, label,
      made: zones[zone].made,
      attempted: zones[zone].attempted,
      priorPct: zones[zone].attempted ? round(zones[zone].made / zones[zone].attempted, 6) : null,
      leagueAttemptShare: totalAttempts ? round(zones[zone].attempted / totalAttempts, 6) : null
    }));
  });
}

function emptyPlayer(identity = {}) {
  return {
    athleteId: Number(identity.athleteId), name: identity.name || "", teamId: Number(identity.teamId), team: identity.team || "",
    zones: Object.fromEntries(ZONES.map(([key]) => [key, { fgm: 0, fga: 0 }])),
    fgm: 0, twoMade: 0, threeMade: 0, assistedMade: 0, assistedTwoMade: 0, assistedThreeMade: 0,
    unassistedMade: 0, unassistedTwoMade: 0, unassistedThreeMade: 0, assistedRimMade: 0,
    unassistedRimMade: 0, fieldGoalPoints: 0, unassistedFieldGoalPoints: 0, assists: 0,
    assistedPointsCreated: 0, rimAssists: 0, paintAssists: 0, rimThreeAssists: 0
  };
}

function playerRow(players, play, participant) {
  const key = `${play.teamId ?? "unknown"}:${participant.id}`;
  return players[key] ||= emptyPlayer({ athleteId: participant.id, name: participant.name, teamId: play.teamId, team: play.team });
}

function mergePlayer(total, row) {
  for (const [zone] of ZONES) {
    total.zones[zone].fgm += number(row.zones?.[zone]?.fgm);
    total.zones[zone].fga += number(row.zones?.[zone]?.fga);
  }
  for (const key of [
    "fgm", "twoMade", "threeMade", "assistedMade", "assistedTwoMade", "assistedThreeMade", "unassistedMade",
    "unassistedTwoMade", "unassistedThreeMade", "assistedRimMade", "unassistedRimMade", "fieldGoalPoints",
    "unassistedFieldGoalPoints", "assists", "assistedPointsCreated", "rimAssists", "paintAssists", "rimThreeAssists"
  ]) total[key] += number(row[key]);
}

function finalizePlayer(total, seasonRow) {
  const games = positive(seasonRow?.games);
  const minutes = positive(seasonRow?.minutes);
  const freeThrowsMade = number(seasonRow?.freeThrows?.made);
  const points = number(seasonRow?.points) || total.fieldGoalPoints + freeThrowsMade;
  const perGame = value => games ? round(value / games, 3) : null;
  const per40 = value => minutes ? round(value / minutes * 40, 3) : null;
  const pct = (made, attempted) => attempted ? round(made / attempted * 100, 1) : null;
  return {
    athleteId: total.athleteId, name: seasonRow?.name || total.name, teamId: seasonRow?.teamId || total.teamId,
    team: seasonRow?.team || total.team, position: seasonRow?.position || null,
    positionGroup: positionGroup(seasonRow?.position), gp: games, mins: minutes,
    coverage: {
      gamesProcessed: total.gamesProcessed,
      trackedFga: Object.values(total.zones).reduce((sum, zone) => sum + zone.fga, 0),
      note: "Only API plays with a classified shotInfo.range are included in zone totals."
    },
    zones: ZONES.map(([key, label]) => ({ key, label, fgm: total.zones[key].fgm, fga: total.zones[key].fga,
      fgaG: perGame(total.zones[key].fga), fgPct: pct(total.zones[key].fgm, total.zones[key].fga) })),
    creation: {
      ptsCreatedG: perGame(points + total.assistedPointsCreated),
      uPtsG: perGame(total.unassistedFieldGoalPoints + freeThrowsMade),
      fgmAstdPct: pct(total.assistedMade, total.fgm),
      rimPaintAst40: per40(total.rimAssists + total.paintAssists)
    },
    details: {
      atr2Ast: total.rimAssists, paint2Ast: total.paintAssists, lane2Ast: total.rimAssists + total.paintAssists,
      atr2AstP40: per40(total.rimAssists), paint2AstP40: per40(total.paintAssists),
      rimPaintAst40: per40(total.rimAssists + total.paintAssists), rim3sAst: total.rimThreeAssists,
      rim3sAst40: per40(total.rimThreeAssists), ptsCreatedG: perGame(points + total.assistedPointsCreated),
      uPtsG: perGame(total.unassistedFieldGoalPoints + freeThrowsMade), uFgmG: perGame(total.unassistedMade),
      aFgmG: perGame(total.assistedMade), u2pmG: perGame(total.unassistedTwoMade), a2pmG: perGame(total.assistedTwoMade),
      u3pmG: perGame(total.unassistedThreeMade), a3pmG: perGame(total.assistedThreeMade),
      fgmAstdPct: pct(total.assistedMade, total.fgm), fgm3AstdPct: pct(total.assistedThreeMade, total.threeMade),
      fgm2AstdPct: pct(total.assistedTwoMade, total.twoMade), atr2AfgmG: perGame(total.assistedRimMade),
      atr2UfgmG: perGame(total.unassistedRimMade),
      atr2AstdPct: pct(total.assistedRimMade, total.assistedRimMade + total.unassistedRimMade)
    }
  };
}

function positionGroup(position) {
  const value = String(position || "").trim().toLowerCase();
  if (!value) return null;
  return /(^|[-/ ])(c|center)([-/ ]|$)/.test(value) ? "Big" : "Guard-Wing";
}

export function normalizeZone(range) {
  const value = String(range || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (!value) return null;
  if (/\b(rim|dunk|layup|tip in|at rim)\b/.test(value)) return "atr2";
  if (/\bcorner\b/.test(value) && /\b(3|three)\b/.test(value)) return "c3";
  if (/\b(above break|above the break|atb)\b/.test(value)) return "atb3";
  // A generic three-pointer cannot be separated into corner vs above-break
  // without a documented coordinate transform, so keep it unclassified.
  if (/\b(mid|midrange|mid range|long two|long 2)\b/.test(value)) return "mid2";
  if (/\b(paint|lane|hook)\b/.test(value)) return "paint2";
  return null;
}

function shotPoints(play, zone) {
  const explicit = Number(play?.scoreValue);
  if (explicit === 2 || explicit === 3) return explicit;
  return zone === "atb3" || zone === "c3" ? 3 : 2;
}

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function positive(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; }
function round(value, digits) { const scale = 10 ** digits; return Math.round((value + Number.EPSILON) * scale) / scale; }
