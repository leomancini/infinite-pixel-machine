import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import Matter from "matter-js";
import { STAGE_WIDTH, STAGE_HEIGHT, CELL } from "../shared/canvas.js";
import { makeBody, drawBody } from "./pile.js";

const { Engine, Composite, Bodies, Body } = Matter;

const DISPLAY_LAG = 2; // show results this many turns behind the latest generated
const DEFAULT_SPEED_S = 15; // seconds between drops; override with ?speed=N

// Display key from the URL (?key=...). Required by every API call.
const DISPLAY_KEY = new URLSearchParams(window.location.search).get("key") || "";
const api = (path) => `${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(DISPLAY_KEY)}`;

// Seconds between drops from the URL, e.g. /?speed=5. Falls back to the default.
function speedFromUrl() {
  const raw = new URLSearchParams(window.location.search).get("speed");
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? n : DEFAULT_SPEED_S;
}
const POLL_MS = 5_000;
const SNAPSHOT_MS = 10_000;
const CAMERA_MIN_SPEED = 1; // px per second: the view is always drifting up at least this fast
const CAMERA_START_ZONE = 160; // px below the middle where the drift begins ramping up from zero
const CAMERA_MAX_SPEED = 6; // px per second cap when catching up to a tall heap
const CAMERA_GAIN = 0.05; // fraction of the remaining distance closed per second
const PILE_TOP_SCREEN_Y = 0.5 * STAGE_HEIGHT; // keep the heap's top line around the middle of the screen
const FREEZE_BELOW = 150; // px below the bottom edge before a resting body is frozen
const REMOVE_BELOW = 1600; // px below the bottom edge before a body is dropped from the world
const SETTLED_SPEED = 0.35;
const SETTLE_AGE_MS = 1500;
const MAX_CATCHUP = 60; // at most this many unseen turns get dropped on load
const BG_FADE_RATE = 0.6; // fraction of the remaining color difference closed per second

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const Viewport = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  overflow: hidden;
`;

// Fixed 768x1024 stage. Fills a 768x1024 display 1:1 and scales to fit
// (letterboxed) on any other screen size, so the layout math never changes.
const Stage = styled.div`
  position: relative;
  width: ${STAGE_WIDTH}px;
  height: ${STAGE_HEIGHT}px;
  flex: none;
  background: #000;
  color: #fff;
  overflow: hidden;
  transform: scale(var(--stage-scale, 1));
  transform-origin: center center;
`;

const Pixels = styled.canvas`
  position: absolute;
  inset: 0;
  width: ${STAGE_WIDTH}px;
  height: ${STAGE_HEIGHT}px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
`;

const TEXT_MARGIN = 56; // px from the stage edge to the ink of text and digits
const CAPTION_SIZE = 40;
const CAPTION_LINE_HEIGHT = 1.25;
const COUNT_SIZE = 80;
const DIGIT_CELL_EM = 0.8;

const Countdown = styled.div`
  position: absolute;
  /* Offsets are measured from the rendered glyphs at runtime (useOpticalAlign)
     so the digit ink sits exactly TEXT_MARGIN from the top and right edges. */
  right: var(--count-right, 28px);
  top: var(--count-top, 19px);
  font-family: "Silkscreen", ui-monospace, monospace;
  font-size: ${COUNT_SIZE}px;
  line-height: 1;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
  display: flex;

  /* Each digit sits in a fixed-width cell so the number never shifts. */
  span {
    display: inline-block;
    width: ${DIGIT_CELL_EM}em;
    text-align: center;
  }
`;

const NoKey = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  font-family: "Silkscreen", ui-monospace, monospace;
  font-size: 32px;
  color: rgba(255, 255, 255, 0.85);
  text-transform: uppercase;
`;

const Caption = styled.div`
  position: absolute;
  left: var(--caption-left, 35px);
  right: 236px;
  top: var(--caption-top, 24px);
  font-family: "Silkscreen", ui-monospace, monospace;
  font-size: ${CAPTION_SIZE}px;
  line-height: ${CAPTION_LINE_HEIGHT};
  color: rgba(255, 255, 255, 0.85);
  white-space: pre-wrap;
  pointer-events: none;
`;

// Invisible twin of the caption used to measure where the full text wraps,
// so the typewriter can type into fixed lines instead of re-wrapping mid-word.
const CaptionGhost = styled(Caption)`
  visibility: hidden;
  white-space: normal;
`;

// Break text into the lines it will occupy in the caption box.
function wrapToLines(ghost, text) {
  ghost.replaceChildren(
    ...text.split(/\s+/).filter(Boolean).flatMap((word, i) => {
      const span = document.createElement("span");
      span.textContent = word;
      return i === 0 ? [span] : [document.createTextNode(" "), span];
    }),
  );
  const lines = [];
  let current = [];
  let lastTop = null;
  for (const span of ghost.children) {
    const top = span.offsetTop;
    if (lastTop !== null && top > lastTop) {
      lines.push(current.join(" "));
      current = [];
    }
    current.push(span.textContent);
    lastTop = top;
  }
  if (current.length) lines.push(current.join(" "));
  return lines.join("\n");
}

// Caption typewriter, all within one countdown interval: a short pause after
// the previous caption finished untyping, then type the new description, hold
// it, then untype it so it is gone exactly when the timer hits 0.
const TYPE_PAUSE_MS = 1000; // silence at the start of the interval
const TYPE_FRACTION = 0.3; // fraction of the interval spent typing
const UNTYPE_FROM = 0.72; // fraction of the interval at which untyping starts
function visibleChars(text, elapsedMs, intervalMs) {
  const n = text.length;
  const typeStart = Math.min(TYPE_PAUSE_MS, intervalMs * 0.3);
  const typeEnd = Math.min(typeStart + TYPE_FRACTION * intervalMs, intervalMs * 0.6);
  const untypeStart = Math.max(UNTYPE_FROM * intervalMs, typeEnd);
  if (elapsedMs < typeStart) return 0;
  if (elapsedMs < typeEnd) return Math.floor(((elapsedMs - typeStart) / (typeEnd - typeStart)) * n);
  if (elapsedMs < untypeStart) return n;
  return Math.ceil((1 - (elapsedMs - untypeStart) / (intervalMs - untypeStart)) * n);
}

// Keep --stage-scale equal to the largest scale at which 768x1024 fits the window.
function useFitScale() {
  useEffect(() => {
    const update = () => {
      const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
      document.documentElement.style.setProperty("--stage-scale", String(scale));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
}

// Measure where the font actually puts its ink and set CSS offsets so the
// caption's cap-height ink and the countdown's digit ink both start exactly
// TEXT_MARGIN px from the stage edges.
function useOpticalAlign() {
  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      const ctx = document.createElement("canvas").getContext("2d");
      const root = document.documentElement.style;

      // Caption: a capital letter at the caption size.
      ctx.font = `400 ${CAPTION_SIZE}px Silkscreen`;
      const cap = ctx.measureText("A");
      const capLine = CAPTION_SIZE * CAPTION_LINE_HEIGHT;
      const capContent = cap.fontBoundingBoxAscent + cap.fontBoundingBoxDescent;
      const capInkTop = (capLine - capContent) / 2 + cap.fontBoundingBoxAscent - cap.actualBoundingBoxAscent;
      root.setProperty("--caption-top", `${TEXT_MARGIN - capInkTop}px`);
      root.setProperty("--caption-left", `${TEXT_MARGIN + cap.actualBoundingBoxLeft}px`);

      // Countdown: a digit centred in its fixed cell, line-height 1.
      ctx.font = `400 ${COUNT_SIZE}px Silkscreen`;
      const dig = ctx.measureText("0");
      const digContent = dig.fontBoundingBoxAscent + dig.fontBoundingBoxDescent;
      const digInkTop = (COUNT_SIZE - digContent) / 2 + dig.fontBoundingBoxAscent - dig.actualBoundingBoxAscent;
      const cell = COUNT_SIZE * DIGIT_CELL_EM;
      const start = (cell - dig.width) / 2;
      const inkRight = start + dig.actualBoundingBoxRight;
      root.setProperty("--count-top", `${TEXT_MARGIN - digInkTop}px`);
      root.setProperty("--count-right", `${TEXT_MARGIN - (cell - inkRight)}px`);
    };
    document.fonts.load(`400 ${COUNT_SIZE}px Silkscreen`).then(apply, apply);
    document.fonts.ready.then(apply);
    return () => {
      cancelled = true;
    };
  }, []);
}

function App() {
  useFitScale();
  useOpticalAlign();
  const canvasRef = useRef(null);
  const countdownRef = useRef(null);
  const captionRef = useRef(null);
  const ghostRef = useRef(null);
  const [noKey, setNoKey] = useState(!DISPLAY_KEY);

  useEffect(() => {
    if (!DISPLAY_KEY) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // --- physics world -----------------------------------------------------
    const engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1;
    const world = engine.world;
    const WALL = 200;
    const floor = Bodies.rectangle(STAGE_WIDTH / 2, STAGE_HEIGHT + WALL / 2, STAGE_WIDTH * 3, WALL, {
      isStatic: true,
      friction: 1,
    });
    const tall = 400_000;
    const leftWall = Bodies.rectangle(-WALL / 2, STAGE_HEIGHT - tall / 2, WALL, tall, { isStatic: true });
    const rightWall = Bodies.rectangle(STAGE_WIDTH + WALL / 2, STAGE_HEIGHT - tall / 2, WALL, tall, {
      isStatic: true,
    });
    Composite.add(world, [floor, leftWall, rightWall]);

    let cameraY = 0; // world y at the top of the screen; only ever decreases
    let bg = [0, 0, 0]; // current background color, eased toward targetBg
    let targetBg = [0, 0, 0];
    const pieces = new Map(); // turnId -> body
    const turns = []; // known turns, ascending by id
    const spawned = new Set();
    let shown = 0; // index into turns of the next turn to drop
    let intervalMs = speedFromUrl() * 1000;
    let nextRevealAt = 0;
    let epoch = null;
    let cancelled = false;
    let pollTimer = null;
    let revealTimer = null;
    let snapshotTimer = null;
    let raf = null;
    let lastFrame = performance.now();

    const rand = (a, b) => a + Math.random() * (b - a);

    const addPiece = (turn, x, y, opts) => {
      if (spawned.has(turn.id)) return null;
      try {
        const body = makeBody(turn, x, y, opts);
        pieces.set(turn.id, body);
        spawned.add(turn.id);
        Composite.add(world, body);
        return body;
      } catch (err) {
        console.warn("could not build body for turn", turn.id, err);
        spawned.add(turn.id);
        return null;
      }
    };

    const drop = (turn) => {
      const w = turn.item.w * CELL;
      const h = turn.item.h * CELL;
      const margin = Math.min(STAGE_WIDTH / 2 - 10, w / 2 + 24);
      const x = rand(margin, STAGE_WIDTH - margin);
      const y = cameraY - h - 40;
      const body = addPiece(turn, x, y, { angle: rand(-0.4, 0.4) });
      if (body) Body.setAngularVelocity(body, rand(-0.04, 0.04));
    };

    const isSettled = (body) =>
      body.isStatic ||
      body.isSleeping ||
      (body.speed < SETTLED_SPEED && performance.now() - body.plugin.bornAt > SETTLE_AGE_MS);

    const pileTop = () => {
      let top = STAGE_HEIGHT;
      for (const body of pieces.values()) {
        if (isSettled(body) && body.bounds.min.y < top) top = body.bounds.min.y;
      }
      return top;
    };

    // --- reveal cadence ------------------------------------------------------
    let captionText = ""; // description (pre-wrapped) being typed out this interval
    const showCaption = (turn) => {
      const note = turn.item.note || "";
      captionText = ghostRef.current ? wrapToLines(ghostRef.current, note) : note;
    };

    const setBackground = (item) => {
      if (item?.background) targetBg = hexToRgb(item.background);
    };

    const reveal = () => {
      nextRevealAt = Date.now() + intervalMs;
      if (shown >= turns.length) return;
      const turn = turns[shown++];
      drop(turn);
      showCaption(turn);
      setBackground(turn.item);
    };

    const poll = async () => {
      try {
        const after = turns.length ? turns[turns.length - 1].id : 0;
        const res = await fetch(api(`/api/turns?after=${after}`));
        if (res.status === 401) {
          setNoKey(true);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (epoch && data.epoch && data.epoch !== epoch) {
          // Server data was reset under us; start over cleanly.
          window.location.reload();
          return;
        }
        for (const t of data.turns) {
          if (!turns.length || t.id > turns[turns.length - 1].id) turns.push(t);
        }
      } catch (err) {
        console.warn("poll failed", err);
      }
    };

    // --- persistence ---------------------------------------------------------
    const snapshotPayload = () => ({
      epoch,
      speed: intervalMs / 1000,
      latestTurnId: Math.max(shown > 0 ? turns[shown - 1].id : 0, ...[...pieces.keys()]),
      cameraY,
      background: `#${targetBg.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`,
      // Positions only; the server rejoins each sprite's pixels by turnId.
      // Keeps the payload small enough for sendBeacon's 64KB limit.
      bodies: [...pieces.values()].map((b) => ({
        turnId: b.plugin.turnId,
        x: Math.round(b.position.x * 10) / 10,
        y: Math.round(b.position.y * 10) / 10,
        angle: Math.round(b.angle * 1000) / 1000,
        isStatic: b.isStatic,
      })),
    });

    const saveSnapshot = (useBeacon = false) => {
      if (shown === 0 && pieces.size === 0) return;
      const json = JSON.stringify(snapshotPayload());
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(api("/api/snapshot"), new Blob([json], { type: "application/json" }));
      } else {
        fetch(api("/api/snapshot"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: json,
        })
          .then((res) => {
            if (!res.ok) console.warn("snapshot rejected", res.status);
          })
          .catch((err) => console.warn("snapshot failed", err));
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") saveSnapshot(true);
    };

    // --- frame loop ----------------------------------------------------------
    const frame = (now) => {
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      Engine.update(engine, 1000 / 60);

      // Camera always drifts upward at a slow constant crawl. When the heap's
      // top climbs above its ideal line it eases faster to catch up, closing a
      // fraction of the gap each second, capped. It never moves down.
      // The camera holds still while the heap is low. Once the heap's top gets
      // within CAMERA_START_ZONE px of the middle the drift ramps up from zero
      // to the normal crawl, reaching full speed as the top hits the middle.
      const top = pileTop();
      const topOnScreen = top - cameraY; // 0 = screen top, STAGE_HEIGHT = floor
      const rise = Math.min(1, Math.max(0, (PILE_TOP_SCREEN_Y + CAMERA_START_ZONE - topOnScreen) / CAMERA_START_ZONE));
      const minSpeed = CAMERA_MIN_SPEED * rise;
      const target = top - PILE_TOP_SCREEN_Y;
      const gap = Math.max(0, cameraY - target);
      const speed = Math.max(minSpeed, Math.min(CAMERA_MAX_SPEED, gap * CAMERA_GAIN));
      cameraY -= speed * dt;

      // Freeze resting bodies that have scrolled off the bottom; drop ones far below.
      const bottom = cameraY + STAGE_HEIGHT;
      for (const [id, body] of pieces) {
        if (body.bounds.min.y > bottom + REMOVE_BELOW) {
          Composite.remove(world, body);
          pieces.delete(id);
        } else if (!body.isStatic && body.bounds.min.y > bottom + FREEZE_BELOW && isSettled(body)) {
          Body.setStatic(body, true);
        }
      }

      // Background eases toward the latest item's color.
      const k = 1 - Math.exp(-BG_FADE_RATE * dt);
      bg = bg.map((c, i) => c + (targetBg[i] - c) * k);

      // Draw.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgb(${bg.map(Math.round).join(",")})`;
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      ctx.imageSmoothingEnabled = false;
      ctx.translate(0, -cameraY);
      for (const body of pieces.values()) {
        if (body.bounds.max.y < cameraY - 50 || body.bounds.min.y > bottom + 50) continue;
        drawBody(ctx, body);
      }

      // Countdown to the next drop.
      const remaining = Math.max(0, nextRevealAt - Date.now());
      const label = countdownRef.current;
      if (label) {
        const hasNext = shown < turns.length;
        const digits = String(Math.ceil(remaining / 1000)).padStart(2, "0");
        if (label.textContent !== digits) {
          label.replaceChildren(
            ...[...digits].map((d) => {
              const span = document.createElement("span");
              span.textContent = d;
              return span;
            }),
          );
        }
        label.style.opacity = hasNext ? "1" : "0.4";
      }
      const caption = captionRef.current;
      if (caption) {
        const elapsed = Math.min(intervalMs, Math.max(0, intervalMs - remaining));
        const next = captionText.slice(0, visibleChars(captionText, elapsed, intervalMs));
        if (caption.textContent !== next) caption.textContent = next;
      }

      raf = requestAnimationFrame(frame);
    };

    // --- startup -------------------------------------------------------------
    const init = async () => {
      try {
        // Tell the server our drop speed so it generates at the same pace.
        const res = await fetch(api(`/api/state?speed=${intervalMs / 1000}`));
        if (res.status === 401) {
          setNoKey(true);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const state = await res.json();
        if (cancelled) return;
        epoch = state.epoch;

        // Restore the saved heap.
        if (state.snapshot) {
          cameraY = Math.min(0, Number(state.snapshot.cameraY) || 0);
          for (const b of state.snapshot.bodies) {
            addPiece({ id: b.turnId, item: b.item }, b.x, b.y, { angle: b.angle, isStatic: !!b.isStatic });
          }
        }

        // Turns generated since the snapshot: drop all but the last DISPLAY_LAG now.
        turns.push(...state.turns);
        const catchUpTo = Math.max(0, turns.length - DISPLAY_LAG);
        const catchUpFrom = Math.max(0, catchUpTo - MAX_CATCHUP);
        for (let i = catchUpFrom; i < catchUpTo; i++) {
          const turn = turns[i];
          const h = turn.item.h * CELL;
          const w = turn.item.w * CELL;
          const margin = Math.min(STAGE_WIDTH / 2 - 10, w / 2 + 24);
          addPiece(turn, rand(margin, STAGE_WIDTH - margin), cameraY - h - 40 - (i - catchUpFrom) * 160, {
            angle: rand(-0.4, 0.4),
          });
        }
        shown = catchUpTo;
        if (shown > 0) {
          setBackground(turns[shown - 1].item);
          bg = targetBg.slice();
        } else if (state.snapshot?.background) {
          targetBg = hexToRgb(state.snapshot.background);
          bg = targetBg.slice();
        }

        nextRevealAt = Date.now() + intervalMs;
        pollTimer = setInterval(poll, POLL_MS);
        revealTimer = setInterval(reveal, intervalMs);
        snapshotTimer = setInterval(() => saveSnapshot(false), SNAPSHOT_MS);
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", () => saveSnapshot(true));
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
      } catch (err) {
        console.error("init failed", err);
        if (!cancelled) setTimeout(init, 3_000);
      }
    };

    init();
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(revealTimer);
      clearInterval(snapshotTimer);
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onHide);
      Engine.clear(engine);
    };
  }, []);

  if (noKey) {
    return (
      <Viewport>
        <Stage>
          <NoKey>No key set</NoKey>
        </Stage>
      </Viewport>
    );
  }

  return (
    <Viewport>
      <Stage>
        <Pixels ref={canvasRef} width={STAGE_WIDTH} height={STAGE_HEIGHT} />
        <Countdown ref={countdownRef} />
        <CaptionGhost ref={ghostRef} aria-hidden="true" />
        <Caption ref={captionRef} />
      </Stage>
    </Viewport>
  );
}

export default App;
