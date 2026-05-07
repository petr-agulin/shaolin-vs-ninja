import { useState, useMemo } from "react";

// =============================================================================
// PHASE 1 — BOARD GENERATION & RENDERING
// Spec sections covered:
//   The Board / Tile Types / Tile Distribution / Hole Mechanics / Trap Types
//   Balancing Constraints for Generation / Reaching the Boss / Movement (visual only)
// =============================================================================

// ---- LAYOUT CONSTANTS -------------------------------------------------------
const COLS = 8;
const ROWS = 8;
const BOARD_SIZE = 64;
const TILE = 70;
const COL_GAP = 60;       // wide horizontal gap so direction arrows have room
const ROW_GAP = 68;       // doubled vertical gap so rows read as distinct levels
const PAD = 28;
const BOARD_W = COLS * (TILE + COL_GAP) - COL_GAP + PAD * 2;
const BOARD_H = ROWS * (TILE + ROW_GAP) - ROW_GAP + PAD * 2;

// ---- TYPE TAGS --------------------------------------------------------------
const T = {
  NORMAL: "normal",
  FIGHT: "fight",
  ITEM: "item",
  LADDER: "ladder",
  HOLE: "hole",
  TRAP: "trap",
  BOSS: "boss",
};

const NINJA = {
  black:  { name: "Black Ninja",  color: "#2c2c34", short: "Black"  },
  fire:   { name: "Fire Ninja",   color: "#e64a19", short: "Fire"   },
  shadow: { name: "Shadow Ninja", color: "#5e5ec8", short: "Shadow" },
  demon:  { name: "Demon Ninja",  color: "#9c27b0", short: "Demon"  },
};

const TRAP = {
  hold:             { name: "Hold",             short: "Hold"   },
  sorcery_theft:    { name: "Sorcery Theft",    short: "S-Theft"},
  pose_theft:       { name: "Pose Theft",       short: "P-Theft"},
  unexpected_fight: { name: "Unexpected Fight", short: "Ambush" },
};

const PALETTE = {
  bg:        "#3d2f12",   // off-road background (deep brown)
  roadEdge:  "#3a2710",   // dark outer border of road
  road:      "#b08f4a",   // road surface
  roadInner: "#c9a866",   // lighter road inner band
  roadStripe:"#f3e6b5",   // dashed center stripe
  normal:    "#fff8e0",
  normalEdge:"#9b8050",
  item:      "#f4d35e",
  itemEdge:  "#a87d1f",
  ladder:    "#a4c8f0",
  ladderEdge:"#2c558a",
  trap:      "#fff8e0",
  trapEdge:  "#9b8050",
  trapMark:  "#b03a48",
  boss:      "#d4af37",
  bossEdge:  "#7a5500",
  abyss:     "#08080c",
  abyssEdge: "#2a1818",
  text:      "#3a2c12",
  textLight: "#fff8e7",
};

// Road geometry — wider than tiles so tiles sit *inside* a clearly-visible road.
const ROAD_OUTER = TILE + 36;
const ROAD_INNER = TILE + 24;
const ROAD_LIGHT = TILE + 12;

// ---- LAYOUT HELPERS ---------------------------------------------------------
function tileGridPos(n) {
  const idx = n - 1;
  const row = Math.floor(idx / COLS);
  const colInRow = idx % COLS;
  const col = row % 2 === 0 ? colInRow : COLS - 1 - colInRow;
  return { row, col };
}

function gridPosToTile(row, col) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  const colInRow = row % 2 === 0 ? col : COLS - 1 - col;
  return row * COLS + colInRow + 1;
}

function tilePos(n) {
  const { row, col } = tileGridPos(n);
  const x = PAD + col * (TILE + COL_GAP);
  const y = PAD + row * (TILE + ROW_GAP);
  return { x, y, cx: x + TILE / 2, cy: y + TILE / 2, row, col };
}

// ---- RNG --------------------------------------------------------------------
const rand = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rand(a.length)];
function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// =============================================================================
// BOARD GENERATION
// =============================================================================

function placeFights(tiles) {
  // 12 fights in tiles 4..59, no two adjacent, demon must land at tile > 20.
  const eligible = [];
  for (let i = 4; i <= 59; i++) eligible.push(i);

  const positions = [];
  const taken = new Set();
  for (const t of shuffle(eligible)) {
    if (positions.length >= 12) break;
    if (taken.has(t - 1) || taken.has(t + 1)) continue;
    positions.push(t);
    taken.add(t);
  }
  if (positions.length < 12) return false;
  positions.sort((a, b) => a - b);

  // Distribution: ~45/20/20/10 → 1 demon, 2–3 fire, 2–3 shadow, rest black.
  const demonCount = 1;
  const fireCount = 2 + rand(2);
  const shadowCount = 2 + rand(2);
  const blackCount = 12 - demonCount - fireCount - shadowCount;
  const types = shuffle([
    ...Array(demonCount).fill("demon"),
    ...Array(fireCount).fill("fire"),
    ...Array(shadowCount).fill("shadow"),
    ...Array(blackCount).fill("black"),
  ]);

  // Ensure demon sits on tile > 20.
  const demonIdx = types.indexOf("demon");
  if (positions[demonIdx] <= 20) {
    const candidates = positions
      .map((p, i) => (p > 20 && types[i] !== "demon" ? i : -1))
      .filter((i) => i >= 0);
    if (candidates.length === 0) return false;
    const targetIdx = pick(candidates);
    [types[demonIdx], types[targetIdx]] = [types[targetIdx], types[demonIdx]];
  }

  for (let i = 0; i < positions.length; i++) {
    tiles[positions[i]] = { num: positions[i], type: T.FIGHT, ninja: types[i] };
  }
  return true;
}

function placeHoles(tiles) {
  // 3 holes; origin in 6..50. No two within 3 tiles of each other.
  // Destination is the COLUMN-ALIGNED tile 1 or 2 rows below the origin
  // (same logic as ladders, with extra freedom over the level). Destination
  // must be NORMAL at this point — only fights are placed before holes — and
  // we reserve the destination so traps/ladders/items cannot overwrite it.
  // Trap-distance constraint enforced later when placing traps.
  const eligible = [];
  for (let i = 6; i <= 50; i++) {
    if (tiles[i].type === T.NORMAL) eligible.push(i);
  }

  const placed = []; // { origin, dest, fallRows }
  const reserved = new Set();

  for (const origin of shuffle(eligible)) {
    if (placed.length >= 3) break;
    let spaced = true;
    for (const p of placed) {
      if (Math.abs(p.origin - origin) < 3) { spaced = false; break; }
    }
    if (!spaced) continue;

    const { row: rOrig, col } = tileGridPos(origin);
    let chosen = null;
    for (const fallRows of shuffle([1, 2])) {
      const targetRow = rOrig + fallRows;
      let dest;
      if (targetRow >= ROWS) {
        dest = 64; // overshoot → boss
      } else {
        dest = gridPosToTile(targetRow, col);
        if (dest === null) continue;
      }
      if (dest !== 64) {
        if (dest <= origin) continue;
        if (tiles[dest].type !== T.NORMAL) continue;
        if (reserved.has(dest)) continue;
      }
      // Spec: ≥1 item-or-normal between origin and dest. At this point only
      // fights are placed, so any current normal tile counts.
      let hasIntermediate = false;
      for (let p = origin + 1; p < (dest === 64 ? 64 : dest); p++) {
        if (tiles[p].type === T.NORMAL) { hasIntermediate = true; break; }
      }
      if (!hasIntermediate) continue;

      chosen = { origin, dest, fallRows };
      break;
    }
    if (!chosen) continue;

    placed.push(chosen);
    if (chosen.dest !== 64) reserved.add(chosen.dest);
  }

  if (placed.length < 3) return null;
  for (const p of placed) {
    tiles[p.origin] = { num: p.origin, type: T.HOLE, fallRows: p.fallRows, dest: p.dest };
  }
  return reserved;
}

function placeTraps(tiles, reserved) {
  // 4 traps, one per type. Eligible 6..59. No within 2 of fight or hole.
  // No two trap tiles adjacent. Unexpected_fight not within 4 of fight.
  // Skips tiles reserved as hole landing points (must remain normal).
  const fights = [];
  const holes = [];
  for (let i = 1; i <= 64; i++) {
    if (tiles[i].type === T.FIGHT) fights.push(i);
    if (tiles[i].type === T.HOLE) holes.push(i);
  }

  function eligibleFor(trapType, alreadyPlaced) {
    const result = [];
    for (let i = 6; i <= 59; i++) {
      if (tiles[i].type !== T.NORMAL) continue;
      if (reserved.has(i)) continue;
      let bad = false;
      for (const f of fights) if (Math.abs(f - i) <= 2) { bad = true; break; }
      if (bad) continue;
      for (const h of holes) if (Math.abs(h - i) <= 2) { bad = true; break; }
      if (bad) continue;
      for (const p of alreadyPlaced) if (Math.abs(p - i) <= 1) { bad = true; break; }
      if (bad) continue;
      if (trapType === "unexpected_fight") {
        for (const f of fights) if (Math.abs(f - i) <= 4) { bad = true; break; }
        if (bad) continue;
      }
      result.push(i);
    }
    return result;
  }

  // Place unexpected_fight first (most constrained), then the rest.
  const order = ["unexpected_fight", ...shuffle(["hold", "sorcery_theft", "pose_theft"])];
  const placed = [];
  for (const trapType of order) {
    const cand = eligibleFor(trapType, placed);
    if (cand.length === 0) return false;
    const t = pick(cand);
    placed.push(t);
    tiles[t] = { num: t, type: T.TRAP, trap: trapType };
  }
  return true;
}

function placeLadders(tiles, holeReserved) {
  // 6 individual forward ladders. Each ladder drops the player STRAIGHT DOWN
  // to the same column, exactly one row below the origin. So for an origin
  // at grid (R, C) the destination is the path tile at (R+1, C).
  //   - origin: a NORMAL tile (excluding hole landings and boss approach 60..63)
  //   - destination: NORMAL or ITEM (no fight, trap, hole, boss, or other ladder)
  //   - non-adjacent (dest ≥ origin + 2) — rules out the row-turn corners
  //     where (R, C) and (R+1, C) are path-adjacent
  // Global constraints:
  //   - ≥1 origin in tiles 1..32 and ≥1 in tiles 33..63
  //   - max 2 ladder origins per row
  // Items are placed BEFORE this function so item destinations are valid.

  const candidates = [];
  for (let origin = 1; origin <= 59; origin++) {
    if (tiles[origin].type !== T.NORMAL) continue;
    if (holeReserved.has(origin)) continue;
    const { row: rOrig, col } = tileGridPos(origin);
    if (rOrig + 1 >= ROWS) continue; // last row has no level below
    const dest = gridPosToTile(rOrig + 1, col);
    if (dest === null) continue;
    if (dest <= origin || dest === 64) continue;
    if (dest - origin < 2) continue; // skip path-adjacent row-turn cases
    const dt = tiles[dest]?.type;
    if (dt !== T.NORMAL && dt !== T.ITEM) continue;
    candidates.push({ origin, dest });
  }
  if (candidates.length < 6) return null;

  for (let attempt = 0; attempt < 200; attempt++) {
    const pool = shuffle(candidates);
    const usedOrigins = new Set();
    const usedDests = new Set();
    const rowCounts = new Array(ROWS).fill(0);
    const chosen = [];
    let firstHalf = 0, secondHalf = 0;

    for (const cand of pool) {
      if (chosen.length >= 6) break;
      if (usedOrigins.has(cand.origin)) continue;
      // An origin can't double as another ladder's destination, and vice
      // versa — a ladder must never land on another ladder.
      if (usedDests.has(cand.origin)) continue;
      if (usedOrigins.has(cand.dest)) continue;
      // No two ladder origins may be on path-adjacent tiles.
      if (usedOrigins.has(cand.origin - 1) || usedOrigins.has(cand.origin + 1)) continue;
      const { row } = tileGridPos(cand.origin);
      if (rowCounts[row] >= 2) continue;

      chosen.push(cand);
      usedOrigins.add(cand.origin);
      usedDests.add(cand.dest);
      rowCounts[row]++;
      if (cand.origin <= 32) firstHalf++; else secondHalf++;
    }

    if (chosen.length === 6 && firstHalf >= 1 && secondHalf >= 1) {
      chosen.forEach((p, idx) => {
        tiles[p.origin] = {
          num: p.origin, type: T.LADDER, ladderId: idx, dest: p.dest,
        };
        // Tag the destination tile (preserves its original NORMAL or ITEM type).
        tiles[p.dest] = { ...tiles[p.dest], ladderDestFrom: p.origin };
      });
      return true;
    }
  }
  return null;
}

function validateBoard(tiles) {
  // Hard post-check the spec invariants that have caused regressions before.
  for (let i = 1; i <= 64; i++) {
    const t = tiles[i];
    if (t.type !== T.HOLE) continue;
    if (!t.dest) return false;
    // Destination must be tile 64 (overshoot) or column-aligned 1–2 rows down.
    const { row: rOrig, col } = tileGridPos(i);
    const expectedRow = rOrig + t.fallRows;
    if (expectedRow >= ROWS) {
      if (t.dest !== 64) return false;
    } else {
      const expected = gridPosToTile(expectedRow, col);
      if (t.dest !== expected) return false;
      const d = tiles[t.dest];
      if (!d || d.type !== T.NORMAL) return false;
    }
  }
  // Ladders: forward-only, land on NORMAL or ITEM, non-adjacent, ≤2 per row,
  // ≥1 in first half and ≥1 in second half.
  let ladderFirstHalf = 0, ladderSecondHalf = 0;
  const ladderRowCounts = new Array(ROWS).fill(0);
  for (let i = 1; i <= 64; i++) {
    const t = tiles[i];
    if (t.type !== T.LADDER) continue;
    if (!t.dest || t.dest <= i) return false;
    if (t.dest - i < 2) return false;
    const d = tiles[t.dest];
    if (!d) return false;
    if (d.type !== T.NORMAL && d.type !== T.ITEM) return false;
    // Spec: vertical one-level-down, same column.
    const { row: rOrig, col } = tileGridPos(i);
    const expected = gridPosToTile(rOrig + 1, col);
    if (t.dest !== expected) return false;
    if (i <= 32) ladderFirstHalf++; else ladderSecondHalf++;
    ladderRowCounts[tileGridPos(i).row]++;
  }
  if (ladderFirstHalf < 1 || ladderSecondHalf < 1) return false;
  for (const c of ladderRowCounts) if (c > 2) return false;
  // No two ladder origins on path-adjacent tiles.
  for (let i = 1; i < 64; i++) {
    if (tiles[i].type === T.LADDER && tiles[i + 1]?.type === T.LADDER) return false;
  }
  // Boss approach zone — tiles 60..63 stay normal.
  for (let i = 60; i <= 63; i++) {
    if (tiles[i].type !== T.NORMAL) return false;
  }
  return true;
}

function placeItems(tiles, reservedDest) {
  // 10 items; ≥2 must lie in tiles 1..32. Place on remaining normal tiles
  // excluding all reserved tiles (hole destinations + ladder destinations).
  const eligible = [];
  for (let i = 4; i <= 59; i++) {
    if (tiles[i].type !== T.NORMAL) continue;
    if (reservedDest.has(i)) continue;
    eligible.push(i);
  }
  if (eligible.length < 10) return false;

  const firstHalf = eligible.filter((t) => t <= 32);
  if (firstHalf.length < 2) return false;

  const placed = new Set();
  for (const t of shuffle(firstHalf)) {
    if (placed.size >= 2) break;
    placed.add(t);
  }
  for (const t of shuffle(eligible)) {
    if (placed.size >= 10) break;
    placed.add(t);
  }
  if (placed.size < 10) return false;

  for (const t of placed) {
    tiles[t] = { num: t, type: T.ITEM };
  }
  return true;
}

function tryGenerate() {
  const tiles = new Array(BOARD_SIZE + 1);
  for (let i = 1; i <= 63; i++) tiles[i] = { num: i, type: T.NORMAL };
  tiles[64] = { num: 64, type: T.BOSS };

  if (!placeFights(tiles)) return null;
  const holeReserved = placeHoles(tiles);
  if (holeReserved === null) return null;
  if (!placeTraps(tiles, holeReserved)) return null;
  // Items go BEFORE ladders so a ladder can land on an item tile (allowed by spec).
  if (!placeItems(tiles, holeReserved)) return null;
  if (!placeLadders(tiles, holeReserved)) return null;
  if (!validateBoard(tiles)) return null;
  return tiles;
}

function generateBoard() {
  const MAX = 1500;
  for (let attempt = 0; attempt < MAX; attempt++) {
    const t = tryGenerate();
    if (t) return { tiles: t, attempts: attempt + 1 };
  }
  return { tiles: null, attempts: MAX };
}

// =============================================================================
// RENDERING
// =============================================================================

function roadPathD() {
  let d = "";
  for (let n = 1; n <= 64; n++) {
    const { cx, cy } = tilePos(n);
    d += (n === 1 ? "M" : "L") + cx + "," + cy + " ";
  }
  return d.trim();
}

function NumBadge({ x, y, n, light }) {
  const fill = light ? PALETTE.textLight : PALETTE.text;
  return (
    <text x={x} y={y} fontSize="10" fontFamily="sans-serif" fontWeight="600" fill={fill}>
      {n}
    </text>
  );
}

function CenteredLabel({ cx, cy, text, fill, size = 11, weight = 700, dy = 0 }) {
  return (
    <text
      x={cx} y={cy + dy}
      fontSize={size}
      fontFamily="sans-serif"
      fontWeight={weight}
      fill={fill}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {text}
    </text>
  );
}

function TileRect({ tile }) {
  // Renders one tile as a rounded rectangle with type-specific styling.
  // Hole tiles handled separately as <Abyss>.
  const { x, y, cx, cy } = tilePos(tile.num);
  const n = tile.num;

  if (tile.type === T.HOLE) return null;

  if (tile.type === T.BOSS) {
    return (
      <g>
        <rect x={x - 2} y={y - 2} width={TILE + 4} height={TILE + 4} rx={10}
              fill="none" stroke={PALETTE.bossEdge} strokeWidth={3} />
        <rect x={x} y={y} width={TILE} height={TILE} rx={8}
              fill={PALETTE.boss} stroke={PALETTE.bossEdge} strokeWidth={2} />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy - 4} text="BOSS" fill={PALETTE.text} size={13} />
        <CenteredLabel cx={cx} cy={cy + 11} text="64" fill={PALETTE.text} size={11} weight={500} />
      </g>
    );
  }

  if (tile.type === T.FIGHT) {
    const c = NINJA[tile.ninja].color;
    return (
      <g>
        <rect x={x} y={y} width={TILE} height={TILE} rx={6}
              fill={c} stroke="#0a0a0a" strokeWidth={1.5} />
        <NumBadge x={x + 5} y={y + 13} n={n} light />
        <CenteredLabel cx={cx} cy={cy - 4} text="FIGHT" fill={PALETTE.textLight} size={11} />
        <CenteredLabel cx={cx} cy={cy + 10} text={NINJA[tile.ninja].short} fill={PALETTE.textLight} size={10} weight={500} />
      </g>
    );
  }

  if (tile.type === T.ITEM) {
    const isLadderDest = !!tile.ladderDestFrom;
    return (
      <g>
        <rect x={x} y={y} width={TILE} height={TILE} rx={6}
              fill={PALETTE.item} stroke={PALETTE.itemEdge} strokeWidth={1.5} />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy - 6} text="ITEM" fill={PALETTE.text} size={11} />
        <CenteredLabel cx={cx} cy={cy + 7} text="?" fill={PALETTE.text} size={14} weight={800} />
        {isLadderDest && (
          <CenteredLabel cx={cx} cy={cy + 22} text={`from ${tile.ladderDestFrom}`}
                         fill={PALETTE.text} size={9} weight={600} />
        )}
      </g>
    );
  }

  if (tile.type === T.LADDER) {
    return (
      <g>
        <rect x={x} y={y} width={TILE} height={TILE} rx={6}
              fill={PALETTE.ladder} stroke={PALETTE.ladderEdge} strokeWidth={1.5} />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy - 4} text="LADDER" fill={PALETTE.text} size={9} />
        <CenteredLabel cx={cx} cy={cy + 10} text={`↓ ${tile.dest}`} fill={PALETTE.text} size={12} weight={700} />
      </g>
    );
  }

  if (tile.type === T.TRAP) {
    // Phase 1: visible. (Spec says traps look identical to normal — will hide later.)
    return (
      <g>
        <rect x={x} y={y} width={TILE} height={TILE} rx={6}
              fill={PALETTE.trap} stroke={PALETTE.trapMark} strokeWidth={1.5}
              strokeDasharray="3 2" />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy - 4} text="TRAP" fill={PALETTE.trapMark} size={11} />
        <CenteredLabel cx={cx} cy={cy + 10} text={TRAP[tile.trap].short} fill={PALETTE.trapMark} size={9} weight={600} />
      </g>
    );
  }

  // NORMAL — possibly the landing point of a ladder (kept visually plain).
  const isLadderDest = !!tile.ladderDestFrom;
  return (
    <g>
      <rect x={x} y={y} width={TILE} height={TILE} rx={6}
            fill={PALETTE.normal} stroke={PALETTE.normalEdge} strokeWidth={1.2} />
      <NumBadge x={x + 5} y={y + 13} n={n} />
      {isLadderDest && (
        <CenteredLabel
          cx={cx} cy={cy + 8}
          text={`from ${tile.ladderDestFrom}`}
          fill={PALETTE.text} size={9} weight={600}
        />
      )}
    </g>
  );
}

function Abyss({ tile }) {
  // Irregular dark shape replacing the tile + breaking the road.
  const { x, y, cx, cy } = tilePos(tile.num);
  // Build a jagged polygon roughly matching the tile bounds.
  const r = TILE / 2 + 4;
  const pts = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const jitter = 0.78 + ((i * 37) % 100) / 360; // pseudo-random but deterministic per tile
    const rr = r * jitter;
    pts.push(`${(cx + Math.cos(ang) * rr).toFixed(1)},${(cy + Math.sin(ang) * rr).toFixed(1)}`);
  }
  return (
    <g>
      <polygon points={pts.join(" ")} fill={PALETTE.abyss} stroke={PALETTE.abyssEdge} strokeWidth={2} />
      <NumBadge x={x + 5} y={y + 13} n={tile.num} light />
      <CenteredLabel cx={cx} cy={cy - 3} text="HOLE" fill={PALETTE.textLight} size={11} />
      <CenteredLabel cx={cx} cy={cy + 11} text={`↓ ${tile.dest}`} fill={PALETTE.textLight} size={10} weight={600} />
    </g>
  );
}

function LadderConnector({ originTile, destTile }) {
  // Two parallel rails + rungs running the full length between origin and
  // destination tile centers. Rails are wider apart and more saturated than
  // before so they read clearly between the tiles.
  const a = tilePos(originTile);
  const b = tilePos(destTile);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const off = 11;                     // half-width of the ladder
  const ax1 = a.cx + px * off, ay1 = a.cy + py * off;
  const ax2 = a.cx - px * off, ay2 = a.cy - py * off;
  const bx1 = b.cx + px * off, by1 = b.cy + py * off;
  const bx2 = b.cx - px * off, by2 = b.cy - py * off;

  // Rung count proportional to length — denser ladder reads better.
  const rungs = Math.max(4, Math.round(len / 14));
  const rungLines = [];
  for (let i = 1; i <= rungs; i++) {
    const t = i / (rungs + 1);
    const r1x = ax1 + (bx1 - ax1) * t;
    const r1y = ay1 + (by1 - ay1) * t;
    const r2x = ax2 + (bx2 - ax2) * t;
    const r2y = ay2 + (by2 - ay2) * t;
    rungLines.push(
      <line key={i} x1={r1x} y1={r1y} x2={r2x} y2={r2y}
            stroke={PALETTE.ladderEdge} strokeWidth={2.2} opacity={0.85} />
    );
  }
  return (
    <g>
      <line x1={ax1} y1={ay1} x2={bx1} y2={by1}
            stroke={PALETTE.ladderEdge} strokeWidth={3} opacity={0.85}
            strokeLinecap="round" />
      <line x1={ax2} y1={ay2} x2={bx2} y2={by2}
            stroke={PALETTE.ladderEdge} strokeWidth={3} opacity={0.85}
            strokeLinecap="round" />
      {rungLines}
    </g>
  );
}

function PathArrows({ tiles }) {
  // One arrow line per inter-tile segment. The line spans the gap between
  // two consecutive tiles and ends in an arrowhead pointing toward the next
  // tile. Drawn for every segment, including ones whose endpoints are holes.
  void tiles; // arrows do not depend on tile contents anymore
  const arrows = [];
  for (let n = 1; n < 64; n++) {
    const a = tilePos(n);
    const b = tilePos(n + 1);
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Start just outside tile A's edge, end just inside tile B's edge so the
    // arrowhead tip sits in the gap rather than under the next tile.
    const startInset = TILE / 2 + 4;
    const endInset = TILE / 2 + 8;
    const x1 = a.cx + ux * startInset;
    const y1 = a.cy + uy * startInset;
    const x2 = b.cx - ux * endInset;
    const y2 = b.cy - uy * endInset;
    arrows.push(
      <line
        key={n}
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={PALETTE.roadStripe}
        strokeWidth={3}
        strokeLinecap="round"
        markerEnd="url(#path-arrow)"
        opacity={0.95}
      />
    );
  }
  return arrows;
}

// =============================================================================
// BOARD COMPONENT
// =============================================================================

function Board({ tiles }) {
  const ladderLinks = useMemo(() => {
    const links = [];
    for (let i = 1; i <= 64; i++) {
      const t = tiles[i];
      if (t.type !== T.LADDER) continue;
      links.push({ origin: i, dest: t.dest });
    }
    return links;
  }, [tiles]);

  const d = roadPathD();

  return (
    <svg
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      width="100%"
      style={{ maxWidth: BOARD_W, display: "block", background: PALETTE.bg, borderRadius: 12 }}
    >
      <defs>
        <marker
          id="path-arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="5" markerHeight="5" orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={PALETTE.roadStripe}
                stroke={PALETTE.roadEdge} strokeWidth={0.5} />
        </marker>
      </defs>

      {/* Road, three layers + dashed center stripe to read like an actual road. */}
      <path d={d} fill="none" stroke={PALETTE.roadEdge} strokeWidth={ROAD_OUTER}
            strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={PALETTE.road} strokeWidth={ROAD_INNER}
            strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={PALETTE.roadInner} strokeWidth={ROAD_LIGHT}
            strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />

      {/* Direction arrows along each segment of the path. */}
      <PathArrows tiles={tiles} />

      {/* Ladder connectors (origin → destination), drawn under tiles. */}
      {ladderLinks.map(({ origin, dest }, i) => (
        <LadderConnector key={i} originTile={origin} destTile={dest} />
      ))}

      {/* Tiles */}
      {Array.from({ length: 64 }, (_, i) => i + 1).map((n) => (
        <TileRect key={n} tile={tiles[n]} />
      ))}

      {/* Holes drawn after tiles so abyss visually breaks the road */}
      {Array.from({ length: 64 }, (_, i) => i + 1)
        .filter((n) => tiles[n].type === T.HOLE)
        .map((n) => <Abyss key={`h${n}`} tile={tiles[n]} />)}
    </svg>
  );
}

// =============================================================================
// INFO PANEL — verifies generation
// =============================================================================

function summarize(tiles) {
  const counts = { normal: 0, fight: 0, item: 0, ladder: 0, hole: 0, trap: 0, boss: 0 };
  const ninjaCounts = { black: 0, fire: 0, shadow: 0, demon: 0 };
  const trapList = [];
  const holeList = [];
  const ladderList = [];
  for (let i = 1; i <= 64; i++) {
    const t = tiles[i];
    counts[t.type]++;
    if (t.type === T.FIGHT) ninjaCounts[t.ninja]++;
    if (t.type === T.TRAP) trapList.push({ tile: i, trap: t.trap });
    if (t.type === T.HOLE) holeList.push({ tile: i, fallRows: t.fallRows, dest: t.dest });
    if (t.type === T.LADDER) {
      ladderList.push({ origin: i, dest: t.dest, destType: tiles[t.dest].type });
    }
  }
  ladderList.sort((a, b) => a.origin - b.origin);
  return { counts, ninjaCounts, trapList, holeList, ladderList };
}

function InfoPanel({ tiles, attempts, onRegenerate }) {
  const s = summarize(tiles);
  const row = (k, v, expected) => {
    const ok = v === expected;
    return (
      <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
        <span>{k}</span>
        <span style={{ color: ok ? "#1c6f2c" : "#a8261b", fontWeight: 600 }}>
          {v}{expected != null ? ` / ${expected}` : ""}
        </span>
      </div>
    );
  };
  return (
    <div style={{
      fontFamily: "sans-serif", fontSize: 12,
      background: "#fff8e7", border: "1px solid #c4ad7b", borderRadius: 8,
      padding: 14, color: PALETTE.text, minWidth: 220,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Generation Report</strong>
        <span style={{ color: "#7a5d00" }}>attempts: {attempts}</span>
      </div>
      <div style={{ borderTop: "1px solid #d8c79a", paddingTop: 6 }}>
        {row("Normal", s.counts.normal, 28)}
        {row("Fight", s.counts.fight, 12)}
        {row("Item", s.counts.item, 10)}
        {row("Ladder", s.counts.ladder, 6)}
        {row("Trap", s.counts.trap, 4)}
        {row("Hole", s.counts.hole, 3)}
        {row("Boss", s.counts.boss, 1)}
      </div>
      <div style={{ borderTop: "1px solid #d8c79a", marginTop: 8, paddingTop: 6 }}>
        <strong>Ninjas</strong>
        {row("Black", s.ninjaCounts.black)}
        {row("Fire", s.ninjaCounts.fire)}
        {row("Shadow", s.ninjaCounts.shadow)}
        {row("Demon", s.ninjaCounts.demon)}
      </div>
      <div style={{ borderTop: "1px solid #d8c79a", marginTop: 8, paddingTop: 6 }}>
        <strong>Holes</strong>
        {s.holeList.map((h) => (
          <div key={h.tile} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>tile {h.tile} ({h.fallRows}-row)</span>
            <span>→ {h.dest}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #d8c79a", marginTop: 8, paddingTop: 6 }}>
        <strong>Traps</strong>
        {s.trapList.map((t) => (
          <div key={t.tile} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>tile {t.tile}</span>
            <span>{TRAP[t.trap].name}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid #d8c79a", marginTop: 8, paddingTop: 6 }}>
        <strong>Ladders</strong>
        {s.ladderList.map((l, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>tile {l.origin}</span>
            <span>↓ {l.dest}{l.destType === T.ITEM ? " (item)" : ""}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onRegenerate}
        style={{
          marginTop: 12, width: "100%", padding: "8px 12px",
          background: "#7a5500", color: "#fff8e7", border: "none",
          borderRadius: 6, fontWeight: 600, cursor: "pointer", fontSize: 13,
        }}
      >
        Regenerate Board
      </button>
    </div>
  );
}

// =============================================================================
// TOP-LEVEL COMPONENT
// =============================================================================

export default function ShaolinGame() {
  const [board, setBoard] = useState(() => generateBoard());

  if (!board.tiles) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif", color: "#a8261b" }}>
        Board generation failed after {board.attempts} attempts.
        <button onClick={() => setBoard(generateBoard())}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", padding: 20, background: "#1f1a10",
      fontFamily: "Georgia, serif", color: "#fdf6e3",
    }}>
      <h1 style={{ margin: "0 0 4px 0", letterSpacing: 1 }}>
        Shaolin Master vs The Shadow Clan
      </h1>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        Phase 1 — Board generation
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Board tiles={board.tiles} />
        </div>
        <div style={{ flex: "0 0 auto" }}>
          <InfoPanel
            tiles={board.tiles}
            attempts={board.attempts}
            onRegenerate={() => setBoard(generateBoard())}
          />
        </div>
      </div>
    </div>
  );
}
