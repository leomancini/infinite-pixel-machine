// Shared between server (Node ESM) and client (Vite).
// Sprites are grids of cells; each cell is CELL px on screen.

export const STAGE_WIDTH = 768;
export const STAGE_HEIGHT = 1024;
export const CELL = 5;
export const MAX_SPRITE = 96; // max sprite width/height in cells
export const TRANSPARENT = ".";

// Normalize a raw item from the model into a safe, drawable sprite.
// Returns null if there is nothing drawable.
export function normalizeItem(raw) {
  if (!raw || !Array.isArray(raw.rows) || !Array.isArray(raw.palette)) return null;

  const palette = {};
  for (const entry of raw.palette) {
    if (!entry || typeof entry.char !== "string" || typeof entry.color !== "string") continue;
    const ch = entry.char.trim()[0];
    const color = entry.color.trim();
    if (!ch || ch === TRANSPARENT) continue;
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue;
    palette[ch] = color.toLowerCase();
  }

  let rows = raw.rows
    .filter((r) => typeof r === "string")
    .slice(0, MAX_SPRITE)
    .map((r) => r.slice(0, MAX_SPRITE));

  // Trim fully transparent rows/columns so the body hugs the pixels.
  const isOpaque = (ch) => !!palette[ch];
  while (rows.length && ![...rows[0]].some(isOpaque)) rows.shift();
  while (rows.length && ![...rows[rows.length - 1]].some(isOpaque)) rows.pop();
  if (rows.length === 0) return null;
  const w0 = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => r.padEnd(w0, TRANSPARENT));
  let left = 0;
  while (left < w0 && !rows.some((r) => isOpaque(r[left]))) left++;
  let right = w0;
  while (right > left && !rows.some((r) => isOpaque(r[right - 1]))) right--;
  rows = rows.map((r) => r.slice(left, right));

  const h = rows.length;
  const w = right - left;
  if (h === 0 || w === 0) return null;

  const background =
    typeof raw.background === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.background.trim())
      ? raw.background.trim().toLowerCase()
      : "#000000";

  return {
    source: typeof raw.source === "string" ? raw.source : null,
    background,
    name: String(raw.name || "something").slice(0, 60),
    note: String(raw.note || "")
      .trim()
      .replace(/^(a|an|the)\s+/i, "")
      .replace(/^[a-z]/, (c) => c.toUpperCase())
      .replace(/[.\s]+$/, "")
      .slice(0, 90),
    w,
    h,
    palette,
    rows,
  };
}
