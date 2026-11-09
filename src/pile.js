import Matter from "matter-js";
import { CELL } from "../shared/canvas.js";

const { Bodies, Body, Vertices } = Matter;

// Pre-render a sprite to an offscreen canvas at CELL scale.
export function renderSprite(item) {
  const canvas = document.createElement("canvas");
  canvas.width = item.w * CELL;
  canvas.height = item.h * CELL;
  const ctx = canvas.getContext("2d");
  for (let r = 0; r < item.rows.length; r++) {
    const row = item.rows[r];
    for (let c = 0; c < row.length; c++) {
      const color = item.palette[row[c]];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }
  return canvas;
}

// Convex hull of the opaque cells, in sprite-local pixel coordinates.
function hullOf(item) {
  const points = [];
  for (let r = 0; r < item.rows.length; r++) {
    const row = item.rows[r];
    for (let c = 0; c < row.length; c++) {
      if (!item.palette[row[c]]) continue;
      const x0 = c * CELL;
      const y0 = r * CELL;
      points.push({ x: x0, y: y0 }, { x: x0 + CELL, y: y0 }, { x: x0, y: y0 + CELL }, { x: x0 + CELL, y: y0 + CELL });
    }
  }
  return Vertices.hull(points);
}

// Build a rigid body for a sprite. `sprite` is attached as a plugin so the
// renderer can draw it; `offset` is the sprite's top-left relative to the
// body's centre of mass.
export function makeBody(turn, x, y, { angle = 0, isStatic = false } = {}) {
  const item = turn.item;
  const hull = hullOf(item);
  const centre = Vertices.centre(hull);
  const body = Bodies.fromVertices(x, y, [hull], {
    isStatic,
    angle,
    friction: 0.8,
    frictionStatic: 1,
    restitution: 0.05,
    density: 0.002,
    sleepThreshold: 60,
  });
  body.plugin.turnId = turn.id;
  body.plugin.item = item;
  body.plugin.sprite = renderSprite(item);
  body.plugin.offset = { x: -centre.x, y: -centre.y };
  body.plugin.bornAt = performance.now();
  if (angle) Body.setAngle(body, angle);
  return body;
}

export function drawBody(ctx, body) {
  const { sprite, offset } = body.plugin;
  if (!sprite) return;
  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  ctx.drawImage(sprite, offset.x, offset.y);
  ctx.restore();
}
