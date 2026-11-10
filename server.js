import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { MAX_SPRITE, CELL, STAGE_WIDTH, normalizeItem } from "./shared/canvas.js";
import { randomCreature } from "./shanhaijing.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = 3133;
const MODEL = "claude-sonnet-5-5";
const DEFAULT_TURN_INTERVAL_MS = 15_000;
const MIN_TURN_INTERVAL_MS = 3_000;
const MAX_TURN_INTERVAL_MS = 600_000;
let turnIntervalMs = DEFAULT_TURN_INTERVAL_MS; // the display sets this via ?speed=
const RECENT_KEEP = 300; // turns kept in memory for the API
const DB_KEEP_TURNS = 2000; // older turns are pruned from SQLite unless the saved pile still references them
const PRUNE_EVERY_MS = 60 * 60_000;
const CONTEXT_FOR_MODEL = 40; // recent items described to the model
const TIME_ZONE = "America/New_York";
const DISPLAY_KEY = process.env.DISPLAY_KEY || "";
const DISPLAY_IDLE_MS = 30_000;

// Inspiration sources. The display can restrict these with ?types=a,b.
const SOURCE_TYPES = {
  sky: "the real NYC sky color",
  weather: "the weather",
  plants: "what is blooming",
  holidays: "today's weird holiday",
  events: "a historical event from this date",
  market: "the subject of a prediction market",
  creature: "a creature from the Classic of Mountains and Seas",
};
const ALL_TYPES = Object.keys(SOURCE_TYPES);
let activeTypes = ALL_TYPES.slice();
function setActiveTypes(spec) {
  if (spec === undefined) return;
  const wanted = String(spec)
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => ALL_TYPES.includes(t));
  const next = wanted.length ? wanted : ALL_TYPES.slice();
  if (next.join() === activeTypes.join()) return;
  activeTypes = next;
  console.log(`Inspiration types set to: ${activeTypes.join(", ")}`);
}
const typeOn = (t) => activeTypes.includes(t); // pause generation this long after the last visible display was heard from
if (!DISPLAY_KEY) console.warn("DISPLAY_KEY is not set; every display request will be refused");

const anthropic = new Anthropic({ timeout: 90_000, maxRetries: 1 });
const app = express();

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const db = new Database(join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    item TEXT NOT NULL,
    context TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const getMeta = (key) => {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : null;
};
const setMeta = (key, value) => {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, JSON.stringify(value));
};

// Lifetime count lives in meta so pruning old rows doesn't reset it.
let totalItems = getMeta("totalItems") ?? db.prepare("SELECT COUNT(*) AS n FROM turns").get().n;

// Only id, time and item are kept in memory; the context each turn saw stays in SQLite.
let recent = db
  .prepare("SELECT id, created_at, item FROM turns ORDER BY id DESC LIMIT ?")
  .all(RECENT_KEEP)
  .reverse()
  .map((row) => ({ id: row.id, createdAt: row.created_at, item: JSON.parse(row.item) }));

// The display saves the physics state of the pile here so a reload can
// restore it instead of re-dropping everything.
let snapshot = getMeta("snapshot");

// Identifies this database. If it changes (data reset), displays reload.
let epoch = getMeta("epoch");
if (!epoch) {
  epoch = Math.random().toString(36).slice(2, 10);
  setMeta("epoch", epoch);
}

function saveTurn(item, context) {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare("INSERT INTO turns (created_at, item, context) VALUES (?, ?, ?)")
    .run(createdAt, JSON.stringify(item), JSON.stringify(context));
  const turn = { id: Number(result.lastInsertRowid), createdAt, item };
  recent.push(turn);
  if (recent.length > RECENT_KEEP) recent.splice(0, recent.length - RECENT_KEEP);
  totalItems += 1;
  setMeta("totalItems", totalItems);
  return turn;
}

// Drop old rows the display can never need again: anything older than the
// last DB_KEEP_TURNS that the saved pile doesn't reference.
function pruneDb() {
  const latest = recent.length ? recent[recent.length - 1].id : 0;
  const cutoff = latest - DB_KEEP_TURNS;
  if (cutoff <= 0) return;
  const keep = new Set((snapshot?.bodies || []).map((b) => b.turnId));
  const candidates = db.prepare("SELECT id FROM turns WHERE id < ?").all(cutoff).map((r) => r.id);
  const doomed = candidates.filter((id) => !keep.has(id));
  if (doomed.length === 0) return;
  const del = db.prepare("DELETE FROM turns WHERE id = ?");
  db.transaction(() => doomed.forEach((id) => del.run(id)))();
  db.pragma("wal_checkpoint(TRUNCATE)");
  console.log(`Pruned ${doomed.length} old turns from the database`);
}
setInterval(pruneDb, PRUNE_EVERY_MS).unref();

// ---------------------------------------------------------------------------
// Context sources
// ---------------------------------------------------------------------------

const cache = new Map();

async function fetchJson(url, ttlMs) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const value = await res.json();
    cache.set(url, { at: Date.now(), value });
    return value;
  } catch (err) {
    console.warn(`Context fetch failed for ${url}: ${err.message}`);
    return hit ? hit.value : null; // stale is better than nothing
  }
}

const MIN = 60_000;

async function gatherContext() {
  const [sky, plants, holidays, events, weather, market] = await Promise.all([
    fetchJson("https://nyc-sky-colors.fcc.lol/api", 5 * MIN),
    fetchJson("https://today-api.fcc.lol/blooming-plants", 60 * MIN),
    fetchJson("https://today-api.fcc.lol/weird-holidays", 60 * MIN),
    fetchJson("https://today-api.fcc.lol/historical-events", 60 * MIN),
    fetchJson("https://labs.noshado.ws/weather-theme-key/?location=11249", 10 * MIN),
    // Returns a different random market on every call, so never cache it.
    fetchJson("https://prediction-markets-research-api.noshado.ws/random", 0),
  ]);

  const time = new Date().toLocaleString("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return {
    time,
    skyColors: sky?.colors || null,
    plants: (plants?.plants || []).slice(0, 6).map((p) => ({
      name: p.commonName || p.name,
      colors: p.colors,
      note: p.funFact || p.description,
    })),
    holidays: (holidays?.holidays || []).slice(0, 6).map((h) => ({
      name: h.name,
      note: h.description,
    })),
    events: (events?.events || []).slice(0, 6).map((e) => ({
      year: e.year,
      title: e.title,
    })),
    weather: weather
      ? {
          condition: weather.condition,
          period: weather.currentPeriod,
          theme: weather.themeCode,
          location: weather.location?.name,
        }
      : null,
    creature: randomCreature(),
    market:
      market && market.question
        ? {
            question: market.question,
            prediction: market.prediction,
            probability: typeof market.probability === "number" ? market.probability : null,
            volume: market.volume,
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const ItemSchema = z.object({
  source: z
    .enum(ALL_TYPES)
    .describe("Which inspiration source this thing comes from."),
  name: z.string().describe("Short name for the thing you are adding, 1-4 words."),
  note: z
    .string()
    .describe(
      "A short caption shown on screen, at most 12 words. Start directly with the thing itself, never with 'A', 'An' or 'The', and vary the sentence shape from turn to turn. Then give the specific reason it belongs to this moment (the holiday, the historical event, the bloom, the weather, the hour, or the news topic behind the prediction market, without ever mentioning markets, odds, chances or percentages). Examples: 'Hot air balloon for Balloon Ascension Day, 1783', 'Husky pup, because Alaska votes for Senate soon', 'Chrysanthemums are blooming tonight across Brooklyn'. No trailing period. Also shown to you on later turns.",
    ),
  background: z
    .string()
    .describe(
      "Hex color for the whole screen behind the heap, fitting this moment and this thing. It must be a clearly visible color, not near-black: brightness roughly 25% to 50%, moderate saturation, so white text still reads. Range across the whole wheel over time (dusty rose, ochre, moss, teal, plum, rust, slate, sand, lavender, sea green) and make it noticeably different from the recent backgrounds listed. Only go to deep blue-black for an explicitly nocturnal subject, and not two turns in a row.",
    ),
  palette: z
    .array(
      z.object({
        char: z.string().describe("A single character used in rows."),
        color: z.string().describe("Hex color like #ff8800."),
      }),
    )
    .describe("Characters used in rows mapped to colors. '.' is always transparent."),
  rows: z
    .array(z.string())
    .describe(
      `The sprite, top to bottom. Each string is one row of cells; each character is one cell. All rows the same length. Use '.' for transparent. Longer side anywhere from 16 to ${MAX_SPRITE} cells; vary it deliberately from turn to turn.`,
    ),
});

const buildSystemPrompt = () => `You are the Infinite Pixel Machine: a pixel artist feeding an endless machine on a tall portrait screen.

How the machine works: each thing you draw becomes a solid physical object. It drops in from the top of the screen, tumbles down with real gravity, and lands on the growing heap of everything drawn before it. The heap never stops growing; the camera slowly drifts upward to keep the top of the heap in view, and older things sink out of sight below. The screen is 768 pixels wide; each cell of your sprite is a ${CELL}px pixel, so a 60-cell-wide sprite is about 40% of the screen width.

Every turn you receive the current time in Brooklyn, New York, live context about the day (sky color, weather, plants in bloom, weird holidays, historical events, one random prediction market with its current odds, and one creature from the Classic of Mountains and Seas, the ancient Chinese bestiary), and a list of what has recently landed on the heap. Your job each turn: add exactly ONE new thing, drawn as detailed pixel art, and choose a background color for the screen that the whole scene slowly fades to.

What to draw:
- One thing per turn: a single object, creature, plant, food, symbol, word, building, vehicle, tool, or curious artifact. Not a scene.
- Draw things that respond to the moment, choosing from these sources: the time of day, ${activeTypes.map((t) => SOURCE_TYPES[t]).join(", ")}. Set "source" to the one you used. When you choose the creature, draw it faithfully to its description (the right number of heads, legs, wings, tails and eyes, its colors and markings) but as a cute, chubby game sprite, and name it in the caption with its Chinese name, e.g. "Bifang 毕方, the one-legged fire crane of the Mountains and Seas". For the market, draw the subject itself: the place, person, team, company, product, animal, event or object the question is about, rendered as a cute sprite (a landmark of the country, a rocket for a launch, a ballot box for an election, a mascot, a trophy). The odds are background flavor at most; do not draw gauges, dials, coins or symbols of probability. The caption must never mention the market, odds, chances, bets, trading or percentages: write about the subject as if it were simply in the news (for example "Husky pup, because Alaska votes for Senate soon"). Vary which source you draw from; do not always pick the same one. Over time the mix should be roughly even across the sources, with the Shanhaijing creature showing up about one turn in five, so if the recent list leans on one source, pick a different one now.
- Think about the heap. Vary size, weight and shape so the pile stays interesting: a heavy block one turn, something small and round the next, something long the next. Avoid repeating the names or ideas of recent additions.
- Use the actual sky color from the context when painting sky-lit surfaces or glowing things.

How to draw (this matters most):
- Style: cute, polished video-game pixel art, the kind of item and creature sprite you would find in a cozy 16-bit RPG, farming sim or life sim: charming, chunky, friendly, instantly readable. Think collectible items, little critters, food and furniture from a beloved game, not realism and not flat emoji.
- Shapes: rounded and simplified with slightly exaggerated, toy-like proportions. Big heads and bodies, short limbs, plump fruit, squat buildings with oversized doors and windows. Keep every form soft and bouncy; avoid thin spindly parts.
- Outlines: a clean 1-cell outline all the way around the silhouette in a dark, slightly colored tone (deep plum, navy or chocolate rather than pure black). Use thinner internal outlines only where they help readability.
- Color: bright, warm, saturated and cheerful. 10 to 20 colors. Build each material from a ramp of 3 to 5 tones: a midtone, one or two shadows (cooler, a bit more saturated) and one or two highlights (warmer, lighter). Pick palettes that feel like candy, plush toys and picture books.
- Shading: light from the upper left, soft and simple. One clear shadow side, one clear lit side, a crisp specular highlight dot or two on anything round or shiny, and a little rim light on the shadow edge. Use light dithering sparingly for texture (wood, fabric, fur, grass); never muddy.
- Charm details: little sparkles, a blush, a shine, a tiny face with dot eyes and a small smile when it suits the subject (a cloud, a fruit, a planet, a sprout), a ribbon or button, a leaf on top. One or two of these per sprite, not all of them.
- Detail density: pack the sprite with intentional detail at every size, but keep it clean: every pixel cluster should read as something (a petal, a window pane, a stitch, a freckle), not noise.
- Vary the size deliberately so the heap has rhythm: some turns a small thing of 16 to 28 cells, most turns 36 to 60, and now and then something grand at 72 to ${MAX_SPRITE}. Look at the sizes of the recent things and choose a contrast.
- Because it becomes a physical object, give it one solid connected shape with a clean silhouette. No separate floating pieces (sparkles must touch the body), no cast shadow or ground under it, no thin one-cell strands sticking far out.
- Every row string must have the same length (the sprite's width). Use '.' for transparent cells. Every non-'.' character you use must appear in palette with a hex color; use single letters, digits and punctuation as characters (never '.').`;

function describeHeap() {
  const lines = [];
  lines.push(`Things dropped into the machine so far: ${totalItems}.`);
  if (recent.length === 0) {
    lines.push("The heap is empty. Yours will be the very first thing to land.");
  } else {
    const shown = recent.slice(-CONTEXT_FOR_MODEL);
    lines.push(`The most recent ${shown.length}, oldest first (the last ones are on top of the heap):`);
    for (const t of shown) {
      lines.push(`- #${t.id} "${t.item.name}" (${t.item.w}x${t.item.h} cells): ${t.item.note}`);
    }
    const recentBgs = recent
      .slice(-6)
      .map((t) => t.item.background)
      .filter(Boolean);
    if (recentBgs.length) {
      lines.push("");
      lines.push(`Recent background colors, oldest first (pick something noticeably different): ${recentBgs.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function describeContext(ctx) {
  const parts = [];
  parts.push(`Current time: ${ctx.time}`);
  if (ctx.weather && typeOn("weather")) {
    parts.push(
      `Weather in ${ctx.weather.location || "Brooklyn"}: ${ctx.weather.condition}, ${ctx.weather.period} (theme: ${ctx.weather.theme})`,
    );
  }
  if (ctx.skyColors && typeOn("sky")) {
    parts.push(
      `Actual NYC sky colors right now: ${Object.entries(ctx.skyColors)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}`,
    );
  }
  if (ctx.plants?.length && typeOn("plants")) {
    parts.push(
      `Blooming now: ${ctx.plants.map((p) => `${p.name} (${(p.colors || []).join("/")})`).join("; ")}`,
    );
  }
  if (ctx.holidays?.length && typeOn("holidays")) {
    parts.push(`Today's weird holidays: ${ctx.holidays.map((h) => `${h.name} - ${h.note}`).join(" | ")}`);
  }
  if (ctx.events?.length && typeOn("events")) {
    parts.push(`On this day in history: ${ctx.events.map((e) => `${e.year}: ${e.title}`).join(" | ")}`);
  }
  if (ctx.creature && typeOn("creature")) {
    parts.push(
      `A creature from the Classic of Mountains and Seas (山海经): ${ctx.creature.name} (${ctx.creature.chinese}), ${ctx.creature.about}.`,
    );
  }
  if (ctx.market && typeOn("market")) {
    const pct = ctx.market.probability === null ? "unknown" : `${Math.round(ctx.market.probability * 100)}%`;
    parts.push(
      `A topic people are currently speculating about: "${ctx.market.question}" (possible outcome: "${ctx.market.prediction}", currently ${pct}). Treat the subject as inspiration, not the number, and never mention markets, odds or percentages in the caption.`,
    );
  }
  return parts.join("\n");
}

async function askForNextItem(ctx) {
  const userMessage = [
    "CONTEXT",
    describeContext(ctx),
    "",
    "THE HEAP",
    describeHeap(),
    "",
    "Draw exactly one new cute, game-ready thing to drop into the machine now, as detailed as its size allows.",
  ].join("\n");

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 12000,
    // No extended thinking: the sprite itself is the output, and thinking
    // pushes turns past the 15s cadence. On Sonnet 5.5 "between_tools" is
    // the way to turn thinking off (and "disabled" is rejected).
    thinking: { type: "between_tools" },
    output_config: { effort: "low", format: zodOutputFormat(ItemSchema) },
    // The system prompt never changes between turns, so cache it.
    system: [{ type: "text", text: buildSystemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model refused: ${response.stop_details?.explanation || "no explanation"}`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Model hit max_tokens");
  }
  if (!response.parsed_output) {
    throw new Error("Model output did not match schema");
  }
  return { raw: response.parsed_output, usage: response.usage };
}

// ---------------------------------------------------------------------------
// Generation loop
// ---------------------------------------------------------------------------

let lastError = null;
let lastTurnAt = null;
let inFlight = 0;
const MAX_IN_FLIGHT = 3; // detailed sprites can take longer than one interval, so overlap turns

async function runTurn() {
  inFlight += 1;
  const started = Date.now();
  try {
    const ctx = await gatherContext();
    const { raw, usage } = await askForNextItem(ctx);
    const item = normalizeItem(raw);
    if (!item) {
      const rowsPreview = Array.isArray(raw.rows) ? raw.rows.slice(0, 3).join(" / ") : String(raw.rows);
      throw new Error(
        `Model returned an undrawable sprite: palette=${JSON.stringify(raw.palette).slice(0, 200)} rows=${rowsPreview.slice(0, 200)}`,
      );
    }
    const turn = saveTurn(item, ctx);
    lastError = null;
    lastTurnAt = turn.createdAt;
    console.log(
      `#${turn.id} "${item.name}" (${item.source}) ${item.w}x${item.h} [in ${usage.input_tokens} cached ${usage.cache_read_input_tokens || 0} out ${usage.output_tokens}, ${((Date.now() - started) / 1000).toFixed(1)}s, ${inFlight} in flight]`,
    );
  } catch (err) {
    lastError = { at: new Date().toISOString(), message: err.message };
    console.error(`Turn failed: ${err.message}`);
  } finally {
    inFlight -= 1;
  }
}

// Generation only runs while a visible display is polling. Displays send
// active=1 with their requests while their tab is visible.
let lastDisplaySeen = 0;
let paused = true;
const displayActive = () => Date.now() - lastDisplaySeen < DISPLAY_IDLE_MS;

function noteDisplayActive() {
  lastDisplaySeen = Date.now();
  if (paused) {
    paused = false;
    console.log("Display is active; resuming generation");
    tick(); // don't make a returning display wait a whole interval
  }
}

// Start a turn every turnIntervalMs while a display is active. Turns may
// overlap (each one only needs the heap as it was when it started), bounded
// by MAX_IN_FLIGHT.
let loopTimer = null;
function tick() {
  if (!displayActive()) {
    if (!paused) {
      paused = true;
      console.log("No active display; pausing generation");
    }
    return;
  }
  if (inFlight < MAX_IN_FLIGHT) runTurn();
  else console.warn(`Skipping a turn: ${inFlight} already in flight`);
}
function loop() {
  tick();
  loopTimer = setInterval(tick, turnIntervalMs);
}

// The display passes its drop speed (seconds) so generation keeps pace.
function setTurnInterval(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return;
  const ms = Math.min(MAX_TURN_INTERVAL_MS, Math.max(MIN_TURN_INTERVAL_MS, Math.round(n * 1000)));
  if (ms === turnIntervalMs) return;
  turnIntervalMs = ms;
  clearInterval(loopTimer);
  loopTimer = setInterval(tick, turnIntervalMs);
  console.log(`Turn interval set to ${turnIntervalMs / 1000}s by the display`);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

app.use(express.json({ limit: "5mb" }));
app.use(express.static(join(__dirname, "dist")));

// Every API request must carry the display key (?key= or x-display-key).
app.use("/api", (req, res, next) => {
  const key = req.query.key || req.get("x-display-key");
  if (!DISPLAY_KEY || key !== DISPLAY_KEY) {
    return res.status(401).json({ error: "no key set" });
  }
  next();
});

const publicTurn = (t) => ({ id: t.id, createdAt: t.createdAt, item: t.item });

const selectItem = db.prepare("SELECT item FROM turns WHERE id = ?");

// Snapshot bodies carry only positions; attach each sprite's pixels here.
function hydrateSnapshot(snap) {
  if (!snap) return null;
  const byId = new Map(recent.map((t) => [t.id, t.item]));
  const bodies = [];
  for (const b of snap.bodies) {
    let item = b.item || byId.get(b.turnId);
    if (!item) {
      const row = selectItem.get(b.turnId);
      if (row) item = JSON.parse(row.item);
    }
    if (item) bodies.push({ ...b, item });
  }
  return { ...snap, bodies };
}

// Full state for a fresh display: the saved pile plus any turns since then.
app.get("/api/state", (req, res) => {
  if (req.query.speed !== undefined) setTurnInterval(req.query.speed);
  if (req.query.types !== undefined) setActiveTypes(req.query.types);
  if (req.query.active === "1") noteDisplayActive();
  const since = snapshot?.latestTurnId || 0;
  res.json({
    epoch,
    stageWidth: STAGE_WIDTH,
    totalItems,
    turnIntervalMs,
    snapshot: hydrateSnapshot(snapshot),
    turns: recent.filter((t) => t.id > since).map(publicTurn),
  });
});

// Incremental: turns after a given id.
app.get("/api/turns", (req, res) => {
  if (req.query.active === "1") noteDisplayActive();
  const after = Number(req.query.after) || 0;
  res.json({
    epoch,
    turns: recent.filter((t) => t.id > after).map(publicTurn),
    latestId: recent.length ? recent[recent.length - 1].id : 0,
  });
});

// The display posts the pile's physics state here.
app.post("/api/snapshot", (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.bodies) || typeof body.latestTurnId !== "number") {
    return res.status(400).json({ error: "bad snapshot" });
  }
  if (body.epoch !== epoch) {
    console.warn(`Rejected snapshot from a display with stale epoch ${body.epoch}`);
    return res.status(409).json({ error: "stale display; reload" });
  }
  if (body.speed !== undefined) setTurnInterval(body.speed);
  if (body.types !== undefined) setActiveTypes(body.types);
  snapshot = {
    savedAt: new Date().toISOString(),
    latestTurnId: body.latestTurnId,
    cameraY: Number(body.cameraY) || 0,
    background: typeof body.background === "string" ? body.background : null,
    bodies: body.bodies.slice(0, 2000),
  };
  setMeta("snapshot", snapshot);
  console.log(
    `Snapshot saved: ${snapshot.bodies.length} bodies, through #${snapshot.latestTurnId}, camera ${snapshot.cameraY.toFixed(0)}`,
  );
  res.json({ ok: true, bodies: snapshot.bodies.length });
});

app.get("/api/status", (req, res) => {
  res.json({
    model: MODEL,
    epoch,
    totalItems,
    recentCount: recent.length,
    latestId: recent.length ? recent[recent.length - 1].id : 0,
    lastTurnAt,
    lastError,
    inFlight,
    turnIntervalMs,
    activeTypes,
    displayActive: displayActive(),
    snapshot: snapshot
      ? { savedAt: snapshot.savedAt, latestTurnId: snapshot.latestTurnId, bodies: snapshot.bodies.length }
      : null,
  });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Infinite Pixel Machine server on http://localhost:${PORT} (${totalItems} items so far)`);
  loop();
});
