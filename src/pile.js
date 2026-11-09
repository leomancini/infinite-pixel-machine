import Matter from "matter-js";
import { CELL } from "../shared/canvas.js";

const { Bodies, Body, Vertices } = Matter;

// Pre-render a sprite to an offscreen canvas at one pixel per cell. drawBody
// scales it up by CELL (nearest-neighbour), which looks identical to a
// CELL-scale bitmap but takes 1/25th of the memory and one putImageData
// instead of a fillRect per cell.
export function renderSprite(item) {
  const canvas = document.createElement("canvas");
  canvas.width = item.w;
  canvas.height = item.h;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(item.w, item.h);
  const data = image.data;
  const colors = {};
  for (const ch of Object.keys(item.palette)) {
    const n = parseInt(item.palette[ch].slice(1), 16);
    colors[ch] = [n >> 16, (n >> 8) & 0xff, n & 0xff];
  }
  for (let r = 0; r < item.h && r < item.rows.length; r++) {
    const row = item.rows[r];
    for (let c = 0; c < item.w && c < row.length; c++) {
      const rgb = colors[row[c]];
      if (!rgb) continue;
      const i = (r * item.w + c) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Convex hull of the opaque cells, in sprite-local pixel coordinates. Only the
// first and last opaque cell of each row can touch the hull, so only their
// corners are fed to it.
function hullOf(item) {
  const points = [];
  for (let r = 0; r < item.rows.length; r++) {
    const row = item.rows[r];
    let first = -1;
    let last = -1;
    for (let c = 0; c < row.length; c++) {
      if (!item.palette[row[c]]) continue;
      if (first < 0) first = c;
      last = c;
    }
    if (first < 0) continue;
    const x0 = first * CELL;
    const x1 = (last + 1) * CELL;
    const y0 = r * CELL;
    points.push({ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x0, y: y0 + CELL }, { x: x1, y: y0 + CELL });
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

// `k` is canvas-units-to-device-pixels; positions snap to device pixels so a
// resting sprite is always sampled the same way. The caller must have image
// smoothing off: the sprite is one pixel per cell and is scaled up here.
export function drawBody(ctx, body, k = 1) {
  const { sprite, offset } = body.plugin;
  if (!sprite) return;
  ctx.save();
  ctx.translate(Math.round(body.position.x * k) / k, Math.round(body.position.y * k) / k);
  ctx.rotate(body.angle);
  ctx.drawImage(sprite, offset.x, offset.y, sprite.width * CELL, sprite.height * CELL);
  ctx.restore();
}
