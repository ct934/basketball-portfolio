import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCbbdClient } from "./cbbd-client.mjs";
import { aggregatePbpPlayers, buildPbpBenchmarks, updatePbpState } from "./derive-pbp-stats.mjs";

const PIPELINE_VERSION = "2026-09-28-v2";
const TIME_ZONE = "America/New_York";
const ENDPOINTS = [
  ["teams", "/teams", "season"],
  ["rosters", "/teams/roster", "season"],
  ["games", "/games", "window"],
  ["teamGameStats", "/games/teams", "recent"],
  ["playerGameStats", "/games/players", "recent"],
  ["teamSeasonStats", "/stats/team/season", "season"],
  ["playerSeasonStats", "/stats/player/season", "season"],
  ["teamShootingStats", "/stats/team/shooting/season", "shooting"],
  ["playerShootingStats", "/stats/player/shooting/season", "shooting"],
  ["adjustedRatings", "/ratings/adjusted", "season"],
  ["eloRatings", "/ratings/elo", "season"]
];
const SNAPSHOT_KEYS = [...ENDPOINTS.map(([key]) => key), "playByPlay", "pbpPlayerStats", "pbpBenchmarks"];

export async function runDailyUpdate(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.valueOf())) throw new Error(`Invalid --now value: ${options.now}`);
  const season = Number(options.season ?? defaultSeason(now));
  if (!Number.isInteger(season) || season < 2000 || season > 2200) throw new Error(`Invalid season: ${options.season}`);

  const localDate = dateInTimeZone(now, TIME_ZONE);
  const recentStartDate = shiftDate(localDate, -2);
  const upcomingEndDate = shiftDate(localDate, 8);
  const recentStart = zonedDateTimeToIso(recentStartDate, 0, TIME_ZONE);
  const todayStart = zonedDateTimeToIso(localDate, 0, TIME_ZONE);
  const upcomingEnd = zonedDateTimeToIso(upcomingEndDate, 0, TIME_ZONE);
  const client = options.client || createCbbdClient();
  const payload = {};

  for (const [key, endpoint, queryType] of ENDPOINTS) {
    if (queryType === "shooting") {
      payload[key] = await fetchShootingStats(client, endpoint, season, payload.teams || []);
      process.stdout.write(`${key}: ${payload[key].length.toLocaleString()} rows\n`);
      continue;
    }
    const query = queryType === "window"
      ? { season, startDateRange: recentStart, endDateRange: upcomingEnd }
      : queryType === "recent"
        ? { season, startDateRange: recentStart, endDateRange: todayStart }
        : { season };
    payload[key] = await client.get(endpoint, query);
    process.stdout.write(`${key}: ${payload[key].length.toLocaleString()} rows\n`);
  }

  const completedGames = payload.games.filter(game => String(game.status).toLowerCase() === "final");
  const playsByGame = await fetchGamePlays(client, completedGames);
  payload.playByPlay = Object.values(playsByGame).flat();
  const previousPbpState = options.pbpState ?? readPbpState(options.outputRoot);
  const pbpState = updatePbpState(previousPbpState, {
    season,
    games: completedGames,
    playsByGame,
    updatedAt: now.toISOString()
  });
  payload.pbpPlayerStats = aggregatePbpPlayers(pbpState, payload.playerSeasonStats);
  payload.pbpBenchmarks = buildPbpBenchmarks(payload.pbpPlayerStats);
  process.stdout.write(`playByPlay: ${payload.playByPlay.length.toLocaleString()} recent plays\n`);
  process.stdout.write(`pbpPlayerStats: ${payload.pbpPlayerStats.length.toLocaleString()} season player rows\n`);
  process.stdout.write(`pbpBenchmarks: ${payload.pbpBenchmarks.length.toLocaleString()} position-zone rows\n`);

  const validation = validatePayload(payload, { season, now, recentStart, upcomingEnd });
  const output = {
    meta: {
      source: "CollegeBasketballData API",
      sourceBaseUrl: "https://api.collegebasketballdata.com",
      pipelineVersion: PIPELINE_VERSION,
      schemaVersion: 1,
      modelVersion: null,
      featureVersion: null,
      season,
      seasonLabel: `${season}-${String((season + 1) % 100).padStart(2, "0")}`,
      dataAsOf: now.toISOString(),
      featureCutoff: now.toISOString(),
      timeZone: TIME_ZONE,
      recentStart,
      upcomingEnd,
      counts: Object.fromEntries(Object.entries(payload).map(([key, rows]) => [key, rows.length])),
      validation
    },
    ...payload
  };

  if (!options.dryRun) writeOutputs(output, pbpState, { now, localDate, outputRoot: options.outputRoot });
  return output;
}

async function fetchGamePlays(client, games, concurrency = 4) {
  const result = {};
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < games.length) {
      const game = games[nextIndex++];
      const plays = await client.get(`/plays/game/${game.id}`);
      result[String(game.id)] = plays;
      process.stdout.write(`plays ${game.id}: ${plays.length.toLocaleString()} rows\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, games.length) }, worker));
  return result;
}

async function fetchShootingStats(client, endpoint, season, teams) {
  try {
    return await client.get(endpoint, { season });
  } catch (error) {
    if (error?.status !== 400) throw error;
    const conferences = [...new Set(teams.map(team => team.conference).filter(Boolean))].sort();
    if (!conferences.length) throw error;
    process.stdout.write(`${endpoint}: season-wide query unavailable; fetching ${conferences.length} conferences\n`);
    const rows = [];
    for (const conference of conferences) {
      rows.push(...await client.get(endpoint, { season, conference }));
    }
    return rows;
  }
}

function validatePayload(payload, context) {
  const errors = [];
  const warnings = [];
  for (const key of SNAPSHOT_KEYS) {
    if (!Array.isArray(payload[key])) errors.push(`${key} is not an array`);
  }
  const gameIds = new Set();
  for (const game of payload.games || []) {
    if (!Number.isFinite(Number(game.id))) errors.push("A game is missing a numeric id");
    if (gameIds.has(game.id)) errors.push(`Duplicate game id ${game.id}`);
    gameIds.add(game.id);
    if (!game.homeTeam || !game.awayTeam || !game.startDate) errors.push(`Game ${game.id ?? "unknown"} is missing a team or start date`);
  }
  for (const row of payload.playerSeasonStats || []) {
    if (!row.name || !row.team || !Number.isFinite(Number(row.athleteId))) errors.push("A player season row is missing player identity");
  }
  if (!(payload.games || []).length) warnings.push("No recent or upcoming games were returned; this is normal outside the season.");
  if (!(payload.playerSeasonStats || []).length) warnings.push("No player season statistics were returned; the season may not have started.");
  if (errors.length) throw new Error(`CBBD validation failed:\n- ${errors.slice(0, 20).join("\n- ")}`);
  return {
    status: warnings.length ? "passed_with_warnings" : "passed",
    checkedAt: context.now.toISOString(),
    errors,
    warnings
  };
}

function writeOutputs(output, pbpState, { now, localDate, outputRoot }) {
  const root = resolveRoot(outputRoot);
  const runId = now.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  const snapshotDir = path.join(root, "data/cbbd/raw", localDate, runId);
  fs.mkdirSync(snapshotDir, { recursive: true });
  for (const key of SNAPSHOT_KEYS) atomicJson(path.join(snapshotDir, `${key}.json`), output[key]);
  atomicJson(path.join(snapshotDir, "manifest.json"), output.meta);
  atomicJson(path.join(root, "data/cbbd/latest.json"), { snapshotDir: path.relative(root, snapshotDir), ...output.meta });
  atomicJson(path.join(root, "data/cbbd/pbp-state.json"), pbpState);
  atomicJson(path.join(root, "public/cbb-hub/data/cbbd-current.json"), output);
}

function readPbpState(outputRoot) {
  const target = path.join(resolveRoot(outputRoot), "data/cbbd/pbp-state.json");
  if (!fs.existsSync(target)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`Could not read PBP state at ${target}: ${error.message}`);
  }
}

function resolveRoot(outputRoot) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return outputRoot ? path.resolve(outputRoot) : projectRoot;
}

function atomicJson(target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`);
  fs.renameSync(temporary, target);
}

function defaultSeason(date) {
  const { year, month } = partsInTimeZone(date, TIME_ZONE);
  return month >= 7 ? year : year - 1;
}

function dateInTimeZone(date, timeZone) {
  const { year, month, day } = partsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function partsInTimeZone(date, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  return values;
}

function shiftDate(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function zonedDateTimeToIso(dateString, hour, timeZone) {
  const [year, month, day] = dateString.split("-").map(Number);
  const wanted = Date.UTC(year, month - 1, day, hour);
  let guess = wanted;
  for (let pass = 0; pass < 4; pass += 1) {
    const actual = partsInTimeZone(new Date(guess), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += wanted - represented;
  }
  return new Date(guess).toISOString();
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--season") options.season = argv[++index];
    else if (argument === "--now") options.now = argv[++index];
    else if (argument === "--output-root") options.outputRoot = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDailyUpdate(parseArgs(process.argv.slice(2))).catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
