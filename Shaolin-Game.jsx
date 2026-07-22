import { useState, useMemo, useEffect, useRef } from "react";
import bambooBackground from "./IMAGES/Bamboo.jpg";
import { getFinalStory } from "./FinalStories.js";
import { getGameStartStory } from "./GameStartStory.js";

// Eagerly import every pose image. Images live in per-character subfolders
// under IMAGES/. File names follow these patterns:
//   Player hero base:  "{Type}-{height}-{character}.png"  (character: shaolin | ninja)
//   Player hero extra: "Extra-{Name1}-{name2}-strike-{height}-{character}.png"
//   Computer enemy:    the same patterns, prefixed "Computer-", with a compound
//                      character "{kind}-ninja" (black | shadow | fire | demon).
// We strip the leading "Computer-" so a file like
// "Computer-Strike-high-black-ninja.png" keys exactly to its lookup
// "strike-high-black-ninja".
const ALL_POSE_IMAGE_MODULES = import.meta.glob("./IMAGES/**/*.png", {
  eager: true,
  import: "default",
});
const POSE_IMAGES = {};
const EXTRA_POSE_IMAGES = {};
// Illustration images for the item-found, ladder, and trap modals live under
// IMAGES/Modals/{Items,Ladder,Traps}/. Each file is keyed by its sorcery or
// trap id (lowercase, e.g. "magic_compass", "hold"), so a modal can look it
// up directly without any naming gymnastics.
const MODAL_IMAGES = {
  items: {},
  traps: {},
  ladder: null,
  finalDuel: null,
  finalDuelWin: { shaolin: null, ninja: null },
  gameStart: null,
};
for (const path in ALL_POSE_IMAGE_MODULES) {
  const mod = ALL_POSE_IMAGE_MODULES[path];
  if (path.includes("/Modals/")) {
    const id = path.split("/").pop().replace(/\.png$/i, "").toLowerCase();
    if (path.includes("/Modals/Items/")) MODAL_IMAGES.items[id] = mod;
    else if (path.includes("/Modals/Traps/")) MODAL_IMAGES.traps[id] = mod;
    else if (path.includes("/Modals/Ladder/")) MODAL_IMAGES.ladder = mod;
    else if (path.includes("/Modals/Final-duel/")) {
      if (id === "shaolin-wins") MODAL_IMAGES.finalDuelWin.shaolin = mod;
      else if (id === "ninja-wins") MODAL_IMAGES.finalDuelWin.ninja = mod;
      else MODAL_IMAGES.finalDuel = mod;
    }
    else if (path.includes("/Modals/Game-start/")) MODAL_IMAGES.gameStart = mod;
    continue;
  }
  let file = path.split("/").pop().replace(/\.png$/i, "").toLowerCase();
  if (file.startsWith("computer-")) file = file.slice("computer-".length);
  const parts = file.split("-");
  if (parts[0] === "extra") {
    // "extra-thunder-dragon-strike-high-shaolin"    → id thunder_dragon, char shaolin
    // "extra-demon-claw-strike-high-black-ninja"    → id demon_claw,     char black-ninja
    const id = `${parts[1]}_${parts[2]}`;
    const character = parts.slice(5).join("-");
    EXTRA_POSE_IMAGES[`${id}-${character}`] = mod;
    // The player hero version also gets a character-agnostic key, since the
    // inventory thumbnails look extras up by id alone and only ever show the hero.
    if (character === "shaolin" || character === "ninja") {
      EXTRA_POSE_IMAGES[id] = mod;
    }
  } else {
    // base pose: "strike-high-shaolin" / "strike-high-black-ninja"
    POSE_IMAGES[file] = mod;
  }
}

function poseImageFor(character, pose) {
  if (!pose || !character) return null;
  if (pose.id) {
    const qualified = EXTRA_POSE_IMAGES[`${pose.id}-${character}`.toLowerCase()];
    if (qualified) return qualified;
    if (EXTRA_POSE_IMAGES[pose.id]) return EXTRA_POSE_IMAGES[pose.id];
  }
  const key = `${pose.type}-${pose.height}-${character}`.toLowerCase();
  return POSE_IMAGES[key] || null;
}

// Warm the browser's image cache once at module init. Vite's eager glob hands
// us URL strings, but the browser only fetches + decodes a PNG when an <img>
// element first renders it — that's the ~0.5–1.5s stall on the first time a
// modal or battle pose opens. Kicking off a fetch and a background decode for
// every URL up front means the cache (and decoded bitmap, where supported) is
// already warm by the time React mounts the <img>.
if (typeof window !== "undefined") {
  const allUrls = new Set([
    bambooBackground,
    ...Object.values(POSE_IMAGES),
    ...Object.values(EXTRA_POSE_IMAGES),
    ...Object.values(MODAL_IMAGES.items),
    ...Object.values(MODAL_IMAGES.traps),
    MODAL_IMAGES.ladder,
    MODAL_IMAGES.finalDuel,
    MODAL_IMAGES.finalDuelWin.shaolin,
    MODAL_IMAGES.finalDuelWin.ninja,
    MODAL_IMAGES.gameStart,
  ].filter(Boolean));
  // Retain references to the preloaded Image objects on the global module so
  // the browser keeps the decoded bitmap in memory instead of evicting it once
  // each `new Image()` goes out of scope.
  const preloaded = [];
  for (const url of allUrls) {
    const img = new Image();
    img.src = url;
    if (typeof img.decode === "function") {
      img.decode().catch(() => {});
    }
    preloaded.push(img);
  }
  // eslint-disable-next-line no-undef
  if (typeof window !== "undefined") window.__SHAOLIN_PRELOADED_IMAGES__ = preloaded;
}

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
  hold:                { name: "Hold",                short: "Hold"    },
  sorcery_theft:       { name: "Sorcery Theft",       short: "S-Theft" },
  pose_theft:          { name: "Pose Theft",          short: "P-Theft" },
  setback:             { name: "Setback",             short: "Back"    },
  battle_log_modifier: { name: "Battle Log Modifier", short: "Curse"   },
  pose_lock:           { name: "Pose Lock",           short: "Lock"    },
  rivals_tribute:     { name: "Rival's Tribute",     short: "Tribute" },
};

const ALL_TRAP_TYPES = ["hold", "sorcery_theft", "pose_theft", "setback", "battle_log_modifier", "pose_lock", "rivals_tribute"];

const TRAP_INFO = {
  hold: {
    icon: "⛓️",
    title: "Hold",
    flavor: "Spectral hands seize the air around you — you cannot move on your next turn.",
  },
  sorcery_theft: {
    icon: "🗝️",
    title: "Sorcery Theft",
    flavor: "A shadowy thief slips from the shadows, seeking what you carry.",
  },
  pose_theft: {
    icon: "📜",
    title: "Pose Theft",
    flavor: "An ancient seal unfurls, hungry to suppress one of your secret techniques.",
  },
  setback: {
    icon: "🌀",
    title: "Setback",
    flavor: "A sudden gust sweeps you backward along the path.",
  },
  battle_log_modifier: {
    icon: "📖",
    title: "Curse of Forgetting",
    flavor: "A dark hex twists memory itself — your triumphs threaten to fade.",
  },
  pose_lock: {
    icon: "🔒",
    title: "Pose Lock",
    flavor: "Iron chains bind one of your stances — it will not answer your call.",
  },
  rivals_tribute: {
    icon: "🤲",
    title: "Rival's Tribute",
    flavor: "An unseen pact wrests a treasure from your grasp and bears it to your rival.",
  },
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
// Extra width ensures rounded corners (linejoin="round", radius = strokeWidth/2)
// have at least ~12 px clearance from tile corners (tile half-diagonal ≈ 49.5 px).
const ROAD_OUTER = TILE + 54;   // radius 62 — corner clearance ≈ 12.5 px
const ROAD_INNER = TILE + 42;   // 6 px dark border each side
const ROAD_LIGHT = TILE + 30;   // 6 px road inner band each side

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
  // 3 holes total, all with fallRows=1.
  //
  // Origin restrictions:
  //   - Origin must be in tiles 6..56 (no holes in 1..5 or 57..64).
  //   - Tile 49 is forbidden — its 1-row fall lands on the boss tile 64.
  //   - No hole's destination may be the boss tile 64.
  //
  // Spacing:
  //   - No two hole origins on adjacent tiles.
  //   - A hole's origin may not coincide with another hole's destination
  //     (and vice versa) — no chained falls.
  //
  // Other:
  //   - Destination tile must currently be NORMAL (no fights placed there).
  //   - At least one normal/item tile must lie between origin and dest.
  //   - Trap-distance constraint is enforced later in placeTraps.
  const eligible = [];
  for (let i = 6; i <= 56; i++) {
    if (i === 49) continue;
    if (tiles[i].type === T.NORMAL) eligible.push(i);
  }

  const placed = []; // { origin, dest, fallRows }
  const reserved = new Set();

  function pickFor(origin, allowedFalls) {
    const { row: rOrig, col } = tileGridPos(origin);
    for (const fallRows of allowedFalls) {
      const targetRow = rOrig + fallRows;
      if (targetRow >= ROWS) continue;        // never overshoot onto boss
      const dest = gridPosToTile(targetRow, col);
      if (dest === null || dest === 64) continue;
      if (dest <= origin) continue;
      if (tiles[dest].type !== T.NORMAL) continue;
      if (reserved.has(dest)) continue;
      let hasIntermediate = false;
      for (let p = origin + 1; p < dest; p++) {
        if (tiles[p].type === T.NORMAL) { hasIntermediate = true; break; }
      }
      if (!hasIntermediate) continue;
      return { origin, dest, fallRows };
    }
    return null;
  }

  function spacedAndFree(origin) {
    if (reserved.has(origin)) return false;   // not on someone else's landing
    for (const p of placed) {
      if (Math.abs(p.origin - origin) < 2) return false; // no adjacent holes
    }
    return true;
  }

  // Place three 1-row holes.
  for (const origin of shuffle(eligible)) {
    if (placed.length >= 3) break;
    if (!spacedAndFree(origin)) continue;
    const chosen = pickFor(origin, [1]);
    if (!chosen) continue;
    placed.push(chosen);
    reserved.add(chosen.dest);
  }

  if (placed.length < 3) return null;
  for (const p of placed) {
    tiles[p.origin] = { num: p.origin, type: T.HOLE, fallRows: p.fallRows, dest: p.dest };
  }
  return reserved;
}

function placeTraps(tiles, reserved) {
  // 5 traps total. At generation we randomly pick 5 trap types from the pool
  // of 7 (ALL_TRAP_TYPES) and assign one to each placed tile. Eligible 6..59.
  // No within 2 of fight or hole. No two trap tiles adjacent.
  // Skips tiles reserved as hole landing points (must remain normal).
  // Must come AFTER the first item tile — i.e. no trap may precede the first
  // item on the path. (Items are placed before traps for this reason.)
  const fights = [];
  const holes = [];
  let firstItem = Infinity;
  for (let i = 1; i <= 64; i++) {
    if (tiles[i].type === T.FIGHT) fights.push(i);
    if (tiles[i].type === T.HOLE) holes.push(i);
    if (tiles[i].type === T.ITEM && i < firstItem) firstItem = i;
  }

  function eligibleFor(alreadyPlaced) {
    const result = [];
    for (let i = 6; i <= 59; i++) {
      if (i < firstItem) continue;
      if (tiles[i].type !== T.NORMAL) continue;
      if (reserved.has(i)) continue;
      let bad = false;
      for (const f of fights) if (Math.abs(f - i) <= 2) { bad = true; break; }
      if (bad) continue;
      for (const h of holes) if (Math.abs(h - i) <= 2) { bad = true; break; }
      if (bad) continue;
      for (const p of alreadyPlaced) if (Math.abs(p - i) <= 1) { bad = true; break; }
      if (bad) continue;
      result.push(i);
    }
    return result;
  }

  // Random sample of 5 trap types from the 7 available, each appearing once.
  const selectedTypes = shuffle(ALL_TRAP_TYPES).slice(0, 5);
  const placed = [];
  for (const trapType of selectedTypes) {
    const cand = eligibleFor(placed);
    if (cand.length === 0) return false;
    const t = pick(cand);
    placed.push(t);
    tiles[t] = { num: t, type: T.TRAP, trap: trapType };
  }
  return true;
}

function placeLadders(tiles, holeReserved) {
  // 6 ladder tiles arranged as a fixed mix of directional ladders. Every
  // ladder connects two tiles one row apart in the SAME column:
  //   - 2 DOWN-only ladders: an origin tile that climbs DOWN to (R+1, C).
  //   - 2 UP-only ladders:   an origin tile that climbs UP   to (R-1, C).
  //   - 1 BOTH-WAY ladder:   a vertical pair of tiles that are BOTH ladder
  //       tiles. The top tile climbs down to the bottom tile, the bottom
  //       tile climbs up to the top tile. It occupies 2 of the 6 ladder
  //       tiles and visually reads as a single ladder linking two ladder
  //       tiles (so it never lands on an item).
  // For DOWN/UP ladders the destination is a NORMAL or ITEM tile (landing on
  // an item is allowed). All ladders must be path-non-adjacent (|a - b| ≥ 2),
  // ruling out the row-turn corners where the vertical neighbour is already
  // path-adjacent. Shared rules:
  //   - a ladder tile is a NORMAL tile, excluding tile 1, hole landings, and
  //     the boss approach 60..63 (origin range 2..59)
  //   - ≥1 ladder tile in tiles 1..32 and ≥1 in tiles 33..63
  //   - max 2 ladder tiles per row; no two ladder tiles path-adjacent
  //   - a DOWN/UP ladder never lands on another ladder tile
  // Items are placed BEFORE this function so item destinations are valid.

  const upOf = (n) => { const { row, col } = tileGridPos(n); return row > 0 ? gridPosToTile(row - 1, col) : null; };
  const downOf = (n) => { const { row, col } = tileGridPos(n); return row < ROWS - 1 ? gridPosToTile(row + 1, col) : null; };
  const freeNormal = (n) =>
    n != null && n >= 2 && n <= 59 && tiles[n]?.type === T.NORMAL && !holeReserved.has(n);
  const landable = (n) =>
    n != null && n !== 64 && (tiles[n]?.type === T.NORMAL || tiles[n]?.type === T.ITEM);

  // Candidate lists (origin tiles).
  const downCands = [];
  const upCands = [];
  const bothCands = []; // { top, bottom }
  for (let o = 2; o <= 59; o++) {
    if (tiles[o].type !== T.NORMAL || holeReserved.has(o)) continue;
    const d = downOf(o);
    const u = upOf(o);
    if (landable(d) && Math.abs(d - o) >= 2) downCands.push({ origin: o, dest: d });
    if (landable(u) && Math.abs(u - o) >= 2) upCands.push({ origin: o, dest: u });
    // Both-way: o is the TOP tile, downOf(o) the BOTTOM — both must be free
    // NORMAL tiles (they will both become ladder tiles).
    if (freeNormal(o) && freeNormal(d) && Math.abs(d - o) >= 2) {
      bothCands.push({ top: o, bottom: d });
    }
  }

  for (let attempt = 0; attempt < 400; attempt++) {
    const used = new Set();      // every ladder tile (origins + both endpoints)
    const usedDest = new Set();  // landing tiles of DOWN/UP ladders
    const rowCount = new Array(ROWS).fill(0);
    const placements = [];       // { tile, kind, climbDir, dest }

    const claimTile = (n) => {
      if (!freeNormal(n) || used.has(n) || usedDest.has(n)) return false;
      if (used.has(n - 1) || used.has(n + 1)) return false; // no path-adjacent ladders
      if (rowCount[tileGridPos(n).row] >= 2) return false;
      return true;
    };

    // 1) BOTH-WAY pair first (the tightest constraint — two adjacent tiles).
    let ok = true;
    const bp = shuffle(bothCands).find((c) => claimTile(c.top) && claimTile(c.bottom));
    if (!bp) continue;
    used.add(bp.top); used.add(bp.bottom);
    rowCount[tileGridPos(bp.top).row]++;
    rowCount[tileGridPos(bp.bottom).row]++;
    placements.push({ tile: bp.top, kind: "both", climbDir: "down", dest: bp.bottom });
    placements.push({ tile: bp.bottom, kind: "both", climbDir: "up", dest: bp.top });

    // 2) Place N directional ladders from a candidate pool.
    const placeDirectional = (cands, kind, climbDir, count) => {
      let placed = 0;
      for (const c of shuffle(cands)) {
        if (placed >= count) break;
        if (!claimTile(c.origin)) continue;
        // The landing tile must stay a non-ladder NORMAL/ITEM tile and not be
        // shared with another ladder.
        if (used.has(c.dest) || usedDest.has(c.dest)) continue;
        if (tiles[c.dest].type !== T.NORMAL && tiles[c.dest].type !== T.ITEM) continue;
        used.add(c.origin);
        usedDest.add(c.dest);
        rowCount[tileGridPos(c.origin).row]++;
        placements.push({ tile: c.origin, kind, climbDir, dest: c.dest });
        placed++;
      }
      return placed === count;
    };

    if (!placeDirectional(downCands, "down", "down", 2)) ok = false;
    if (ok && !placeDirectional(upCands, "up", "up", 2)) ok = false;
    if (!ok) continue;

    // 3) Global balance: ≥1 ladder tile in each half.
    let firstHalf = 0, secondHalf = 0;
    for (const p of placements) (p.tile <= 32 ? firstHalf++ : secondHalf++);
    if (firstHalf < 1 || secondHalf < 1) continue;

    // Commit.
    for (const p of placements) {
      tiles[p.tile] = {
        num: p.tile, type: T.LADDER, ladderKind: p.kind,
        climbDir: p.climbDir, dest: p.dest,
      };
    }
    // Tag DOWN/UP landing tiles (preserves their NORMAL/ITEM type).
    for (const p of placements) {
      if (p.kind !== "both") tiles[p.dest] = { ...tiles[p.dest], ladderDestFrom: p.tile };
    }
    return true;
  }
  return null;
}

function validateBoard(tiles) {
  // Hard post-check the spec invariants that have caused regressions before.
  const holeOrigins = [];
  let oneRowHoles = 0;
  for (let i = 1; i <= 64; i++) {
    const t = tiles[i];
    if (t.type !== T.HOLE) continue;
    if (!t.dest) return false;
    if (t.dest === 64) return false;            // never fall onto the boss
    if (i === 49) return false;                 // forbidden origin
    if (i < 6 || i > 56) return false;          // origin must be in 6..56
    if (t.fallRows !== 1) return false;          // all holes are 1-row
    const { row: rOrig, col } = tileGridPos(i);
    const expectedRow = rOrig + t.fallRows;
    if (expectedRow >= ROWS) return false;       // overshoot is not permitted
    const expected = gridPosToTile(expectedRow, col);
    if (t.dest !== expected) return false;
    const d = tiles[t.dest];
    if (!d || d.type !== T.NORMAL) return false;
    oneRowHoles++;
    holeOrigins.push(i);
  }
  if (oneRowHoles !== 3) return false;
  holeOrigins.sort((a, b) => a - b);
  for (let i = 1; i < holeOrigins.length; i++) {
    if (holeOrigins[i] - holeOrigins[i - 1] < 2) return false;
  }
  // Ladders: a fixed mix of 2 DOWN-only, 2 UP-only, and 1 BOTH-WAY ladder
  // (the both-way occupies 2 mutually-linked ladder tiles). Every ladder
  // links two tiles one row apart in the same column, path-non-adjacent.
  // DOWN/UP land on a NORMAL or ITEM tile; the both-way pair link each other.
  // ≤2 ladder tiles per row, ≥1 in each half, no two ladder tiles
  // path-adjacent, and DOWN/UP never land on another ladder tile.
  let ladderFirstHalf = 0, ladderSecondHalf = 0;
  let downCount = 0, upCount = 0, bothCount = 0;
  const ladderRowCounts = new Array(ROWS).fill(0);
  for (let i = 1; i <= 64; i++) {
    const t = tiles[i];
    if (t.type !== T.LADDER) continue;
    const { row, col } = tileGridPos(i);
    const expUp   = row > 0        ? gridPosToTile(row - 1, col) : null;
    const expDown = row < ROWS - 1 ? gridPosToTile(row + 1, col) : null;
    const expected = t.climbDir === "up" ? expUp : expDown;
    if (t.dest == null || t.dest !== expected) return false;
    if (Math.abs(t.dest - i) < 2) return false;
    const d = tiles[t.dest];
    if (!d) return false;
    if (t.ladderKind === "both") {
      // Both-way tiles link each other and must be opposite directions.
      if (d.type !== T.LADDER || d.ladderKind !== "both") return false;
      if (d.dest !== i) return false;
      if (d.climbDir === t.climbDir) return false;
      bothCount++;
    } else {
      // DOWN/UP land on a non-ladder NORMAL or ITEM tile.
      if (d.type !== T.NORMAL && d.type !== T.ITEM) return false;
      if (t.ladderKind === "down" && t.climbDir !== "down") return false;
      if (t.ladderKind === "up" && t.climbDir !== "up") return false;
      if (t.climbDir === "down") downCount++; else upCount++;
    }
    if (i <= 32) ladderFirstHalf++; else ladderSecondHalf++;
    ladderRowCounts[row]++;
  }
  if (downCount !== 2 || upCount !== 2 || bothCount !== 2) return false;
  if (ladderFirstHalf < 1 || ladderSecondHalf < 1) return false;
  for (const c of ladderRowCounts) if (c > 2) return false;
  // No two ladder tiles on path-adjacent positions.
  for (let i = 1; i < 64; i++) {
    if (tiles[i].type === T.LADDER && tiles[i + 1]?.type === T.LADDER) return false;
  }
  // Boss approach zone — tiles 60..63 stay normal.
  for (let i = 60; i <= 63; i++) {
    if (tiles[i].type !== T.NORMAL) return false;
  }
  // Tile 1 (start) must not be a ladder.
  if (tiles[1].type === T.LADDER) return false;
  // Every row must contain at least one item tile.
  const itemRows = new Set();
  let itemCount = 0;
  for (let i = 1; i <= 64; i++) {
    if (tiles[i].type === T.ITEM) {
      itemRows.add(tileGridPos(i).row);
      itemCount++;
    }
  }
  if (itemCount !== 12) return false;
  for (let r = 0; r < ROWS; r++) {
    if (!itemRows.has(r)) return false;
  }
  // Trap count must be 5.
  let trapCount = 0;
  for (let i = 1; i <= 64; i++) if (tiles[i].type === T.TRAP) trapCount++;
  if (trapCount !== 5) return false;
  return true;
}

function placeItems(tiles, reservedDest) {
  // 12 items. Every row of the board must contain at least one item — the
  // per-row guarantee implicitly handles the legacy "≥2 in tiles 1..32" rule
  // because rows 0..3 cover tiles 1..32 (so they contribute ≥4 items in the
  // first half). Eligible tiles are normal, in 4..59, and not reserved (hole
  // destinations).
  const eligible = [];
  for (let i = 4; i <= 59; i++) {
    if (tiles[i].type !== T.NORMAL) continue;
    if (reservedDest.has(i)) continue;
    eligible.push(i);
  }
  if (eligible.length < 12) return false;

  const byRow = Array.from({ length: ROWS }, () => []);
  for (const t of eligible) byRow[tileGridPos(t).row].push(t);
  for (let r = 0; r < ROWS; r++) {
    if (byRow[r].length === 0) return false; // can't guarantee coverage in this row
  }

  const placed = new Set();
  // 1) Reserve one item per row so every row is covered.
  for (let r = 0; r < ROWS; r++) {
    placed.add(pick(byRow[r]));
  }
  // 2) Fill remaining slots up to 12 from anywhere in the eligible pool.
  for (const t of shuffle(eligible)) {
    if (placed.size >= 12) break;
    placed.add(t);
  }
  if (placed.size < 12) return false;

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
  // Items go BEFORE traps so traps can be constrained to lie after the first
  // item tile, and BEFORE ladders so a ladder can land on an item tile.
  if (!placeItems(tiles, holeReserved)) return null;
  if (!placeTraps(tiles, holeReserved)) return null;
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
    const pinkFill = "#ff77a8";
    const pinkEdge = "#b8336a";
    return (
      <g>
        <rect x={x - 2} y={y - 2} width={TILE + 4} height={TILE + 4} rx={10}
              fill="none" stroke={pinkEdge} strokeWidth={3} />
        <rect x={x} y={y} width={TILE} height={TILE} rx={8}
              fill={pinkFill} stroke={pinkEdge} strokeWidth={2} />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy - 8} text="♔" fill={PALETTE.text} size={18} />
        <CenteredLabel cx={cx} cy={cy + 10} text="DUEL" fill={PALETTE.text} size={11} />
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
        <CenteredLabel cx={cx} cy={cy - 8} text="⚔" fill={PALETTE.textLight} size={16} />
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
        <CenteredLabel cx={cx} cy={cy - 8} text="✦" fill={PALETTE.text} size={16} />
        <CenteredLabel cx={cx} cy={cy + 10} text="ITEM" fill={PALETTE.text} size={11} />
        {isLadderDest && (
          <CenteredLabel cx={cx} cy={cy + 22} text={`from ${tile.ladderDestFrom}`}
                         fill={PALETTE.text} size={9} weight={600} />
        )}
      </g>
    );
  }

  if (tile.type === T.LADDER) {
    const arrow = tile.climbDir === "up" ? "↑" : "↓";
    const label = tile.ladderKind === "both" ? "LADDER ⇅" : "LADDER";
    return (
      <g>
        <rect x={x} y={y} width={TILE} height={TILE} rx={6}
              fill={PALETTE.ladder} stroke={PALETTE.ladderEdge} strokeWidth={1.5} />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy - 4} text={label} fill={PALETTE.text} size={9} />
        <CenteredLabel cx={cx} cy={cy + 10} text={`${arrow} ${tile.dest}`} fill={PALETTE.text} size={12} weight={700} />
      </g>
    );
  }

  if (tile.type === T.TRAP) {
    // Dev-only visibility. The actual trap type is drawn per-player at landing time,
    // so we no longer show a fixed sub-label here.
    return (
      <g>
        <rect x={x} y={y} width={TILE} height={TILE} rx={6}
              fill={PALETTE.trap} stroke={PALETTE.trapMark} strokeWidth={1.5}
              strokeDasharray="3 2" />
        <NumBadge x={x + 5} y={y + 13} n={n} />
        <CenteredLabel cx={cx} cy={cy + 2} text="TRAP" fill={PALETTE.trapMark} size={12} weight={700} />
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

// Shared by Abyss + TileHighlight so the highlight traces the same shape as
// the abyss. radiusScale lets the highlight ring sit slightly outside the
// abyss edge.
function holePolygonPoints(num, radiusScale = 1) {
  const { cx, cy } = tilePos(num);
  const r = (TILE / 2 + 4) * radiusScale;
  const pts = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const jitter = 0.78 + ((i * 37) % 100) / 360; // deterministic per vertex
    const rr = r * jitter;
    pts.push(`${(cx + Math.cos(ang) * rr).toFixed(1)},${(cy + Math.sin(ang) * rr).toFixed(1)}`);
  }
  return pts.join(" ");
}

function Abyss({ tile }) {
  // Irregular dark shape replacing the tile + breaking the road.
  const { x, y, cx, cy } = tilePos(tile.num);
  return (
    <g>
      <polygon points={holePolygonPoints(tile.num)} fill={PALETTE.abyss}
               stroke={PALETTE.abyssEdge} strokeWidth={2} />
      <NumBadge x={x + 5} y={y + 13} n={tile.num} light />
      <CenteredLabel cx={cx} cy={cy - 3} text="HOLE" fill={PALETTE.textLight} size={11} />
      <CenteredLabel cx={cx} cy={cy + 11} text={`↓ ${tile.dest}`} fill={PALETTE.textLight} size={10} weight={600} />
    </g>
  );
}

// =============================================================================
// PHASE 2 — PLAYER CHIP & TILE HIGHLIGHT
// =============================================================================

function TileHighlight({ shaolinTile, ninjaTile, tiles }) {
  function singleRing(tile, color) {
    if (tile === null || tile === undefined) return null;
    const t = tiles[tile];
    if (!t) return null;
    if (t.type === T.HOLE) {
      return (
        <g pointerEvents="none">
          <polygon points={holePolygonPoints(tile, 1.1)} fill="none" stroke={color}
                   strokeWidth={3} opacity={0.5} strokeLinejoin="round" />
          <polygon points={holePolygonPoints(tile)} fill="none" stroke={color}
                   strokeWidth={3.5} strokeLinejoin="round" />
        </g>
      );
    }
    const p = tilePos(tile);
    return (
      <g pointerEvents="none">
        <rect x={p.x - 6} y={p.y - 6} width={TILE + 12} height={TILE + 12}
              rx={12} fill="none" stroke={color} strokeWidth={2} opacity={0.45} />
        <rect x={p.x - 3} y={p.y - 3} width={TILE + 6} height={TILE + 6}
              rx={9} fill="none" stroke={color} strokeWidth={3} />
      </g>
    );
  }

  const shared = (
    shaolinTile !== null && shaolinTile !== undefined &&
    ninjaTile   !== null && ninjaTile   !== undefined &&
    shaolinTile === ninjaTile
  );

  if (shared) {
    const t = tiles[shaolinTile];
    if (t?.type === T.HOLE) return singleRing(shaolinTile, "#22c55e");
    const p = tilePos(shaolinTile);
    return (
      <g pointerEvents="none">
        {/* outer red ring (Ninja), inner green ring (Shaolin) */}
        <rect x={p.x - 9} y={p.y - 9} width={TILE + 18} height={TILE + 18}
              rx={14} fill="none" stroke="#ff5252" strokeWidth={3} />
        <rect x={p.x - 3} y={p.y - 3} width={TILE + 6} height={TILE + 6}
              rx={9}  fill="none" stroke="#22c55e" strokeWidth={3} />
      </g>
    );
  }

  return (
    <g>
      {singleRing(shaolinTile, "#22c55e")}
      {singleRing(ninjaTile,   "#ff5252")}
    </g>
  );
}

function PlayerChip({ tile, character, sharedTile }) {
  const emoji = character === "shaolin" ? "🥋" : "🥷";
  if (tile === null) {
    // Both chips stack in the SVG corner — visible but not on any tile yet.
    const y = character === "shaolin" ? 2 : 22;
    return (
      <g pointerEvents="none">
        <rect x={2} y={y} width={24} height={18} rx={4} fill="#000" opacity={0.45} />
        <text x={5} y={y + 14} fontSize={15}>{emoji}</text>
      </g>
    );
  }
  const p = tilePos(tile);
  // When both players share a tile, push the Ninja chip to the bottom-right
  // corner so neither chip covers the tile number (top-left) or labels (centre).
  const atBottom = sharedTile && character === "ninja";
  return (
    <text
      x={p.x + TILE - 3}
      y={atBottom ? p.y + TILE - 2 : p.y + 19}
      fontSize={17} textAnchor="end"
      style={{ pointerEvents: "none" }}
    >
      {emoji}
    </text>
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

function Board({ tiles, shaolinTile, ninjaTile, gameStarted }) {
  const ladderLinks = useMemo(() => {
    const links = [];
    const seen = new Set();
    for (let i = 1; i <= 64; i++) {
      const t = tiles[i];
      if (t.type !== T.LADDER || t.dest == null) continue;
      // Dedupe the both-way pair (its two tiles point at each other).
      const key = i < t.dest ? `${i}-${t.dest}` : `${t.dest}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
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

      {/* Road, three layers + rounded joins/caps. Stroke widths are wide enough
          that the round corner arcs (radius = strokeWidth/2) keep ~12 px
          clearance from tile corners, so tiles never appear to touch the edge. */}
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

      {/* Player chips and tile highlights — only once game is started */}
      {gameStarted && (
        <g>
          <TileHighlight shaolinTile={shaolinTile} ninjaTile={ninjaTile} tiles={tiles} />
          <PlayerChip tile={shaolinTile} character="shaolin"
                      sharedTile={shaolinTile !== null && shaolinTile === ninjaTile} />
          <PlayerChip tile={ninjaTile} character="ninja"
                      sharedTile={ninjaTile !== null && ninjaTile === shaolinTile} />
        </g>
      )}
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
      ladderList.push({ origin: i, kind: t.ladderKind, climbDir: t.climbDir, dest: t.dest });
    }
  }
  ladderList.sort((a, b) => a.origin - b.origin);
  return { counts, ninjaCounts, trapList, holeList, ladderList };
}

function InfoPanel({ tiles, attempts, onRegenerate, isRolling }) {
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
            <span>tile {l.origin}{l.kind === "both" ? " (2-way)" : ""}</span>
            <span>{l.climbDir === "up" ? "↑" : "↓"} {l.dest}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onRegenerate}
        disabled={isRolling}
        style={{
          marginTop: 12, width: "100%", padding: "8px 12px",
          background: "#7a5500", color: "#fff8e7", border: "none",
          borderRadius: 6, fontWeight: 600, fontSize: 13,
          cursor: isRolling ? "not-allowed" : "pointer",
          opacity: isRolling ? 0.5 : 1,
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =============================================================================
// PHASE 5 — COMBAT (pose data, ninja info, resolver)
// =============================================================================

const BASE_POSES_SHAOLIN = [
  { id: "flying_kick",    name: "Flying Kick",    type: "Strike", height: "High" },
  { id: "dragon_fist",    name: "Dragon Fist",    type: "Strike", height: "Mid"  },
  { id: "crescent_sweep", name: "Crescent Sweep", type: "Strike", height: "Low"  },
  { id: "iron_guard",     name: "Iron Guard",     type: "Block",  height: "High" },
  { id: "tiger_block",    name: "Tiger Block",    type: "Block",  height: "Mid"  },
  { id: "mountain_stance",name: "Mountain Stance",type: "Block",  height: "Low"  },
  { id: "shadow_step",    name: "Shadow Step",    type: "Dodge",  height: "High" },
  { id: "cat_retreat",    name: "Cat Retreat",    type: "Dodge",  height: "Mid"  },
  { id: "low_slip",       name: "Low Slip",       type: "Dodge",  height: "Low"  },
];

const BASE_POSES_NINJA = [
  { id: "blade_edge",    name: "Blade Edge",    type: "Strike", height: "High" },
  { id: "death_kick",    name: "Death Kick",    type: "Strike", height: "Mid"  },
  { id: "spinning_fist", name: "Spinning Fist", type: "Strike", height: "Low"  },
  { id: "turtle_shell",  name: "Turtle Shell",  type: "Block",  height: "High" },
  { id: "stone_wall",    name: "Stone Wall",    type: "Block",  height: "Mid"  },
  { id: "shield_cross",  name: "Shield Cross",  type: "Block",  height: "Low"  },
  { id: "phantom_drift", name: "Phantom Drift", type: "Dodge",  height: "High" },
  { id: "snake_coil",    name: "Snake Coil",    type: "Dodge",  height: "Mid"  },
  { id: "wind_escape",   name: "Wind Escape",   type: "Dodge",  height: "Low"  },
];

const EXTRA_POSES_SHAOLIN = [
  { id: "thunder_dragon", name: "Thunder Dragon", type: "Strike", height: "High" },
  { id: "ghost_walk",     name: "Ghost Walk",     type: "Strike", height: "Mid"  },
  { id: "steel_lotus",    name: "Steel Lotus",    type: "Strike", height: "Low"  },
];

const EXTRA_POSES_NINJA = [
  { id: "demon_claw",  name: "Demon Claw",  type: "Strike", height: "High" },
  { id: "void_step",   name: "Void Step",   type: "Strike", height: "Mid"  },
  { id: "iron_shroud", name: "Iron Shroud", type: "Strike", height: "Low"  },
];

const EXTRA_POSE_ID_SET = new Set([
  ...EXTRA_POSES_SHAOLIN.map((p) => p.id),
  ...EXTRA_POSES_NINJA.map((p) => p.id),
]);

// Secret techniques (extra poses) win a round exactly as often as an ordinary
// strike of the same height — resolveCombat never looks at them. What they
// change is the CONSEQUENCE of the round. Each character's three techniques
// pair up with the other character's by height, and a pair shares one rider:
//   ghost   — board: the next fight starts 1-0 for whoever won this round.
//             duel:  1 round, plus +1 on the round winner's next dice round.
//   thunder — board: a win logs two victories; a loss destroys the technique.
//             duel:  2 rounds on a win; on a loss 1 round to the opponent and
//                    the technique is destroyed.
//   lotus   — board: a win logs two victories, a loss logs two defeats.
//             duel:  2 rounds either way.
const TECHNIQUE_KIND = {
  ghost_walk: "ghost",     void_step:  "ghost",
  thunder_dragon: "thunder", demon_claw: "thunder",
  steel_lotus: "lotus",    iron_shroud: "lotus",
};

function techniqueKind(pose) {
  if (!pose || !pose.id) return null;
  return TECHNIQUE_KIND[pose.id] || null;
}

// Per-item-find drop rate for each secret technique, ascending in difficulty.
// These are the literal chance that a single item find yields that pose. Rates
// are independent: a roll that lands on an unavailable (already-held) pose
// falls through to a sorcery, so each pose's chance is exactly its own value
// regardless of what else is held.
const TECHNIQUE_DROP_ORDER = ["ghost", "thunder", "lotus"];
const TECHNIQUE_DROP_RATE = {
  ghost:   0.10,   // Ghost Walk / Void Step  — easiest
  thunder: 0.06,   // Thunder Dragon / Demon Claw
  lotus:   0.04,   // Steel Lotus / Iron Shroud — hardest
};

// Decides what one item find yields. Rolls once for a secret technique in
// difficulty order (independent per-pose rates); anything else yields a random
// available sorcery. Never returns an empty find unless the player already
// holds every item. `rng` is injectable for tests.
function pickItemFind(availableExtras, availableSorceries, rng = Math.random) {
  const r = rng();
  let threshold = 0;
  let landedKind = null;
  for (const kind of TECHNIQUE_DROP_ORDER) {
    const rate = TECHNIQUE_DROP_RATE[kind];
    if (r >= threshold && r < threshold + rate) { landedKind = kind; break; }
    threshold += rate;
  }
  // The roll hit an extra band AND that pose is still available → take it.
  if (landedKind) {
    const pose = availableExtras.find((p) => TECHNIQUE_KIND[p.id] === landedKind);
    if (pose) return pose;
  }
  // Otherwise a sorcery. (Either the roll fell in the sorcery zone, or it hit
  // a band whose pose is already held — that mass goes to sorceries, keeping
  // each pose's rate independent.)
  if (availableSorceries.length > 0) {
    return availableSorceries[Math.floor(rng() * availableSorceries.length)];
  }
  // No sorceries left — never waste the tile: give the best available extra.
  for (const kind of TECHNIQUE_DROP_ORDER) {
    const pose = availableExtras.find((p) => TECHNIQUE_KIND[p.id] === kind);
    if (pose) return pose;
  }
  return null; // Player holds absolutely everything (degenerate).
}

// Paired backgrounds for extra poses (Shaolin + Ninja share a colour at each
// height). Lighter tones of regal hues that still set them apart from base cards.
const EXTRA_POSE_BG_BY_HEIGHT = {
  High: { bg: "linear-gradient(140deg, #d6b6ed 0%, #a784cf 100%)", text: "#2a0e44" }, // soft violet
  Mid:  { bg: "linear-gradient(140deg, #b8e3d4 0%, #82c0aa 100%)", text: "#0d3530" }, // soft jade
  Low:  { bg: "linear-gradient(140deg, #f0c79c 0%, #d59866 100%)", text: "#4a1f0a" }, // soft bronze
};

// Trigger categories drive WHERE/WHEN each sorcery is offered or initiated.
//   "fight_land"   — game-triggered when landing on a fight tile
//   "hole_land"    — game-triggered when landing on a hole tile
//   "trap_land"    — game-triggered when landing on a trap tile
//   "pre_roll"     — player-initiated before the dice roll
//   "battle_dice"  — game-triggered after a dice-tied roll lost
//   "battle_pose"  — player-initiated during pose selection
//   "battle_loss"  — game-triggered after a fully resolved round loss
const SORCERIES = [
  // ----- ITEMS (panel section 1) ---------------------------------------
  {
    id: "mantle_of_mist",
    name: "Mantle of Mist",
    trigger: "fight_land",
    category: "item",
    description: "On landing on a fight tile. The game asks if you slip past unseen. Yes spends the item and skips the fight entirely. Cannot be used on the boss tile.",
  },
  {
    id: "magic_compass",
    name: "Magic Compass",
    trigger: "pre_roll",
    category: "item",
    description: "At the start of your turn, before rolling. Choose direction (forward or backward) and exact distance (1, 2, or 3 tiles). Move instead of rolling. The destination tile's event resolves normally.",
  },
  {
    id: "ancient_key",
    name: "Ancient Key",
    trigger: "pre_roll",
    category: "item",
    description: "At the start of your turn, before rolling. Jump one full row up (backward) or down (forward) from your current position. Usable from any tile.",
  },
  {
    id: "safety_rope",
    name: "Safety Rope",
    trigger: "hole_land",
    category: "item",
    description: "On landing on a hole tile. The game asks if you anchor yourself. Yes spends the item and you stay on the hole tile. No lets the fall proceed and preserves the rope.",
  },
  {
    id: "magic_powder",
    name: "Magic Powder",
    trigger: "battle_dice",
    category: "item",
    description: "During a battle round decided by dice. If the natural dice roll goes against you, the game offers a single re-roll. The new result stands — you can still lose.",
  },
  {
    id: "sword",
    name: "Sword",
    trigger: "battle_passive",
    category: "item",
    persistent: true,
    description: "A persistent magical sword. While held, every dice tiebreaker in a battle round rolls two dice for you and keeps the higher result. Never spent on use — only lost via Sorcery Theft or Rival's Tribute traps. Only the Ninja Warrior can discover it.",
  },
  {
    id: "nunchaku",
    name: "Nunchaku",
    trigger: "battle_passive",
    category: "item",
    persistent: true,
    description: "Persistent magical nunchaku. While held, every dice tiebreaker in a battle round rolls two dice for you and keeps the higher result. Never spent on use — only lost via Sorcery Theft or Rival's Tribute traps. Only the Shaolin Master can discover it.",
  },
  // ----- SORCERIES (panel section 2) ----------------------------------
  {
    id: "sixth_sense",
    name: "Sixth Sense",
    trigger: "trap_land",
    category: "sorcery",
    description: "On landing on a trap tile. The trap's full effect is revealed first; only then are you asked whether to spend this sorcery to block it entirely.",
  },
  {
    id: "oracle_eye",
    name: "Oracle's Eye",
    trigger: "battle_pose",
    category: "sorcery",
    description: "During pose selection, before you commit. Reveals the enemy's pose (type and height) for the current round. Applies only to that round.",
  },
  {
    id: "iron_bell",
    name: "Iron Bell",
    trigger: "battle_loss",
    category: "sorcery",
    description: "After a battle round fully resolves as a loss. The round is cancelled and replayed from pose selection. You can still lose the replay.",
  },
];

const SORCERY_BY_ID = Object.fromEntries(SORCERIES.map((s) => [s.id, s]));

// Persistent weapons (Sword / Nunchaku) share one identical battle effect:
// while held, dice tiebreakers roll two dice and keep the higher. Each is
// globally unique and may only be DISCOVERED by one character — Sword by the
// Ninja Warrior, Nunchaku by the Shaolin Master. Neither can ever end up in
// the other character's hands: Rival's Tribute translates on transfer (see
// TRIBUTE_COUNTERPART).
const WEAPON_ITEM_IDS = ["sword", "nunchaku"];
const WEAPON_DISCOVERY_CHAR = { sword: "ninja", nunchaku: "shaolin" };

// Character-exclusive items pair up one-to-one across the two characters, with
// identical mechanics on both sides — the weapons share a dice effect, and each
// extra pose has a same-type/same-height twin. When Rival's Tribute moves one of
// these across characters, the receiver gets THEIR OWN version instead of the
// original: you take what you learned and express it in your own style. This
// keeps a Shaolin Master from ever performing a ninja technique (there is no art
// for that pairing — poseImageFor would silently fall back to the other
// character's sprite) while leaving type, height and dice effect untouched.
const TRIBUTE_COUNTERPART = {
  sword:          "nunchaku",
  nunchaku:       "sword",
  thunder_dragon: "demon_claw",
  demon_claw:     "thunder_dragon",
  ghost_walk:     "void_step",
  void_step:      "ghost_walk",
  steel_lotus:    "iron_shroud",
  iron_shroud:    "steel_lotus",
};

// Resolves the item a player actually receives when `item` is transferred to
// them. Items with no counterpart (ordinary sorceries) pass through unchanged.
function tributeItemFor(item) {
  const twinId = TRIBUTE_COUNTERPART[item.id];
  if (!twinId) return item;
  if (item.kind === "sorcery") {
    const s = SORCERY_BY_ID[twinId];
    return { kind: "sorcery", id: s.id, name: s.name, description: s.description };
  }
  const p = [...EXTRA_POSES_SHAOLIN, ...EXTRA_POSES_NINJA].find((x) => x.id === twinId);
  return { kind: "extra_pose", id: p.id, name: p.name, type: p.type, height: p.height };
}

const NINJA_DESCRIPTIONS = {
  black:  "Disciplined assassin of the Shadow Clan. Defeat sends you back 2 tiles.",
  fire:   "Wild flame warrior who fights with reckless fury. Defeat sends you back 3 tiles.",
  shadow: "Elusive trickster who strikes from the gloom. Defeat sends you back 3 tiles.",
  demon:  "Fearsome champion bearing forbidden techniques. Defeat sends you back 5 tiles.",
};

const NINJA_SETBACK = { black: 2, fire: 3, shadow: 3, demon: 5 };

// Type weights for computer-controlled enemies (regular fight encounters).
// Demon's 15% extra-pose chance is intentionally ignored for now — all four
// ninja types pick exclusively from BASE_POSES_NINJA.
const NINJA_POSE_WEIGHTS = {
  black:  { Strike: 33, Block: 33, Dodge: 34 },
  fire:   { Strike: 60, Block: 20, Dodge: 20 },
  shadow: { Strike: 20, Block: 20, Dodge: 60 },
  demon:  { Strike: 34, Block: 33, Dodge: 33 },
};

function pickComputerPose(ninjaType) {
  const w = NINJA_POSE_WEIGHTS[ninjaType];
  const total = w.Strike + w.Block + w.Dodge;
  const r = Math.random() * total;
  let type;
  if (r < w.Strike) type = "Strike";
  else if (r < w.Strike + w.Block) type = "Block";
  else type = "Dodge";
  const candidates = BASE_POSES_NINJA.filter((p) => p.type === type);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function strikeVsDodge(strike, dodge, strikeSide, dodgeSide) {
  const tbl = {
    "High|High": ["def", "Dodge-High moves the head out of reach"],
    "High|Mid":  ["def", "Dodge-Mid moves the head out of reach"],
    "High|Low":  ["atk", "Dodge-Low leaves the head exposed"],
    "Mid|High":  ["atk", "Dodge-High does not move the chest away"],
    "Mid|Mid":   ["atk", "Dodge-Mid does not move the chest away"],
    "Mid|Low":   ["def", "Dodge-Low moves the chest away sufficiently"],
    "Low|High":  ["atk", "Dodge-High does not move the legs away"],
    "Low|Mid":   ["dice","Dodge-Mid is a partial evasion — dice decides"],
    "Low|Low":   ["def", "Dodge-Low moves the legs away"],
  };
  const [code, why] = tbl[`${strike.height}|${dodge.height}`];
  const matchup = `Strike-${strike.height} vs Dodge-${dodge.height}`;
  if (code === "atk") return { winner: strikeSide, reason: `${matchup}: Strike wins — ${why}` };
  if (code === "def") return { winner: dodgeSide, reason: `${matchup}: Dodge wins — ${why}` };
  return { winner: "dice", reason: `${matchup}: ${why}` };
}

function strikeVsBlock(strike, block, strikeSide, blockSide) {
  const tbl = {
    "High|High": ["def", "block aligned with the strike"],
    "High|Mid":  ["dice","adjacent height, dice decides"],
    "High|Low":  ["atk", "block too low to deflect a head strike"],
    "Mid|High":  ["dice","adjacent height, dice decides"],
    "Mid|Mid":   ["def", "block aligned with the strike"],
    "Mid|Low":   ["dice","adjacent height, dice decides"],
    "Low|High":  ["atk", "block too high to stop a leg sweep"],
    "Low|Mid":   ["dice","adjacent height, dice decides"],
    "Low|Low":   ["def", "block aligned with the strike"],
  };
  const [code, why] = tbl[`${strike.height}|${block.height}`];
  const matchup = `Strike-${strike.height} vs Block-${block.height}`;
  if (code === "atk") return { winner: strikeSide, reason: `${matchup}: Strike wins — ${why}` };
  if (code === "def") return { winner: blockSide, reason: `${matchup}: Block wins — ${why}` };
  return { winner: "dice", reason: `${matchup}: ${why}` };
}

function reasonForOther(t1, t2) {
  if (t1 === "Strike" && t2 === "Strike") return "both connect — who hit harder";
  if (t1 === "Block"  && t2 === "Block")  return "positional standoff";
  if (t1 === "Dodge"  && t2 === "Dodge")  return "both evading";
  return "both defensive, neither attacking";
}

function resolveCombat(p1Pose, p2Pose) {
  const p1S = p1Pose.type === "Strike";
  const p2S = p2Pose.type === "Strike";
  if (p1S && p2Pose.type === "Dodge") return strikeVsDodge(p1Pose, p2Pose, "p1", "p2");
  if (p2S && p1Pose.type === "Dodge") return strikeVsDodge(p2Pose, p1Pose, "p2", "p1");
  if (p1S && p2Pose.type === "Block") return strikeVsBlock(p1Pose, p2Pose, "p1", "p2");
  if (p2S && p1Pose.type === "Block") return strikeVsBlock(p2Pose, p1Pose, "p2", "p1");
  return {
    winner: "dice",
    reason: `${p1Pose.type} vs ${p2Pose.type}: ${reasonForOther(p1Pose.type, p2Pose.type)}, dice decides`,
  };
}

// Combat Rating: derived dynamically from a player's intermediate battle log.
// Wins are +1, losses −1, Mantle-of-Mist skips never enter the log, and the
// final duel never appends to the log either — so this naturally captures
// the spec's definition. Battle-Log-Modifier traps flip a "won" to "lost"
// in place, which flows through without extra bookkeeping.
function computeCombatRating(log) {
  let r = 0;
  for (const e of log) {
    if (e.outcome === "won") r += 1;
    else if (e.outcome === "lost") r -= 1;
  }
  return r;
}

// Dice modifier table from the spec.
function combatRatingDiceModifier(rating) {
  if (rating >= 3)  return 2;
  if (rating >= 1)  return 1;
  if (rating === 0) return 0;
  if (rating >= -2) return -1;
  return -2;
}

function formatSignedRating(r) {
  if (r > 0) return `+${r}`;
  if (r < 0) return `−${Math.abs(r)}`;
  return "0";
}

// =============================================================================
// PHASE 4 — MODAL COMPONENTS
// =============================================================================

function LadderModal({ tileNum, climbDir, dest, bothWay, onClimb, onStay }) {
  const overlayStyle = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.42)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000,
  };
  const boxStyle = {
    background: "#fff8e7",
    border: "2px solid #c4ad7b",
    borderRadius: 14,
    padding: "28px 32px",
    maxWidth: 380,
    width: "90%",
    textAlign: "center",
    boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
    fontFamily: "Georgia, serif",
    color: PALETTE.text,
  };
  const btnPrimary = {
    padding: "9px 22px", borderRadius: 7,
    background: "#7a5500", color: "#fff8e7",
    border: "none", fontFamily: "Georgia, serif",
    fontSize: 14, fontWeight: 700, cursor: "pointer",
  };
  const btnSecondary = {
    padding: "9px 22px", borderRadius: 7,
    background: "#fff8e7", color: PALETTE.text,
    border: "1px solid #c4ad7b", fontFamily: "Georgia, serif",
    fontSize: 14, fontWeight: 600, cursor: "pointer",
  };
  return (
    <div style={overlayStyle}>
      <Draggable style={boxStyle}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🪜</div>
        <h2 style={{ margin: "0 0 12px 0", fontSize: 20 }}>
          {bothWay ? "A Two-Way Ladder!" : "A Ladder!"}
        </h2>
        <p style={{ fontStyle: "italic", fontSize: 14, lineHeight: 1.6, marginBottom: 16, color: "#6b4f1a" }}>
          {climbDir === "up"
            ? '"Sometimes the wise warrior retreats a step to find firmer ground."'
            : '"Each rung climbed is a battle won — rise swiftly, warrior, for the summit awaits."'}
        </p>
        <FramedIllustration src={MODAL_IMAGES.ladder} alt="Ladder" />
        <p style={{ fontSize: 13, marginBottom: 22, color: "#7a5500" }}>
          {climbDir === "up"
            ? <>This ladder leads up to tile <strong>{dest}</strong>. Do you climb, or hold your ground?</>
            : <>This ladder leads down to tile <strong>{dest}</strong>. Do you descend, or hold your ground?</>}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={onClimb}>
            {climbDir === "up" ? `Climb up → ${dest}` : `Climb down → ${dest}`}
          </button>
          <button style={btnSecondary} onClick={onStay}>Continue forward</button>
        </div>
      </Draggable>
    </div>
  );
}

// ---- Shared modal styles ----------------------------------------------------
const MODAL_OVERLAY = {
  position: "fixed", inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000,
};

// ---- Draggable wrapper -----------------------------------------------------
// Lets the user drag a modal aside so they can read the board behind it.
// Drag starts on any non-interactive surface inside the modal; clicks on
// buttons / inputs / labels still register normally.
function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  function onMouseDown(e) {
    if (e.target.closest("button, input, select, textarea, label, a, [data-no-drag]")) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = pos;
    setDragging(true);

    function onMove(ev) {
      setPos({
        x: origin.x + (ev.clientX - startX),
        y: origin.y + (ev.clientY - startY),
      });
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return { pos, onMouseDown, dragging };
}

function Draggable({ style, children, ...rest }) {
  const { pos, onMouseDown, dragging } = useDraggable();
  return (
    <div
      onMouseDown={onMouseDown}
      {...rest}
      style={{
        ...style,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        cursor: dragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
}
const MODAL_BOX = {
  background: "#fff8e7",
  border: "2px solid #c4ad7b",
  borderRadius: 14,
  padding: "28px 32px",
  textAlign: "center",
  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
  fontFamily: "Georgia, serif",
  color: PALETTE.text,
};
const BTN_PRIMARY = {
  padding: "9px 22px", borderRadius: 7,
  background: "#7a5500", color: "#fff8e7",
  border: "none", fontFamily: "Georgia, serif",
  fontSize: 14, fontWeight: 700, cursor: "pointer",
};
const BTN_SECONDARY = {
  padding: "9px 22px", borderRadius: 7,
  background: "#fff8e7", color: PALETTE.text,
  border: "1px solid #c4ad7b", fontFamily: "Georgia, serif",
  fontSize: 14, fontWeight: 600, cursor: "pointer",
};

// Shared "scroll" frame used by the item-found, ladder, and trap modals so
// every reveal-style modal shows its illustration in a consistent gold-on-
// maroon panel with corner brackets and an inner parchment background.
function FramedIllustration({ src, alt, height = 240 }) {
  if (!src) return null;
  return (
    <div style={{
      width: "100%", height,
      background: "linear-gradient(135deg, #8b1a1a 0%, #4a0a0a 100%)",
      borderRadius: 10,
      marginBottom: 14,
      border: "3px solid #d4af37",
      boxShadow: "0 0 24px rgba(212,175,55,0.45)",
      position: "relative",
      overflow: "hidden",
    }}>
      <span style={{ position: "absolute", top: 4,  left: 6,  color: "#d4af37", fontSize: 22, lineHeight: 1, fontFamily: "monospace" }}>┏</span>
      <span style={{ position: "absolute", top: 4,  right: 6, color: "#d4af37", fontSize: 22, lineHeight: 1, fontFamily: "monospace" }}>┓</span>
      <span style={{ position: "absolute", bottom: 4, left: 6,  color: "#d4af37", fontSize: 22, lineHeight: 1, fontFamily: "monospace" }}>┗</span>
      <span style={{ position: "absolute", bottom: 4, right: 6, color: "#d4af37", fontSize: 22, lineHeight: 1, fontFamily: "monospace" }}>┛</span>
      <div style={{
        position: "absolute",
        top: 16, left: 16, right: 16, bottom: 16,
        background: "linear-gradient(180deg, #f5e6c8 0%, #e8d4a8 100%)",
        borderRadius: 6,
        border: "1px solid #d4af37",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden",
      }}>
        <img
          src={src}
          alt={alt}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    </div>
  );
}

function FightIntroModal({ ninjaType, onFight }) {
  const info = NINJA[ninjaType];
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{ ...MODAL_BOX, maxWidth: 400, width: "90%" }}>
        <div style={{ fontSize: 38, marginBottom: 4 }}>⚔️</div>
        <h2 style={{ margin: "0 0 6px 0", fontSize: 20 }}>An Encounter!</h2>
        <div style={{
          display: "inline-block",
          padding: "4px 12px", borderRadius: 6,
          background: info.color, color: "#fff8e7",
          fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
          marginBottom: 14,
        }}>
          {info.name}
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 22, color: "#5a4317" }}>
          {NINJA_DESCRIPTIONS[ninjaType]}
        </p>
        <button style={BTN_PRIMARY} onClick={onFight}>Fight!</button>
      </Draggable>
    </div>
  );
}

// ---- PlayerPanel -----------------------------------------------------------

const SORCERY_ICONS = {
  mantle_of_mist: "🌫",
  magic_compass:  "🧭",
  ancient_key:    "🗝️",
  safety_rope:    "🪢",
  magic_powder:   "✨",
  sword:          "🗡️",
  nunchaku:       "🔗",
  sixth_sense:    "👁",
  oracle_eye:     "🔮",
  iron_bell:      "🔔",
};

function BattleLogPanel({ shaolinLog, ninjaLog }) {
  function column(label, accent, log) {
    const wins = log.filter((e) => e.outcome === "won").length;
    const losses = log.filter((e) => e.outcome === "lost").length;
    const rating = computeCombatRating(log);
    const ratingColor = rating > 0 ? "#1c6f2c" : rating < 0 ? "#a8261b" : "#7a5d00";
    return (
      <div style={{ flex: "1 1 0", minWidth: 220 }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          marginBottom: 4,
        }}>
          <strong style={{ color: accent }}>{label}</strong>
          <span style={{ color: "#7a5d00", fontSize: 11 }}>
            {wins}W / {losses}L
          </span>
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          marginBottom: 4,
          fontSize: 11,
          color: "#5a4317",
        }}>
          <span style={{ letterSpacing: 0.3 }}>Combat Rating</span>
          <strong style={{ color: ratingColor, fontFamily: "Georgia, serif" }}>
            {formatSignedRating(rating)}
          </strong>
        </div>
        <div style={{
          maxHeight: 220,
          overflowY: "auto",
          background: "#fdf4dc",
          border: "1px solid #e4d3a5",
          borderRadius: 6,
          padding: "6px 8px",
          fontSize: 12,
        }}>
          {log.length === 0 ? (
            <em style={{ color: "#9b8050" }}>No battles yet</em>
          ) : (
            log.map((entry, i) => {
              const won = entry.outcome === "won";
              return (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "2px 0",
                  borderBottom: i < log.length - 1 ? "1px dashed #e4d3a5" : "none",
                }}>
                  <span>{NINJA[entry.ninjaType].name}</span>
                  <span style={{ color: won ? "#1c6f2c" : "#a8261b", fontWeight: 600 }}>
                    {won ? "Victory" : "Defeat"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }
  return (
    <div style={{
      background: "#fff8e7",
      border: "1px solid #c4ad7b",
      borderRadius: 8,
      padding: 12,
      color: PALETTE.text,
      fontFamily: "sans-serif",
    }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: "#7a5500",
        letterSpacing: 0.4, marginBottom: 8,
        borderBottom: "1px solid #c4ad7b", paddingBottom: 6,
      }}>
        ⚔ Battle Log
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {column("🥋 Shaolin Master", "#22c55e", shaolinLog)}
        {column("🥷 Ninja Warrior", "#ff5252", ninjaLog)}
      </div>
    </div>
  );
}

function PlayerPanel({
  character, label,
  sorceries, extraPoses,
  held = false, lockedType = null, headStart = null,
  tile = null,
  isMyTurn = false,
  canRoll = false,
  rollLabelOverride = null,
  onRoll = () => {},
  hasUsablePreRoll = false,
  onUseSorcery = () => {},
  forcedRoll = null,
  onForcedRollChange = () => {},
}) {
  const hasCurse = held || lockedType != null || headStart != null;
  const accent = character === "shaolin" ? "#22c55e" : "#ff5252";
  return (
    <div style={{
      flex: "1 1 0",
      minWidth: 240,
      background: "#fff8e7",
      border: isMyTurn ? `2px solid ${accent}` : "1px solid #c4ad7b",
      borderRadius: 8,
      padding: 12,
      color: PALETTE.text,
      fontFamily: "sans-serif",
      fontSize: 12,
      display: "flex",
      flexDirection: "column",
      gap: 10,
      boxShadow: isMyTurn ? `0 0 0 3px ${accent}33` : "none",
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, color: accent,
        borderBottom: `1px solid ${accent}`,
        paddingBottom: 6,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8,
      }}>
        <span>{label}</span>
        {isMyTurn && (
          <span style={{
            background: accent, color: "#fff8e7",
            fontSize: 10, fontWeight: 700, letterSpacing: 0.7,
            padding: "2px 8px", borderRadius: 10,
          }}>
            YOUR TURN
          </span>
        )}
      </div>

      {hasCurse && (
        <div style={{
          background: "linear-gradient(135deg, #1a0f08 0%, #2c1a0a 100%)",
          border: "2px solid #d4af37",
          borderRadius: 8,
          padding: "10px 12px",
          boxShadow: "0 0 18px rgba(212,175,55,0.45)",
          color: "#f5e6c8",
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.9,
            color: "#d4af37", textAlign: "center", marginBottom: 8,
          }}>
            ⚠ ACTIVE CURSES ⚠
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {held && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 18, lineHeight: 1.2 }}>⛓</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e8d2a0", letterSpacing: 0.4 }}>
                    Held in Place
                  </div>
                  <div style={{ fontSize: 11, color: "#c4ad7b", fontStyle: "italic", lineHeight: 1.4 }}>
                    Spectral chains bind your feet — your next turn fades to silence.
                  </div>
                </div>
              </div>
            )}
            {lockedType && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 18, lineHeight: 1.2 }}>🔒</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#e8d2a0", letterSpacing: 0.4 }}>
                    Seal of {lockedType}
                  </div>
                  <div style={{ fontSize: 11, color: "#c4ad7b", fontStyle: "italic", lineHeight: 1.4 }}>
                    Your {lockedType} stances slumber in iron — they will not wake until the next battle ends.
                  </div>
                </div>
              </div>
            )}
            {headStart && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 18, lineHeight: 1.2 }}>{headStart === "self" ? "🌿" : "🌫"}</span>
                <div>
                  <div style={{
                    fontSize: 12, fontWeight: 700, letterSpacing: 0.4,
                    color: headStart === "self" ? "#8ee6a8" : "#e8a0a0",
                  }}>
                    {headStart === "self" ? "Ghost Walk echo" : "Ghost Walk shadow"}
                  </div>
                  <div style={{ fontSize: 11, color: "#c4ad7b", fontStyle: "italic", lineHeight: 1.4 }}>
                    {headStart === "self"
                      ? "Your next fight begins 1–0 in your favour."
                      : "Your next fight begins 1–0 against you."}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {(() => {
        // Single combined "Items & Sorceries" section. Persistence (Sword)
        // is still surfaced with a small lock glyph on the chip.
        function chip(s, i) {
          const def = SORCERY_BY_ID[s.id];
          const persistent = !!def?.persistent;
          return (
            <span
              key={s.id + "_" + i}
              title={s.description + (persistent ? " — persistent (never spent on use)" : "")}
              style={{
                background: persistent ? "#f3e6c4" : "#fff8e7",
                border: persistent ? "1px solid #7a5500" : "1px solid #c4ad7b",
                borderRadius: 12,
                padding: "3px 9px",
                fontSize: 12,
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{SORCERY_ICONS[s.id] || "🔮"}</span>
              <span>{s.name}</span>
              {persistent && (
                <span title="Persistent — kept until lost via a trap" style={{ fontSize: 10, color: "#7a5500" }}>
                  🔒
                </span>
              )}
            </span>
          );
        }
        return (
          <div>
            <strong>Items &amp; Sorceries</strong>
            <div style={{
              marginTop: 4,
              background: "#fdf4dc",
              border: "1px solid #e4d3a5",
              borderRadius: 6,
              padding: "6px 8px",
              minHeight: 36,
            }}>
              {sorceries.length === 0 ? (
                <em style={{ color: "#9b8050" }}>No items or sorceries</em>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sorceries.map(chip)}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div>
        <strong>Secret Techniques</strong>
        <div style={{
          marginTop: 4,
          background: "#fdf4dc",
          border: "1px solid #e4d3a5",
          borderRadius: 6,
          padding: "6px 8px",
          minHeight: 36,
        }}>
          {extraPoses.length === 0 ? (
            <em style={{ color: "#9b8050" }}>No extra poses</em>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {extraPoses.map((p, i) => {
                const tone = EXTRA_POSE_BG_BY_HEIGHT[p.height];
                const thumb = EXTRA_POSE_IMAGES[p.id];
                return (
                  <span
                    key={p.id + "_" + i}
                    title={`${p.type} / ${p.height}`}
                    style={{
                      background: tone ? tone.bg : "#fff8e7",
                      color: tone ? tone.text : PALETTE.text,
                      border: "1px solid rgba(212,175,55,0.8)",
                      borderRadius: 12,
                      padding: "2px 8px 2px 4px",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        style={{
                          width: 22, height: 22,
                          objectFit: "contain",
                          borderRadius: 3,
                          background: "rgba(255,255,255,0.85)",
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: 13 }}>✦</span>
                    )}
                    {p.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>


      <button
        onClick={onRoll}
        disabled={!canRoll}
        style={{
          padding: "9px 10px",
          borderRadius: 6,
          border: `1px solid ${canRoll ? accent : "#c4ad7b"}`,
          background: canRoll ? accent : "#fff8e7",
          color: canRoll ? "#fff8e7" : PALETTE.text,
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 700,
          cursor: canRoll ? "pointer" : "not-allowed",
          opacity: canRoll ? 1 : 0.55,
          width: "100%",
        }}
      >
        {rollLabelOverride || (character === "shaolin"
          ? "🥋 Roll for Shaolin Master"
          : "🥷 Roll for Ninja Warrior")}
      </button>

      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 8px",
        background: "#fdecc8",
        border: "1px dashed #c08b1a",
        borderRadius: 6,
        fontSize: 12, color: "#7a5500",
      }} title="Testing: force the next dice roll to a specific value">
        <span style={{ fontWeight: 700, letterSpacing: 0.4 }}>🧪 Force:</span>
        <select
          value={forcedRoll == null ? "" : String(forcedRoll)}
          onChange={(e) => {
            const v = e.target.value;
            onForcedRollChange(v === "" ? null : Number(v));
          }}
          style={{
            fontFamily: "inherit", fontSize: 12,
            padding: "2px 4px", borderRadius: 4,
            border: "1px solid #c08b1a", background: "#fff8e7",
            color: "#3a2c12", cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          <option value="">Random</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5</option>
          <option value="6">6</option>
        </select>
      </div>

      <button
        onClick={onUseSorcery}
        disabled={!hasUsablePreRoll || !isMyTurn}
        title={hasUsablePreRoll && isMyTurn ? "Use an item before rolling" : "No usable item on this turn"}
        style={{
          padding: "7px 10px",
          borderRadius: 6,
          border: "1px solid #7a5500",
          background: hasUsablePreRoll && isMyTurn ? "#f5e6c8" : "#fff8e7",
          color: "#5a4317",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 700,
          cursor: hasUsablePreRoll && isMyTurn ? "pointer" : "not-allowed",
          opacity: hasUsablePreRoll && isMyTurn ? 1 : 0.5,
          width: "100%",
        }}
      >
        ✦ Use Item
      </button>

      <div style={{
        borderTop: "1px solid #e4d3a5",
        paddingTop: 6,
        fontSize: 12,
        color: "#3a2c12",
        display: "flex", justifyContent: "space-between",
      }}>
        <span>
          <strong>Position:</strong> {tile === null ? "start" : `tile ${tile}`}
        </span>
        <span style={{ color: canRoll ? accent : "#9b8050", fontWeight: canRoll ? 700 : 500 }}>
          {canRoll ? "← to move" : "waiting"}
        </span>
      </div>
    </div>
  );
}

// ---- Trap modals -----------------------------------------------------------

function TrapAnnounceModal({ trapType, message, onClose, buttonLabel = "Continue" }) {
  const info = TRAP_INFO[trapType] || {};
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 420, width: "92%",
        border: "2px solid #8a1620",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 24px rgba(138,22,32,0.45)",
      }}>
        <div style={{ fontSize: 13, color: "#8a1620", fontWeight: 700, marginBottom: 4, letterSpacing: 0.6 }}>
          ⚠ TRAP TRIGGERED
        </div>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{info.icon || "⚠"}</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>{info.title || "Trap"}</h2>
        <p style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.55, marginBottom: 14, color: "#6b4f1a" }}>
          {info.flavor}
        </p>
        <FramedIllustration src={MODAL_IMAGES.traps[trapType]} alt={info.title || "Trap"} />
        <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.55, marginBottom: 22, color: "#5a4317" }}>
          {message}
        </p>
        <button style={BTN_PRIMARY} onClick={onClose}>{buttonLabel}</button>
      </Draggable>
    </div>
  );
}

function TrapSorceryTheftModal({ sorceries, onChoose }) {
  const [selected, setSelected] = useState(null);
  const info = TRAP_INFO.sorcery_theft;
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 460, width: "92%",
        border: "2px solid #8a1620",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 24px rgba(138,22,32,0.45)",
      }}>
        <div style={{ fontSize: 13, color: "#8a1620", fontWeight: 700, marginBottom: 4, letterSpacing: 0.6 }}>
          ⚠ TRAP TRIGGERED
        </div>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{info.icon}</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>{info.title}</h2>
        <p style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.55, marginBottom: 14, color: "#6b4f1a" }}>
          {info.flavor}
        </p>
        <FramedIllustration src={MODAL_IMAGES.traps.sorcery_theft} alt={info.title} />
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#5a4317" }}>
          Choose an item or sorcery to surrender:
        </p>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8,
          justifyContent: "center", marginBottom: 18,
        }}>
          {sorceries.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              title={s.description}
              style={{
                background: selected === s.id ? "#fde2dc" : "#fff8e7",
                border: selected === s.id ? "2px solid #8a1620" : "2px solid #c4ad7b",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: "Georgia, serif",
                cursor: "pointer",
                color: PALETTE.text,
                fontWeight: 600,
              }}
            >
              {SORCERY_ICONS[s.id] || "🔮"} {s.name}
            </button>
          ))}
        </div>
        <button
          style={{
            ...BTN_PRIMARY,
            opacity: selected ? 1 : 0.55,
            cursor: selected ? "pointer" : "not-allowed",
          }}
          disabled={!selected}
          onClick={() => onChoose(selected)}
        >
          Surrender chosen
        </button>
      </Draggable>
    </div>
  );
}

function TrapPoseTheftModal({ poses, onChoose }) {
  const [selected, setSelected] = useState(null);
  const info = TRAP_INFO.pose_theft;
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 480, width: "92%",
        border: "2px solid #8a1620",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 24px rgba(138,22,32,0.45)",
      }}>
        <div style={{ fontSize: 13, color: "#8a1620", fontWeight: 700, marginBottom: 4, letterSpacing: 0.6 }}>
          ⚠ TRAP TRIGGERED
        </div>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{info.icon}</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>{info.title}</h2>
        <p style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.55, marginBottom: 14, color: "#6b4f1a" }}>
          {info.flavor}
        </p>
        <FramedIllustration src={MODAL_IMAGES.traps.pose_theft} alt={info.title} />
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "#5a4317" }}>
          Choose an extra pose to surrender:
        </p>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8,
          justifyContent: "center", marginBottom: 18,
        }}>
          {poses.map((p) => {
            const tone = EXTRA_POSE_BG_BY_HEIGHT[p.height];
            const isSel = selected === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                title={`${p.type} / ${p.height}`}
                style={{
                  background: tone ? tone.bg : "#fff8e7",
                  color: tone ? tone.text : PALETTE.text,
                  border: isSel ? "2px solid #8a1620" : "2px solid rgba(212,175,55,0.7)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontFamily: "Georgia, serif",
                  cursor: "pointer",
                  fontWeight: 700,
                  boxShadow: isSel ? "0 0 0 3px rgba(138,22,32,0.4)" : "none",
                }}
              >
                ✦ {p.name}
              </button>
            );
          })}
        </div>
        <button
          style={{
            ...BTN_PRIMARY,
            opacity: selected ? 1 : 0.55,
            cursor: selected ? "pointer" : "not-allowed",
          }}
          disabled={!selected}
          onClick={() => onChoose(selected)}
        >
          Surrender chosen pose
        </button>
      </Draggable>
    </div>
  );
}

function TrapTributeModal({ item, given, onClose }) {
  const info = TRAP_INFO.rivals_tribute;
  // Character-exclusive items arrive in the rival's hands as their own
  // equivalent, so name it explicitly — otherwise the swap reads as a bug.
  const translated = given && given.id !== item.id ? given : null;
  const isSorcery = item.kind === "sorcery";
  const itemIcon = isSorcery ? (SORCERY_ICONS[item.id] || "🔮") : "✦";
  const extraImg = !isSorcery ? EXTRA_POSE_IMAGES[item.id] : null;
  const extraTone = !isSorcery ? EXTRA_POSE_BG_BY_HEIGHT[item.height] : null;
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 460, width: "92%",
        border: "2px solid #8a1620",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 24px rgba(138,22,32,0.45)",
      }}>
        <div style={{ fontSize: 13, color: "#8a1620", fontWeight: 700, marginBottom: 4, letterSpacing: 0.6 }}>
          ⚠ TRAP TRIGGERED
        </div>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{info.icon}</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>{info.title}</h2>
        <p style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.55, marginBottom: 14, color: "#6b4f1a" }}>
          {info.flavor}
        </p>
        <FramedIllustration src={MODAL_IMAGES.traps.rivals_tribute} alt={info.title} />
        <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.55, marginBottom: 14, color: "#5a4317" }}>
          The trap springs against you.
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 12,
          background: "#fff8e7",
          border: "1px solid #c4ad7b",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 16,
        }}>
          {extraImg ? (
            <div style={{
              width: 48, height: 48,
              flex: "0 0 auto",
              background: extraTone ? extraTone.bg : "#fff",
              borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
              boxShadow: "inset 0 0 0 1px rgba(212,175,55,0.55)",
            }}>
              <img
                src={extraImg}
                alt={item.name}
                style={{
                  maxWidth: "100%", maxHeight: "100%",
                  objectFit: "contain",
                  transform: "scale(1.2)",
                  display: "block",
                }}
              />
            </div>
          ) : (
            <span style={{ fontSize: 28 }}>{itemIcon}</span>
          )}
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: PALETTE.text }}>{item.name}</div>
            <div style={{ fontSize: 11, color: "#6b4f1a", marginTop: 2 }}>
              {isSorcery
                ? "Sorcery"
                : `Secret Technique — ${item.type} / ${item.height}`}
            </div>
          </div>
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.55, marginBottom: translated ? 10 : 22, color: "#5a4317" }}>
          It passes into your rival's hands.
        </p>
        {translated && (
          <p style={{ fontSize: 13, fontStyle: "italic", lineHeight: 1.55, marginBottom: 22, color: "#6b4f1a" }}>
            Your rival cannot wield it as you did. In their hands it becomes{" "}
            <strong style={{ fontStyle: "normal", color: PALETTE.text }}>{translated.name}</strong>.
          </p>
        )}
        <button style={BTN_PRIMARY} onClick={onClose}>Continue</button>
      </Draggable>
    </div>
  );
}

// ---- ItemModal -------------------------------------------------------------
// variant: "depleted" | "none" | "found"
// For "found": pass `item` with shape:
//   sorcery   → { kind: "sorcery", id, name, description }
//   extra pose → { kind: "extra_pose", id, name, type, height }

// ---- Sorcery modals --------------------------------------------------------

function SorceryConfirmModal({ sorceryId, title, prompt, detail, yesLabel, noLabel, onChoose }) {
  const sorc = SORCERY_BY_ID[sorceryId];
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 440, width: "92%",
        border: "2px solid #7a5500",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 24px rgba(122,85,0,0.35)",
      }}>
        <div style={{ fontSize: 13, color: "#7a5500", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
          ✦ SORCERY ✦
        </div>
        <div style={{ fontSize: 36, marginBottom: 6 }}>{SORCERY_ICONS[sorceryId] || "🔮"}</div>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 19 }}>{title || sorc?.name}</h2>
        <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 10, color: "#5a4317" }}>
          {prompt}
        </p>
        {detail && (
          <p style={{ fontSize: 12, fontStyle: "italic", lineHeight: 1.55, marginBottom: 18, color: "#7a5d00" }}>
            {detail}
          </p>
        )}
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button style={BTN_PRIMARY} onClick={() => onChoose(true)}>{yesLabel || "Yes — spend it"}</button>
          <button style={BTN_SECONDARY} onClick={() => onChoose(false)}>{noLabel || "No — keep it"}</button>
        </div>
      </Draggable>
    </div>
  );
}

function SorceryPickerModal({ sorceries, title, onPick, onCancel }) {
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 460, width: "92%",
        border: "2px solid #7a5500",
      }}>
        <div style={{ fontSize: 13, color: "#7a5500", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
          ✦ USE A SORCERY ✦
        </div>
        <h2 style={{ margin: "0 0 12px 0", fontSize: 19 }}>{title || "Choose a sorcery"}</h2>
        {sorceries.length === 0 ? (
          <p style={{ fontSize: 13, color: "#5a4317", fontStyle: "italic", marginBottom: 18 }}>
            You hold no sorcery you can use now.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
            {sorceries.map((s) => (
              <button
                key={s.id}
                onClick={() => onPick(s.id)}
                title={s.description}
                style={{
                  background: "#fff8e7",
                  border: "1px solid #c4ad7b",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontFamily: "Georgia, serif",
                  fontSize: 13,
                  color: PALETTE.text,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                  {SORCERY_ICONS[s.id] || "🔮"} {s.name}
                </div>
                <div style={{ fontSize: 11, fontStyle: "italic", color: "#6b4f1a" }}>
                  {s.description}
                </div>
              </button>
            ))}
          </div>
        )}
        <button style={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
      </Draggable>
    </div>
  );
}

function MagicCompassModal({ currentTile, onConfirm, onCancel }) {
  const [direction, setDirection] = useState("forward");
  const [distance, setDistance] = useState(1);
  const maxForward = Math.min(3, 64 - currentTile);
  const maxBackward = Math.min(3, currentTile - 1);
  const allowedMax = direction === "forward" ? maxForward : maxBackward;
  const validDistances = [1, 2, 3].filter((d) => d <= allowedMax);
  // If current selection is no longer valid, snap down.
  const effectiveDistance = validDistances.includes(distance) ? distance : (validDistances[0] || 0);
  const target = direction === "forward"
    ? currentTile + effectiveDistance
    : currentTile - effectiveDistance;
  const canGo = validDistances.length > 0;
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 440, width: "92%",
        border: "2px solid #7a5500",
      }}>
        <div style={{ fontSize: 13, color: "#7a5500", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
          ✦ SORCERY ✦
        </div>
        <div style={{ fontSize: 36, marginBottom: 6 }}>🧭</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>Magic Compass</h2>
        <p style={{ fontSize: 13, color: "#5a4317", marginBottom: 14 }}>
          Choose direction and exact distance. The chip moves to that destination.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#3a2c12" }}>
            <span style={{ marginRight: 6 }}>Direction:</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              style={{ fontFamily: "inherit", fontSize: 13, padding: "3px 6px" }}
            >
              <option value="forward">Forward →</option>
              <option value="backward">← Backward</option>
            </select>
          </label>
          <label style={{ fontSize: 13, color: "#3a2c12" }}>
            <span style={{ marginRight: 6 }}>Distance:</span>
            <select
              value={effectiveDistance || ""}
              onChange={(e) => setDistance(Number(e.target.value))}
              disabled={!canGo}
              style={{ fontFamily: "inherit", fontSize: 13, padding: "3px 6px" }}
            >
              {validDistances.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        <p style={{ fontSize: 12, color: "#6b4f1a", marginBottom: 18 }}>
          {canGo ? <>You will move from <strong>{currentTile === 0 ? "start" : `tile ${currentTile}`}</strong> to <strong>tile {target}</strong>.</> : "No valid destination — the path is bounded."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            style={{ ...BTN_PRIMARY, opacity: canGo ? 1 : 0.55, cursor: canGo ? "pointer" : "not-allowed" }}
            disabled={!canGo}
            onClick={() => onConfirm({ direction, distance: effectiveDistance, target })}
          >
            Confirm — spend it
          </button>
          <button style={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        </div>
      </Draggable>
    </div>
  );
}

function AncientKeyModal({ currentTile, onConfirm, onCancel }) {
  // Compute valid up/down jump targets given the snake-board geometry.
  const { row, col } = tileGridPos(currentTile);
  const upTile = row > 0 ? gridPosToTile(row - 1, col) : null;
  const downTile = row < ROWS - 1 ? gridPosToTile(row + 1, col) : null;
  const initialDir = downTile ? "forward" : (upTile ? "backward" : "forward");
  const [direction, setDirection] = useState(initialDir);
  const target = direction === "forward" ? downTile : upTile;
  const canGo = target != null;
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 440, width: "92%",
        border: "2px solid #7a5500",
      }}>
        <div style={{ fontSize: 13, color: "#7a5500", fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
          ✦ SORCERY ✦
        </div>
        <div style={{ fontSize: 36, marginBottom: 6 }}>🗝️</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>Ancient Key</h2>
        <p style={{ fontSize: 13, color: "#5a4317", marginBottom: 14 }}>
          Jump one full row from your current position.
        </p>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "#3a2c12" }}>
            <span style={{ marginRight: 6 }}>Direction:</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              style={{ fontFamily: "inherit", fontSize: 13, padding: "3px 6px" }}
            >
              {downTile && <option value="forward">Forward (one row down) →</option>}
              {upTile && <option value="backward">← Backward (one row up)</option>}
            </select>
          </label>
        </div>
        <p style={{ fontSize: 12, color: "#6b4f1a", marginBottom: 18 }}>
          {canGo
            ? <>You will move from <strong>tile {currentTile}</strong> to <strong>tile {target}</strong>.</>
            : "No adjacent row is available."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            style={{ ...BTN_PRIMARY, opacity: canGo ? 1 : 0.55, cursor: canGo ? "pointer" : "not-allowed" }}
            disabled={!canGo}
            onClick={() => onConfirm({ direction, target })}
          >
            Confirm — spend it
          </button>
          <button style={BTN_SECONDARY} onClick={onCancel}>Cancel</button>
        </div>
      </Draggable>
    </div>
  );
}

function ItemModal({ variant, item, onClose }) {
  if (variant === "depleted") {
    return (
      <div style={MODAL_OVERLAY}>
        <Draggable style={{ ...MODAL_BOX, maxWidth: 400, width: "90%" }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🧰</div>
          <h2 style={{ margin: "0 0 12px 0", fontSize: 19 }}>An Item Cache</h2>
          <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 22, color: "#5a4317" }}>
            You have already searched this place. Nothing remains for you.
          </p>
          <button style={BTN_PRIMARY} onClick={onClose}>Continue</button>
        </Draggable>
      </div>
    );
  }
  if (variant === "none") {
    return (
      <div style={MODAL_OVERLAY}>
        <Draggable style={{ ...MODAL_BOX, maxWidth: 400, width: "90%" }}>
          <div style={{ fontSize: 38, marginBottom: 8 }}>🧰</div>
          <h2 style={{ margin: "0 0 12px 0", fontSize: 19 }}>An Item Cache</h2>
          <p style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 22, color: "#5a4317" }}>
            You search carefully. You already possess everything this place has to offer.
          </p>
          <button style={BTN_PRIMARY} onClick={onClose}>Continue</button>
        </Draggable>
      </div>
    );
  }
  const isSorcery = item.kind === "sorcery";
  const def = isSorcery ? SORCERY_BY_ID[item.id] : null;
  const isItem = def && def.category === "item";
  const isPersistent = !!def?.persistent;
  const illustration = isSorcery
    ? MODAL_IMAGES.items[item.id]
    : EXTRA_POSE_IMAGES[item.id];
  let header;
  if (!isSorcery) header = "✦ RARE TECHNIQUE SCROLL ✦";
  else if (isItem) header = isPersistent ? "PERSISTENT ITEM FOUND" : "ITEM FOUND";
  else header = "SORCERY FOUND";
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 460, width: "92%",
        border: "2px solid #d4af37",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 32px rgba(212,175,55,0.45)",
      }}>
        <div style={{
          fontSize: 13,
          color: isSorcery ? "#7a5500" : "#8a6f1c",
          fontWeight: 700, marginBottom: 4, letterSpacing: 0.5,
        }}>
          {header}
        </div>
        <h2 style={{ margin: "0 0 12px 0", fontSize: 22 }}>
          {SORCERY_ICONS[item.id] && isSorcery ? `${SORCERY_ICONS[item.id]} ` : ""}{item.name}
          {isPersistent && <span style={{ fontSize: 14, color: "#7a5500", marginLeft: 6 }}>🔒</span>}
        </h2>
        <FramedIllustration src={illustration} alt={item.name} />
        {!isSorcery && (
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "#5a4317" }}>
            {item.type} / {item.height}
          </div>
        )}
        <p style={{ fontSize: 13, lineHeight: 1.6, marginBottom: isSorcery ? 22 : 12, color: "#5a4317", fontStyle: "italic" }}>
          {isSorcery
            ? item.description
            : "A secret technique scroll. It wins a round no more often than an ordinary strike of the same height — but it changes what that round is worth."}
        </p>
        {!isSorcery && techniqueKind(item) && (
          <div style={{
            textAlign: "left",
            background: "rgba(138,22,32,0.07)",
            border: "1px solid rgba(138,22,32,0.35)",
            borderRadius: 8, padding: "10px 12px", marginBottom: 22,
            fontSize: 12, lineHeight: 1.55, color: "#5a4317",
          }}>
            <div style={{ marginBottom: 6 }}>
              <strong>In a fight:</strong> {TECHNIQUE_DISCOVERY[techniqueKind(item)].board}
            </div>
            <div>
              <strong>In the final duel:</strong> {TECHNIQUE_DISCOVERY[techniqueKind(item)].duel}
            </div>
          </div>
        )}
        <button style={BTN_PRIMARY} onClick={onClose}>Pick Up</button>
      </Draggable>
    </div>
  );
}

// ---- StartScreen -----------------------------------------------------------
// Full-screen overlay shown before any game begins (and again after each
// "Start New Game" click in the final-duel post-game modal). Hosts a hero
// image, an intro story (default text from GameStartStory.js for now —
// later swapped with an LLM-generated text when user configures their LLM),
// and three actions: start, settings (future), share (future).

function StartScreen({ onStart, onSettings, onShare }) {
  const story = getGameStartStory();
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#0d0905",
      zIndex: 3000,
      display: "flex", justifyContent: "center", alignItems: "flex-start",
      overflowY: "auto",
      padding: "32px 16px",
      fontFamily: "Georgia, serif",
    }}>
      <div style={{
        maxWidth: 720, width: "100%",
        background: "#1a1008",
        border: "2px solid #d4af37",
        borderRadius: 14,
        padding: "28px 32px 32px 32px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
        color: "#f5e8c4",
        textAlign: "center",
      }}>
        <h1 style={{
          margin: "0 0 6px 0",
          fontSize: 28,
          letterSpacing: 1.5,
          color: "#d4af37",
        }}>
          Shaolin vs Ninja
        </h1>
        <div style={{ fontSize: 13, color: "#c4ad7b", fontStyle: "italic", marginBottom: 18 }}>
          A duel of fortune, fate, and martial wisdom.
        </div>
        {MODAL_IMAGES.gameStart && (
          <div style={{
            width: "100%",
            marginBottom: 22,
            border: "1px solid #d4af37",
            borderRadius: 10,
            boxShadow: "0 0 12px rgba(212,175,55,0.18)",
            overflow: "hidden",
            lineHeight: 0,
          }}>
            <img
              src={MODAL_IMAGES.gameStart}
              alt="Shaolin vs Ninja"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </div>
        )}
        <div style={{
          textAlign: "center",
          padding: "16px 18px",
          marginBottom: 24,
          background: "rgba(245,232,196,0.05)",
          border: "1px solid rgba(212,175,55,0.45)",
          borderRadius: 8,
          color: "#e8dcb0",
          fontSize: 14.5,
          lineHeight: 1.65,
        }}>
          {story.split(/\n\s*\n/).map((para, i) => (
            <p key={i} style={{ margin: i === 0 ? "0 0 12px 0" : "0 0 12px 0" }}>
              {para.trim()}
            </p>
          ))}
        </div>
        <div style={{
          display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap",
        }}>
          <button
            onClick={onStart}
            style={{
              ...BTN_PRIMARY,
              background: "#d4af37", color: "#1a1008",
              fontSize: 15, padding: "12px 28px",
            }}
          >
            ▶ Start Game
          </button>
          <button
            onClick={onSettings}
            title="Configure LLM and other options (coming soon)"
            style={{
              ...BTN_SECONDARY,
              background: "transparent",
              border: "1px solid #d4af37",
              color: "#d4af37",
              fontSize: 14, padding: "11px 22px",
            }}
          >
            ⚙ Settings
          </button>
          <button
            onClick={onShare}
            title="Share a link and preview to LinkedIn, GitHub, etc. (coming soon)"
            style={{
              ...BTN_SECONDARY,
              background: "transparent",
              border: "1px solid #d4af37",
              color: "#d4af37",
              fontSize: 14, padding: "11px 22px",
            }}
          >
            ↗ Share
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- FinalDuelIntroModal ---------------------------------------------------

function FinalDuelIntroModal({ onBegin }) {
  return (
    <div style={MODAL_OVERLAY}>
      <Draggable style={{ ...MODAL_BOX, maxWidth: 640, width: "94%", background: "#1a1008", border: "2px solid #d4af37", color: "#f5e8c4" }}>
        <div
          aria-label="Decisive Battle"
          title="決戰 — Decisive Battle"
          style={{
            fontSize: 60,
            lineHeight: 1,
            marginBottom: 12,
            color: "#d4af37",
            textShadow: "0 0 20px rgba(212,175,55,0.55), 0 2px 4px rgba(0,0,0,0.6)",
            fontFamily: '"Songti SC", "STKaiti", "DFKai-SB", "Noto Serif CJK SC", "SimSun", Georgia, serif',
            fontWeight: 700,
            letterSpacing: "0.15em",
          }}
        >
          決戰
        </div>
        <h2 style={{ margin: "0 0 8px 0", fontSize: 22, letterSpacing: 1, color: "#d4af37" }}>
          The rivals meet at last.
        </h2>
        <p style={{ fontSize: 16, fontStyle: "italic", marginBottom: 20, color: "#c4ad7b" }}>
          The ultimate duel begins.
        </p>
        {MODAL_IMAGES.finalDuel && (
          <div style={{
            width: "100%",
            marginBottom: 22,
            border: "1px solid #d4af37",
            borderRadius: 10,
            boxShadow: "0 0 12px rgba(212,175,55,0.18)",
            overflow: "hidden",
            lineHeight: 0,
          }}>
            <img
              src={MODAL_IMAGES.finalDuel}
              alt="The Final Duel"
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </div>
        )}
        <div style={{ display: "flex", gap: 20, justifyContent: "center", alignItems: "center", marginBottom: 28 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>🥋 Shaolin Master</span>
          <span style={{ fontSize: 18, color: "#d4af37" }}>vs</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#ff5252" }}>🥷 Ninja Warrior</span>
        </div>
        <button style={{ ...BTN_PRIMARY, background: "#d4af37", color: "#1a1008", fontSize: 15, padding: "11px 28px" }} onClick={onBegin}>
          Begin Duel
        </button>
      </Draggable>
    </div>
  );
}

// ---- BattleScreen ----------------------------------------------------------
// Best of 3 rounds. P1 = active player (rolled into the tile). P2 = the other.
// Pose sets are tied to character ("shaolin" → SHAOLIN poses, "ninja" → NINJA poses).
// Phases:
//   p1_choose → handoff_p2 → p2_choose → reveal (with optional dice subphase)
//   → either round_result → next round (handoff_p1 → p1_choose...) or → battle_end

// Fuller description shown once, on the item-found modal, when a technique is
// discovered. Both contexts are spelled out because the two behave differently.
const TECHNIQUE_DISCOVERY = {
  ghost: {
    board: "sudden death — whoever wins the round takes the whole fight. Your next fight then starts 1–0, in your favour if you won and against you if you lost.",
    duel:  "worth one round, and whoever wins it gains +1 on their next dice roll.",
  },
  thunder: {
    board: "sudden death — whoever wins the round takes the whole fight. A win is recorded as two victories; a loss destroys the technique (it returns to the pool and can be found again).",
    duel:  "a win takes two rounds. A loss gives your rival one round and destroys the technique.",
  },
  lotus: {
    board: "sudden death — whoever wins the round takes the whole fight. A win is recorded as two victories, a loss as two defeats, so your Combat Rating swings twice as far.",
    duel:  "two rounds to whoever wins it — the biggest swing available.",
  },
};

// Shown on a secret technique's pose card so the gamble is legible BEFORE the
// player commits. Wording mirrors the spec's two tables.
const TECHNIQUE_CARD_NOTE = {
  ghost: {
    board: "SUDDEN DEATH · winner of this round takes the fight. Next fight starts 1–0 either way.",
    duel:  "1 round either way, +1 dice to whoever wins it.",
  },
  thunder: {
    board: "SUDDEN DEATH · winner of this round takes the fight. Win = +2 rating. Lose = destroyed.",
    duel:  "Win = 2 rounds. Lose = 1 round to them, and destroyed.",
  },
  lotus: {
    board: "SUDDEN DEATH · winner of this round takes the fight. Rating swings +2 / −2.",
    duel:  "2 rounds either way.",
  },
};

function PoseCard({ pose, character, selected, onSelect, locked = false, flip = false, isFinal = false }) {
  const img = poseImageFor(character, pose);
  const isExtra = EXTRA_POSE_ID_SET.has(pose.id);
  const imgTransform = [flip ? "scaleX(-1)" : "", isExtra ? "scale(1.2)" : ""]
    .filter(Boolean)
    .join(" ");
  const typeColors = {
    Strike: { text: "#2a1000", bg: "#E2852E" },
    Block:  { text: "#3d2f08", bg: "#FFD45A" },
    Dodge:  { text: "#1c2a08", bg: "#BBCB64" },
  };
  const SELECTION = "#22c55e";
  const extraTone = isExtra ? EXTRA_POSE_BG_BY_HEIGHT[pose.height] : null;
  const cardBg = extraTone ? extraTone.bg : typeColors[pose.type].bg;
  const cardText = extraTone ? extraTone.text : typeColors[pose.type].text;
  return (
    <button
      onClick={onSelect}
      disabled={locked}
      aria-disabled={locked}
      style={{
        textAlign: "center",
        background: cardBg,
        border: `2px solid ${selected ? SELECTION : "transparent"}`,
        borderRadius: 10,
        padding: "8px 10px 10px 10px",
        cursor: locked ? "not-allowed" : "pointer",
        fontFamily: "Georgia, serif",
        color: cardText,
        minWidth: 140,
        boxShadow: selected
          ? `0 0 0 3px rgba(34,197,94,0.45)`
          : (isExtra ? "inset 0 0 0 1px rgba(212,175,55,0.55)" : "none"),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        position: "relative",
        filter: locked ? "grayscale(0.85) brightness(0.78)" : "none",
        opacity: locked ? 0.85 : 1,
      }}
    >
      {locked && (
        <>
          <div style={{
            position: "absolute", inset: 0,
            background: "rgba(20, 14, 6, 0.35)",
            borderRadius: 10,
            zIndex: 2,
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: 6, right: 6,
            fontSize: 22, zIndex: 3,
            textShadow: "0 0 6px rgba(0,0,0,0.65)",
          }}>💀</div>
          <div style={{
            position: "absolute", bottom: 6, left: 0, right: 0,
            textAlign: "center",
            fontSize: 11, fontWeight: 700, letterSpacing: 0.7,
            color: "#fff", zIndex: 3,
            textShadow: "0 1px 3px rgba(0,0,0,0.85)",
          }}>SEALED</div>
        </>
      )}
      <div style={{
        width: "100%",
        height: 110,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}>
        {img ? (
          <img
            src={img}
            alt={pose.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              display: "block",
              ...(imgTransform ? { transform: imgTransform } : {}),
            }}
          />
        ) : (
          <span style={{ fontSize: 11, color: "#999" }}>(no image)</span>
        )}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{pose.name}</div>
        <div style={{ fontSize: 12 }}>
          <strong>{pose.type}</strong> / {pose.height}
        </div>
        {techniqueKind(pose) && (
          <div style={{
            marginTop: 5,
            fontSize: 10, lineHeight: 1.3, fontWeight: 600,
            color: "#8a1620",
            borderTop: "1px solid rgba(138,22,32,0.3)",
            paddingTop: 4,
          }}>
            {TECHNIQUE_CARD_NOTE[techniqueKind(pose)][isFinal ? "duel" : "board"]}
          </div>
        )}
      </div>
    </button>
  );
}

function ScorePips({
  scores, p1Label, p2Label,
  onDark = false, nameColor = null, vsColor = null,
  p1PipColor = "#22c55e", p2PipColor = "#ff5252",
  winsToWin = 2,
}) {
  const Pip = ({ filled, color }) => (
    <span style={{
      display: "inline-block", width: 14, height: 14, borderRadius: "50%",
      background: filled ? color : "transparent",
      border: `2px solid ${color}`,
    }} />
  );
  const pipIndexes = Array.from({ length: winsToWin }, (_, i) => i + 1);
  return (
    <div style={{
      display: "flex", gap: 12, alignItems: "center", justifyContent: "center",
      margin: "8px 0 16px 0", fontSize: 13, flexWrap: "wrap",
    }}>
      <span style={{ display: "inline-flex", gap: 4 }}>
        {pipIndexes.map((n) => (
          <Pip key={n} filled={scores.p1 >= n} color={p1PipColor} />
        ))}
      </span>
      <strong style={{ color: nameColor || "#22c55e" }}>{p1Label}</strong>
      <span style={{ color: vsColor || (onDark ? "#e8d2a0" : "#7a5500"), fontWeight: 700 }}>Vs.</span>
      <strong style={{ color: nameColor || "#ff5252" }}>{p2Label}</strong>
      <span style={{ display: "inline-flex", gap: 4 }}>
        {pipIndexes.map((n) => (
          <Pip key={n} filled={scores.p2 >= n} color={p2PipColor} />
        ))}
      </span>
    </div>
  );
}

// ---- Combat juice ----------------------------------------------------------
// Purely cosmetic feedback on key battle beats — a colour flash and a screen
// shake — driven by the Web Animations API so there is no global CSS and each
// effect self-cleans. Nothing here touches game state or outcomes.
function FlashOverlay({ flash }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!flash || !el) return;
    // A "fill" flash covers the screen; otherwise a vignette that stays clear in
    // the centre so result text remains readable.
    el.style.background = flash.fill
      ? flash.color
      : `radial-gradient(circle at center, transparent 45%, ${flash.color} 100%)`;
    const anim = el.animate(
      [{ opacity: flash.peak != null ? flash.peak : 1 }, { opacity: 0 }],
      { duration: flash.dur || 400, easing: "ease-out" }
    );
    return () => anim.cancel();
  }, [flash ? flash.n : 0]);
  return <div ref={ref} style={{ position: "fixed", inset: 0, pointerEvents: "none", opacity: 0, zIndex: 2600 }} />;
}

// Celebratory burst for the duel's deciding moment — Asian-style pieces
// (blossoms, lanterns, gold) erupt from the centre and drift down. Purely
// cosmetic; pointer-events none; clears itself after the animation.
function ConfettiBurst({ burst }) {
  const ref = useRef(null);
  const [pieces, setPieces] = useState([]);

  useEffect(() => {
    if (!burst) return;
    const glyphs = ["🌸", "🏮", "🌸", "✨", "🪙", "🌸", "❁", "🎋", "🌸", "🧧"];
    const W = typeof window !== "undefined" ? window.innerWidth : 1000;
    const H = typeof window !== "undefined" ? window.innerHeight : 700;
    setPieces(Array.from({ length: 44 }, (_, i) => ({
      glyph: glyphs[i % glyphs.length],
      dx: (Math.random() * 2 - 1) * W * 0.45,
      dy: H * (0.35 + Math.random() * 0.55),
      up: 50 + Math.random() * 150,
      rot: (Math.random() * 2 - 1) * 600,
      dur: 4800 + Math.random() * 3000,   // ~3x longer: slow, lingering drift
      delay: Math.random() * 800,
      size: 18 + Math.random() * 22,
    })));
  }, [burst ? burst.n : 0]);

  useEffect(() => {
    if (!pieces.length || !ref.current) return;
    const kids = ref.current.children;
    pieces.forEach((p, i) => {
      const el = kids[i];
      if (!el) return;
      el.animate(
        [
          { transform: "translate(0px,0px) scale(0.4) rotate(0deg)", opacity: 0 },
          { opacity: 1, offset: 0.12, transform: `translate(${p.dx * 0.35}px, ${-p.up}px) scale(1) rotate(${p.rot * 0.2}deg)` },
          { transform: `translate(${p.dx}px, ${p.dy}px) scale(1) rotate(${p.rot}deg)`, opacity: 0 },
        ],
        { duration: p.dur, delay: p.delay, easing: "cubic-bezier(.16,.7,.4,1)", fill: "forwards" }
      );
    });
    const t = setTimeout(() => setPieces([]), 8800);
    return () => clearTimeout(t);
  }, [pieces]);

  if (!pieces.length) return null;
  return (
    <div ref={ref} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2700, overflow: "hidden" }}>
      {pieces.map((p, i) => (
        <div key={i} style={{ position: "absolute", left: "50%", top: "42%", fontSize: p.size, opacity: 0, willChange: "transform, opacity" }}>{p.glyph}</div>
      ))}
    </div>
  );
}

// ---- FightReferenceModal ---------------------------------------------------
// A read-only "how fights work" overlay: the base pose matchups plus what each
// of the viewing player's secret techniques does, on the board and in the duel.
// Matchup cells are derived by calling the real resolveCombat so they can never
// drift; technique win/loss text lives in TECHNIQUE_REFERENCE.
const REFERENCE_HEIGHTS = ["High", "Mid", "Low"];
const REF_WIN_COLOR = { Strike: "#c0491f", Block: "#3a5fb0", Dodge: "#2f8f56", Dice: "#8a7a55" };

// Full Win/Defeat breakdown per technique for the fight reference. Matches the
// implementation (nextRound / duelResolution) and GAME_SPEC.
const TECHNIQUE_REFERENCE = {
  ghost: {
    board: { win: "+1 rating, and your next fight starts 1–0 in your favour", loss: "−1 rating, and your next fight starts 0–1 against you" },
    duel:  { win: "you win 1 round, and +1 to dice in your next dice round", loss: "your rival wins 1 round, and +1 to their next dice round" },
  },
  thunder: {
    board: { win: "+2 rating", loss: "−1 rating, and the technique is destroyed" },
    duel:  { win: "you win 2 rounds", loss: "your rival wins 1 round, and your technique is destroyed" },
  },
  lotus: {
    board: { win: "+2 rating", loss: "−2 rating" },
    duel:  { win: "you win 2 rounds", loss: "your rival wins 2 rounds" },
  },
};

function matchupWinner(strikeHeight, defenderType, defenderHeight) {
  const res = resolveCombat(
    { type: "Strike", height: strikeHeight },
    { type: defenderType, height: defenderHeight }
  );
  if (res.winner === "p1") return "Strike";
  if (res.winner === "p2") return defenderType; // "Block" or "Dodge"
  return "Dice";
}

function MatchupGrid({ defenderType }) {
  const cell = (key, txt) => (
    <td key={key} style={{
      padding: "6px 7px", textAlign: "center", fontSize: 12.5, fontWeight: 700,
      color: "#fff", background: REF_WIN_COLOR[txt], borderRadius: 4, minWidth: 50,
    }}>{txt}</td>
  );
  const head = (key, txt, dim) => (
    <th key={key} style={{ padding: "3px 7px", fontSize: dim ? 10.5 : 12, color: dim ? "#8a7a55" : "#5a4317", fontWeight: 700 }}>{txt}</th>
  );
  return (
    <table style={{ borderCollapse: "separate", borderSpacing: 3, margin: 0 }}>
      <thead>
        <tr>
          {head("corner", `S↓ / ${defenderType[0]}→`, true)}
          {REFERENCE_HEIGHTS.map((h) => head(`h-${h}`, h))}
        </tr>
      </thead>
      <tbody>
        {REFERENCE_HEIGHTS.map((sh) => (
          <tr key={sh}>
            {head(`r-${sh}`, sh)}
            {REFERENCE_HEIGHTS.map((dh) => cell(`${sh}-${dh}`, matchupWinner(sh, defenderType, dh)))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FightReferenceModal({ character, isFinal, heldExtraIds = [], onClose }) {
  const extras = character === "shaolin" ? EXTRA_POSES_SHAOLIN : EXTRA_POSES_NINJA;
  const held = new Set(heldExtraIds);
  const colHead = (label, active) => (
    <th style={{
      padding: "3px 9px", fontSize: 12, textAlign: "left",
      color: active ? "#7a5500" : "#8a7a55", fontWeight: 800,
      borderBottom: "2px solid #d9c99b",
    }}>{label}{active ? " ◄" : ""}</th>
  );
  const stakeCell = (wl, active) => (
    <td style={{
      padding: "7px 9px", fontSize: 12, lineHeight: 1.4, verticalAlign: "top",
      background: active ? "#faefd0" : "transparent",
      color: active ? "#3a2c0e" : "#9a8b6a",
    }}>
      <div><strong style={{ color: active ? "#2f7d46" : "#96a693" }}>Win</strong> = {wl.win}</div>
      <div style={{ marginTop: 3 }}><strong style={{ color: active ? "#a8261b" : "#b39a9a" }}>Defeat</strong> = {wl.loss}</div>
    </td>
  );

  return (
    <div style={{ ...MODAL_OVERLAY, zIndex: 3000 }}>
      <Draggable style={{
        ...MODAL_BOX, maxWidth: 620, width: "94%",
        padding: "18px 22px", textAlign: "left",
        maxHeight: "94vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: "#7a5500" }}>How Fights Work</h2>
          <span style={{ fontSize: 12, color: "#8a7a55" }}>{isFinal ? "Ultimate Duel" : "Board fight"}</span>
        </div>

        <div style={{ display: "flex", gap: 34, flexWrap: "wrap", justifyContent: "flex-start" }}>
          <div><div style={{ fontSize: 13, fontWeight: 800, color: "#5a4317", marginBottom: 4 }}>Strike vs Dodge</div><MatchupGrid defenderType="Dodge" /></div>
          <div><div style={{ fontSize: 13, fontWeight: 800, color: "#5a4317", marginBottom: 4 }}>Strike vs Block</div><MatchupGrid defenderType="Block" /></div>
        </div>
        <div style={{ fontSize: 13, color: "#5a4317", margin: "14px 0 4px", fontWeight: 600 }}>
          Every other pairing is decided by <strong style={{ color: "#8a5a00" }}>dice</strong>.
        </div>

        <h3 style={{ fontSize: 16, color: "#5a4317", margin: "16px 0 4px 0" }}>Secret techniques</h3>
        <div style={{ fontSize: 12, color: "#8a7a55", marginBottom: 8 }}>
          A technique wins its round no more often than a normal strike — only the stakes change.
        </div>
        <div style={{
          margin: "0 0 12px", padding: "9px 13px",
          background: "#fbe6c4", borderLeft: "4px solid #c0491f", borderRadius: 5,
          fontSize: 13.5, color: "#4a3814", lineHeight: 1.4,
        }}>
          On the board, every technique is <strong style={{ color: "#c0491f", fontWeight: 800, letterSpacing: 0.3 }}>SUDDEN DEATH</strong> — the round winner takes the whole fight.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {colHead("Technique", false)}
              {colHead("On the board", !isFinal)}
              {colHead("In the duel", isFinal)}
            </tr>
          </thead>
          <tbody>
            {extras.map((p) => {
              const ref = TECHNIQUE_REFERENCE[TECHNIQUE_KIND[p.id]];
              const owned = held.has(p.id);
              return (
                <tr key={p.id} style={{ borderTop: "1px solid #eaddb8" }}>
                  <td style={{ padding: "7px 9px", fontSize: 12.5, verticalAlign: "top" }}>
                    <div style={{ fontWeight: 800, color: "#4a3814" }}>
                      {p.name}{owned && <span style={{ color: "#7a5500" }}> ✦</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#8a7a55" }}>Strike / {p.height}</div>
                  </td>
                  {stakeCell(ref.board, !isFinal)}
                  {stakeCell(ref.duel, isFinal)}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button style={BTN_PRIMARY} onClick={onClose}>Close</button>
        </div>
      </Draggable>
    </div>
  );
}

function BattleScreen({
  mode = "duel", ninjaType, activeCharacter, otherCharacter,
  p1Label, p2Label, p1Extras = [], p2Extras = [],
  p1LockedType = null, p2LockedType = null,
  p1Sorceries = [], p2Sorceries = [],
  onSpendSorcery = () => {},
  onDestroyTechnique = () => {},
  headStart = null,           // "p1" | "p2" — board fights only (Ghost Walk)
  isFinal = false,
  p1CombatRating = 0, p2CombatRating = 0,
  onResolved,
}) {
  const winsToWin = isFinal ? 3 : 2;
  const maxRounds = winsToWin * 2 - 1;
  // Combat Rating dice modifier only applies in the final duel.
  const p1Mod = isFinal ? combatRatingDiceModifier(p1CombatRating) : 0;
  const p2Mod = isFinal ? combatRatingDiceModifier(p2CombatRating) : 0;
  function playerHas(player, sorceryId) {
    const list = player === "p1" ? p1Sorceries : p2Sorceries;
    return list.some((s) => s.id === sorceryId);
  }
  const isSolo = mode === "solo";
  const p1Character = activeCharacter;
  // In solo mode the opponent is the on-tile computer ninja. Its images live in
  // a per-kind folder keyed "{kind}-ninja" (black-ninja, shadow-ninja, …), which
  // also keeps it distinct from the player hero ninja ("ninja").
  const p2Character = isSolo ? `${ninjaType}-ninja` : otherCharacter;
  // A Thunder Dragon destroyed mid-duel must vanish from the pose list for the
  // remaining rounds. p1Extras/p2Extras are a snapshot taken when the battle
  // opened, so the parent's inventory update alone would not remove it here.
  const [destroyedIds, setDestroyedIds] = useState({ p1: [], p2: [] });
  function destroyTechnique(player, poseId) {
    setDestroyedIds((prev) => ({ ...prev, [player]: [...prev[player], poseId] }));
    onDestroyTechnique(player, poseId);
  }
  const p1Poses = (p1Character === "shaolin" ? BASE_POSES_SHAOLIN : BASE_POSES_NINJA)
    .concat(p1Extras)
    .filter((p) => !destroyedIds.p1.includes(p.id));
  // CPU enemies in solo mode use only the base pose set for now.
  const p2Poses = isSolo
    ? BASE_POSES_NINJA
    : (p2Character === "shaolin" ? BASE_POSES_SHAOLIN : BASE_POSES_NINJA)
        .concat(p2Extras)
        .filter((p) => !destroyedIds.p2.includes(p.id));

  // First chooser of the round and current device holder. Both default to p1
  // (the active player who triggered the battle). In the final duel, Oracle's
  // Eye possession reorders the round so the Eye holder picks SECOND.
  const [firstChooser, setFirstChooser] = useState(() => {
    if (!isFinal || isSolo) return "p1";
    const p1Eye = p1Sorceries.some((s) => s.id === "oracle_eye");
    const p2Eye = p2Sorceries.some((s) => s.id === "oracle_eye");
    if (p1Eye && !p2Eye) return "p2";
    return "p1";
  });
  const [deviceHolder, setDeviceHolder] = useState("p1");
  // "How fights work" reference overlay. Holds the player ("p1"/"p2") who
  // opened it, so it shows that player's own techniques; null when closed.
  const [referencePlayer, setReferencePlayer] = useState(null);
  // Combat juice (cosmetic). A shake wrapper around the battle content and a
  // flash overlay; both fire on key beats and touch no game state.
  const shakeRef = useRef(null);
  const [flash, setFlash] = useState(null); // { color, fill, peak, dur, n } | null
  const [burst, setBurst] = useState(null); // { n } | null — confetti trigger
  const juiceN = useRef(0);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function triggerFlash(color, opts = {}) {
    juiceN.current += 1;
    setFlash({ color, fill: !!opts.fill, peak: opts.peak, dur: opts.dur || 400, n: juiceN.current });
  }
  function triggerBurst() {
    juiceN.current += 1;
    setBurst({ n: juiceN.current });
  }
  // Decaying random shake over `dur` ms. Skipped under reduced motion.
  function doShake(px, dur = 450) {
    if (reduceMotion || !shakeRef.current) return;
    const steps = Math.max(5, Math.round(dur / 70));
    const frames = [{ transform: "translate(0px,0px)" }];
    for (let i = 1; i < steps; i++) {
      const a = px * (1 - i / steps); // amplitude decays toward the end
      frames.push({ transform: `translate(${(Math.random() * 2 - 1) * a}px, ${(Math.random() * 2 - 1) * a * 0.7}px)` });
    }
    frames.push({ transform: "translate(0px,0px)" });
    shakeRef.current.animate(frames, { duration: dur, easing: "ease-in-out" });
  }
  const [phase, setPhase] = useState(() => {
    if (!isFinal || isSolo) return "p1_choose";
    const p1Eye = p1Sorceries.some((s) => s.id === "oracle_eye");
    const p2Eye = p2Sorceries.some((s) => s.id === "oracle_eye");
    if (p1Eye && p2Eye) return "oracle_cancel";
    // Oracle's Eye reorder: p2 chooses first. No "Pass the device" modal
    // before round 1 — players hand off the device themselves.
    if (p1Eye && !p2Eye) return "p2_choose";
    return "p1_choose";
  });
  const [round, setRound] = useState(1);
  // A Ghost Walk result in the previous board fight starts this one at 1-0.
  const [scores, setScores] = useState(() => ({
    p1: headStart === "p1" ? 1 : 0,
    p2: headStart === "p2" ? 1 : 0,
  }));
  // Pending Ghost Walk dice bonus (+1), duel only. Awarded to the winner of a
  // Ghost Walk round and spent on that player's next dice-decided round.
  const [diceBonus, setDiceBonus] = useState({ p1: 0, p2: 0 });
  // Extra result detail handed to the parent when a board fight ends.
  const [techniqueResult, setTechniqueResult] = useState(null);
  const [p1Choice, setP1Choice] = useState(null);
  const [p2Choice, setP2Choice] = useState(null);
  const [selecting, setSelecting] = useState(null); // current tentative pick
  const [outcome, setOutcome] = useState(null);     // { winner, reason }
  const [dice, setDice] = useState(null);           // { p1, p2, tries }
  const [finalWinner, setFinalWinner] = useState(null); // "p1" | "p2"
  // The winner-portrait image lives in MODAL_IMAGES. Even with the module-init
  // preload it can take a beat for the decoded bitmap to be ready, so we hold
  // the end-screen render until decode resolves — otherwise the modal paints
  // with an empty 0-height <img> and visibly re-layouts when the picture
  // finally appears.
  const [winnerImageReady, setWinnerImageReady] = useState(false);

  // Oracle's Eye reveal flags per player (one use per round).
  const [revealedByP1, setRevealedByP1] = useState(false);
  const [revealedByP2, setRevealedByP2] = useState(false);
  // Magic Powder pending — "p1" or "p2" string of the player who must decide,
  // or null. While truthy, the round result is on hold awaiting the choice.
  const [magicPowderPending, setMagicPowderPending] = useState(null);
  // Iron Bell — the round resolved as a loss; offer ring/decline until decided.
  const [ironBellDeclined, setIronBellDeclined] = useState(false);

  // Combat juice: fire once per round, only when the result is COMMITTED — i.e.
  // after any Magic Powder / Iron Bell decision, never on a result that a replay
  // could rewind. A technique burst (gold), or a strike impact when the winner's
  // pose is a Strike (this includes dice-decided rounds such as two kicks).
  const juiceFiredRef = useRef(false);
  useEffect(() => {
    if (!finalWinner) { juiceFiredRef.current = false; return; } // new round → reset
    if (phase !== "reveal") return;
    if (magicPowderPending) return;                              // wait for the re-roll choice
    const loser = finalWinner === "p1" ? "p2" : "p1";
    if (playerHas(loser, "iron_bell") && !ironBellDeclined) return; // wait for the bell choice
    if (juiceFiredRef.current) return;                          // once per committed result
    juiceFiredRef.current = true;

    const techniquePlayed = !!techniqueKind(p1Choice) || (!isSolo && !!techniqueKind(p2Choice));
    if (techniquePlayed) {
      triggerFlash("rgba(212,175,55,0.85)", { dur: 570 });
      doShake(7, 450);
      return;
    }
    const winnerPose = finalWinner === "p1" ? p1Choice : p2Choice;
    if (winnerPose && winnerPose.type === "Strike") {
      // White when a player lands the strike (both sides are players in the
      // duel); red when the computer enemy lands it in a board fight.
      const playerStruck = isFinal || finalWinner === "p1";
      triggerFlash(playerStruck ? "rgba(255,255,255,0.85)" : "rgba(200,60,30,0.72)", { dur: 570 });
      doShake(9, 450);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, finalWinner, magicPowderPending, ironBellDeclined]);

  // Combat juice: the duel's deciding moment — a sustained shake, an Asian-style
  // confetti burst, and a soft lingering gold glow (no quick white flash).
  useEffect(() => {
    if (phase === "battle_end" && isFinal) {
      doShake(8, 3000);                       // no-ops under reduced motion
      if (!reduceMotion) triggerBurst();      // skip the flying confetti too
      triggerFlash("rgba(212,175,55,0.55)", { peak: 0.7, dur: 2600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Final duel + both players hold Oracle's Eye → cancel out: spend both
  // on mount. The "oracle_cancel" phase is shown briefly then the user
  // continues to standard pose selection.
  useEffect(() => {
    if (!isFinal || isSolo) return;
    const p1Eye = p1Sorceries.some((s) => s.id === "oracle_eye");
    const p2Eye = p2Sorceries.some((s) => s.id === "oracle_eye");
    if (p1Eye && p2Eye) {
      onSpendSorcery("p1", "oracle_eye");
      onSpendSorcery("p2", "oracle_eye");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-decode BOTH possible winner portraits as soon as the duel mounts so
  // that, by the time the player has read the deciding round's reveal screen
  // and clicked End battle, the end-screen modal can paint the portrait in the
  // same frame — no empty-image gap between the reveal and the winner image.
  useEffect(() => {
    if (isSolo || !isFinal) return;
    const urls = [
      MODAL_IMAGES.finalDuelWin.shaolin,
      MODAL_IMAGES.finalDuelWin.ninja,
    ].filter(Boolean);
    if (urls.length === 0) { setWinnerImageReady(true); return; }
    let cancelled = false;
    let pending = urls.length;
    const tick = () => { if (--pending <= 0 && !cancelled) setWinnerImageReady(true); };
    for (const url of urls) {
      const img = new Image();
      img.src = url;
      if (typeof img.decode === "function") {
        img.decode().then(tick).catch(tick);
      } else {
        img.onload = tick;
        img.onerror = tick;
      }
    }
    return () => { cancelled = true; };
  }, [isSolo, isFinal]);

  function confirmP1() {
    if (!selecting) return;
    const p1 = selecting;
    setP1Choice(p1);
    setSelecting(null);
    if (isSolo) {
      // Oracle's Eye may have pre-computed p2Choice. If so, reuse it.
      const cpu = p2Choice || pickComputerPose(ninjaType);
      if (!p2Choice) setP2Choice(cpu);
      const result = resolveCombat(p1, cpu);
      setOutcome(result);
      if (result.winner !== "dice") setFinalWinner(result.winner);
      setPhase("reveal");
    } else if (firstChooser === "p1") {
      // p1 is first chooser → hand the device to p2 next.
      setPhase("handoff_p2");
    } else {
      // p1 is the second chooser (final-duel Oracle's Eye reorder): p2 has
      // already locked their pose, so resolve combat immediately.
      const result = resolveCombat(p1, p2Choice);
      setOutcome(result);
      if (result.winner !== "dice") setFinalWinner(result.winner);
      setDeviceHolder("p1");
      setPhase("reveal");
    }
  }

  function useOracleEye(player) {
    // Reveal the enemy's pose for this round. Solo: compute CPU pose now if
    // not already. Duel: only meaningful for p2 (p1 has already committed).
    if (player === "p1") {
      if (isSolo) {
        const cpu = p2Choice || pickComputerPose(ninjaType);
        if (!p2Choice) setP2Choice(cpu);
        setRevealedByP1(true);
      } else if (p2Choice) {
        setRevealedByP1(true);
      }
    } else {
      if (p1Choice) setRevealedByP2(true);
    }
    onSpendSorcery(player, "oracle_eye");
  }
  function readyFor(player) {
    setDeviceHolder(player);
    setPhase(player === "p1" ? "p1_choose" : "p2_choose");
  }
  function confirmP2() {
    if (!selecting) return;
    const p2 = selecting;
    setP2Choice(p2);
    setSelecting(null);
    if (firstChooser === "p2") {
      // p2 is first chooser (final-duel Oracle's Eye reorder): hand the
      // device to p1 next so they can pick with the auto-reveal.
      setPhase("handoff_p1");
      return;
    }
    const result = resolveCombat(p1Choice, p2);
    setOutcome(result);
    if (result.winner !== "dice") {
      setFinalWinner(result.winner);
    }
    setDeviceHolder("p2");
    setPhase("reveal");
  }
  function heldWeapon(player) {
    // The Sword and Nunchaku grant one identical bonus; a player can hold at
    // most one in normal play (one via theft), so picking either is sufficient.
    return WEAPON_ITEM_IDS.find((id) => playerHas(player, id)) || null;
  }
  function rollOnce() {
    // One synchronous dice roll with the weapon bonus applied per side, plus
    // the Combat Rating modifier (final duel only — p1Mod/p2Mod are 0 elsewhere).
    // If a player holds a weapon (Sword/Nunchaku), roll two d6 and keep the
    // higher result; the Combat Rating modifier is then added to that result.
    // Returns { p1, p2, p1Final, p2Final, p1Extra, p2Extra, p1Weapon, p2Weapon,
    //          p1Mod, p2Mod } where p1/p2 are the natural (pre-modifier) dice
    // values shown to the player and p1Final/p2Final decide the round.
    const p1Weapon = heldWeapon("p1");
    const p2Weapon = heldWeapon("p2");
    let p1, p2, p1Extra = null, p2Extra = null;
    if (p1Weapon) {
      const a1 = Math.floor(Math.random() * 6) + 1;
      const a2 = Math.floor(Math.random() * 6) + 1;
      p1 = Math.max(a1, a2);
      p1Extra = { a: a1, b: a2 };
    } else {
      p1 = Math.floor(Math.random() * 6) + 1;
    }
    if (p2Weapon) {
      const b1 = Math.floor(Math.random() * 6) + 1;
      const b2 = Math.floor(Math.random() * 6) + 1;
      p2 = Math.max(b1, b2);
      p2Extra = { a: b1, b: b2 };
    } else {
      p2 = Math.floor(Math.random() * 6) + 1;
    }
    // A pending Ghost Walk bonus adds on top of the Combat Rating modifier and
    // applies to every roll of this round, re-rolls included.
    return {
      p1, p2,
      p1Final: p1 + p1Mod + diceBonus.p1,
      p2Final: p2 + p2Mod + diceBonus.p2,
      p1Extra, p2Extra,
      p1Weapon, p2Weapon,
      p1Mod: p1Mod + diceBonus.p1,
      p2Mod: p2Mod + diceBonus.p2,
    };
  }

  function rollDice() {
    let res, tries = 0;
    do {
      res = rollOnce();
      tries++;
    } while (res.p1Final === res.p2Final);
    setDice({ ...res, tries });
    const winner = res.p1Final > res.p2Final ? "p1" : "p2";
    const loser = winner === "p1" ? "p2" : "p1";
    // Magic Powder: if the natural roll went against a player who holds it,
    // pause and offer a re-roll before locking in the result.
    if (playerHas(loser, "magic_powder")) {
      setMagicPowderPending(loser);
    } else {
      setFinalWinner(winner);
    }
  }

  function useMagicPowder() {
    const who = magicPowderPending;
    if (!who) return;
    onSpendSorcery(who, "magic_powder");
    setMagicPowderPending(null);
    // Re-roll both dice; Sword bonus and Combat Rating modifier (if any) still
    // apply. The new result stands no matter what.
    let res, tries = 0;
    do {
      res = rollOnce();
      tries++;
    } while (res.p1Final === res.p2Final);
    setDice({ ...res, tries });
    setFinalWinner(res.p1Final > res.p2Final ? "p1" : "p2");
  }

  function declineMagicPowder() {
    // Original dice loss stands.
    if (!dice) return;
    const winner = dice.p1Final > dice.p2Final ? "p1" : "p2";
    setMagicPowderPending(null);
    setFinalWinner(winner);
  }

  // Compute the round-starting phase given the current device holder and the
  // recomputed first chooser. Updates firstChooser. Final-duel Oracle's Eye
  // reorder only applies when exactly one player still holds the Eye.
  function beginRoundAfterReset() {
    if (isSolo) {
      setPhase("p1_choose");
      return;
    }
    let nextFC = "p1";
    if (isFinal) {
      const p1Eye = playerHas("p1", "oracle_eye");
      const p2Eye = playerHas("p2", "oracle_eye");
      if (p1Eye && !p2Eye) nextFC = "p2";
      // Both / only-p2 / neither all keep standard "p1" first order.
    }
    setFirstChooser(nextFC);
    if (deviceHolder === nextFC) {
      setPhase(nextFC === "p1" ? "p1_choose" : "p2_choose");
    } else {
      setPhase(nextFC === "p1" ? "handoff_p1" : "handoff_p2");
    }
  }
  function ringIronBell(player) {
    // Spend the bell and replay the round — scores untouched.
    onSpendSorcery(player, "iron_bell");
    setP1Choice(null);
    setP2Choice(null);
    setOutcome(null);
    setDice(null);
    setFinalWinner(null);
    setSelecting(null);
    setRevealedByP1(false);
    setRevealedByP2(false);
    setMagicPowderPending(null);
    setIronBellDeclined(false);
    beginRoundAfterReset();
  }
  // Duel resolution when one or both sides played a secret technique. There is
  // no cancellation: each technique resolves its OWN owner's rider, and the
  // round is worth the larger of the awards in play. Single source of truth for
  // both the score change and the explanatory text.
  function duelResolution(winner) {
    const p1Tech = techniqueKind(p1Choice);
    const p2Tech = isSolo ? null : techniqueKind(p2Choice);
    let award = 1;
    let bonusTo = null;
    const destroy = [];
    for (const owner of ["p1", "p2"]) {
      const kind = owner === "p1" ? p1Tech : p2Tech;
      if (!kind) continue;
      const choice = owner === "p1" ? p1Choice : p2Choice;
      const ownerWon = winner === owner;
      if (kind === "ghost") {
        bonusTo = winner;                       // always to the round's winner
      } else if (kind === "thunder") {
        if (ownerWon) award = Math.max(award, 2);
        else destroy.push({ owner, id: choice.id });
      } else {
        award = Math.max(award, 2);             // lotus: 2 rounds either way
      }
    }
    return { award, bonusTo, destroy, p1Tech, p2Tech };
  }

  function nextRound() {
    const winner = finalWinner;
    // A CPU ninja's extra poses are pure flourish — only a human player's
    // secret technique carries a rider.
    const p1Tech = techniqueKind(p1Choice);
    const p2Tech = isSolo ? null : techniqueKind(p2Choice);

    // ---- Board fight: a secret technique is sudden death ----------------
    if (!isFinal && p1Tech) {
      const won = winner === "p1";
      let logEntries = 1;
      let nextHeadStart = null;
      if (p1Tech === "thunder") {
        if (won) logEntries = 2;
        else destroyTechnique("p1", p1Choice.id);
      } else if (p1Tech === "lotus") {
        logEntries = 2;
      } else if (p1Tech === "ghost") {
        nextHeadStart = won ? "self" : "opponent";
      }
      setTechniqueResult({ kind: p1Tech, won, logEntries, headStart: nextHeadStart });
      setScores(won ? { ...scores, p1: winsToWin } : { ...scores, p2: winsToWin });
      setPhase("battle_end");
      return;
    }

    // ---- Round award -----------------------------------------------------
    // Duel only: a technique changes how many rounds the round is worth. Two
    // techniques in the same round cancel — ordinary round, nothing destroyed,
    // no dice bonus.
    let award = 1;
    let bonusTo = null;
    if (isFinal && (p1Tech || p2Tech)) {
      const res = duelResolution(winner);
      award = res.award;
      bonusTo = res.bonusTo;
      for (const d of res.destroy) destroyTechnique(d.owner, d.id);
    }

    const newScores = { ...scores, [winner]: scores[winner] + award };
    setScores(newScores);
    // A pending bonus is spent by any round that actually went to dice.
    setDiceBonus((prev) => {
      const spent = dice ? { p1: 0, p2: 0 } : prev;
      // Refreshed, never stacked.
      return bonusTo ? { ...spent, [bonusTo]: 1 } : spent;
    });
    if (newScores.p1 >= winsToWin || newScores.p2 >= winsToWin) {
      setPhase("battle_end");
    } else {
      setRound((r) => r + 1);
      setP1Choice(null);
      setP2Choice(null);
      setOutcome(null);
      setDice(null);
      setFinalWinner(null);
      setSelecting(null);
      setRevealedByP1(false);
      setRevealedByP2(false);
      setMagicPowderPending(null);
      setIronBellDeclined(false);
      // No "Pass the device" modal between rounds — players physically hand
      // the device back to the default first chooser themselves. Shaolin
      // (p1) always picks first, except when only one player still holds
      // Oracle's Eye (the Eye holder must pick SECOND). Within the new
      // round, the standard handoff still appears between the two picks.
      if (isSolo) {
        setPhase("p1_choose");
      } else {
        let nextFC = "p1";
        if (isFinal) {
          const p1Eye = playerHas("p1", "oracle_eye");
          const p2Eye = playerHas("p2", "oracle_eye");
          if (p1Eye && !p2Eye) nextFC = "p2";
        }
        setFirstChooser(nextFC);
        setPhase(nextFC === "p1" ? "p1_choose" : "p2_choose");
      }
    }
  }
  // One line describing what the secret technique just did, shown after the
  // round resolves. `winner` is the round winner.
  function techniqueNote(winner) {
    const p1Tech = techniqueKind(p1Choice);
    const p2Tech = isSolo ? null : techniqueKind(p2Choice);
    if (!p1Tech && !p2Tech) return null;
    const labelOf = (pl) => (pl === "p1" ? p1Label : p2Label);
    const winnerLabel = labelOf(winner);

    // Board fights: only the player's own technique matters, and it is sudden death.
    if (!isFinal) {
      const won = winner === "p1";
      const tail = p1Tech === "thunder"
        ? (won ? " Recorded as two victories." : " The technique is destroyed.")
        : p1Tech === "lotus"
          ? (won ? " Recorded as two victories." : " Recorded as two defeats.")
          : (won ? " The next fight starts 1–0 in their favour." : " The next fight starts 1–0 against them.");
      return `Sudden death — ${winnerLabel} takes the whole fight.${tail}`;
    }

    // Duel: describe every consequence in play, since both sides may have one.
    const { award, bonusTo, destroy } = duelResolution(winner);
    const parts = [`${winnerLabel} takes ${award} round${award > 1 ? "s" : ""}.`];
    if (bonusTo) parts.push(`${labelOf(bonusTo)} gains +1 on their next dice roll.`);
    for (const d of destroy) parts.push(`${labelOf(d.owner)}'s technique is destroyed.`);
    return parts.join(" ");
  }

  function finishBattle() {
    const battleWinner = scores.p1 >= winsToWin ? "p1" : "p2";
    if (isSolo) {
      // Board fights report the rider detail alongside the outcome: how many
      // battle-log entries to record, and any head start for the next fight.
      onResolved({
        outcome: battleWinner === "p1" ? "won" : "lost",
        logEntries: techniqueResult ? techniqueResult.logEntries : 1,
        headStart: techniqueResult ? techniqueResult.headStart : null,
        technique: techniqueResult ? techniqueResult.kind : null,
      });
    } else {
      onResolved(battleWinner);
    }
  }

  const ninjaInfo = ninjaType ? NINJA[ninjaType] : null;

  // ---- render helpers ----
  function chooseScreen(player, label, poses) {
    const color = player === "p1" ? "#22c55e" : "#ff5252";
    const cardCharacter = player === "p1" ? p1Character : p2Character;
    const lockedType = player === "p1" ? p1LockedType : p2LockedType;
    return (
      <Draggable style={{
        ...MODAL_BOX,
        maxWidth: 720, width: "94%",
        border: "2px solid #f3e6c4",
        backgroundImage: `url(${bambooBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}>
        <div style={{
          background: "#f3e6c4",
          borderRadius: 10,
          padding: "14px 18px 12px 18px",
          marginBottom: 18,
          color: "#1a1208",
        }}>
          <div style={{ fontSize: 13, color: "#1a1208", marginBottom: 4, fontWeight: 700 }}>
            Round {round}
          </div>
          <ScorePips
            scores={scores}
            p1Label={p1Label}
            p2Label={p2Label}
            nameColor="#1a1208"
            vsColor="#1a1208"
            p1PipColor="#0a5e2a"
            p2PipColor="#8e1620"
            winsToWin={winsToWin}
          />
          <h2 style={{ margin: "6px 0 0 0", fontSize: 18, color: "#1a1208" }}>
            {label}, choose your pose
          </h2>
          <button
            onClick={() => setReferencePlayer(player)}
            style={{
              marginTop: 8, padding: "4px 12px", borderRadius: 14,
              background: "rgba(122,85,0,0.12)", border: "1px solid #b79b57",
              color: "#5a4317", fontFamily: "Georgia, serif", fontSize: 12,
              fontWeight: 700, cursor: "pointer",
            }}
          >
            ❓ How fights work
          </button>
          {!isSolo && (
            <div style={{ fontSize: 12, fontStyle: "italic", marginTop: 6, color: "#3a2c12" }}>
              (other player look away)
            </div>
          )}
          {(() => {
            // Oracle's Eye — reveal the enemy's pose for the current round.
            const playerHasOracle = playerHas(player, "oracle_eye");
            const enemyPose = player === "p1" ? p2Choice : p1Choice;
            const enemyCharacter = player === "p1" ? p2Character : p1Character;
            const playerRevealed = player === "p1" ? revealedByP1 : revealedByP2;
            // Can reveal if: solo (we can pre-compute), OR enemy already chose.
            const canReveal = (player === "p1" && isSolo) || enemyPose !== null;
            if (!playerHasOracle && !playerRevealed) return null;
            if (playerRevealed && enemyPose) {
              const enemyImg = poseImageFor(enemyCharacter, enemyPose);
              // Match the pose card's background so the type reads at a glance.
              const baseTypeColors = {
                Strike: "#E2852E",
                Block:  "#FFD45A",
                Dodge:  "#BBCB64",
              };
              const isExtra = EXTRA_POSE_ID_SET.has(enemyPose.id);
              const thumbBg = isExtra
                ? EXTRA_POSE_BG_BY_HEIGHT[enemyPose.height]?.bg || baseTypeColors[enemyPose.type]
                : baseTypeColors[enemyPose.type] || "#fff";
              return (
                <div style={{
                  marginTop: 10,
                  marginLeft: "auto",
                  marginRight: "auto",
                  background: "#fff8e7",
                  border: "1px solid #c4ad7b",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 12,
                  color: "#3a2c12",
                  textAlign: "left",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  {enemyImg && (
                    <div style={{
                      width: 64, height: 64,
                      flex: "0 0 auto",
                      background: thumbBg,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      boxShadow: isExtra ? "inset 0 0 0 1px rgba(212,175,55,0.55)" : "none",
                    }}>
                      <img
                        src={enemyImg}
                        alt={enemyPose.name}
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                          display: "block",
                          ...(isExtra ? { transform: "scale(1.2)" } : {}),
                        }}
                      />
                    </div>
                  )}
                  <div>
                    <div>
                      <strong style={{ color: "#7a5500" }}>🔮 Oracle's Eye:</strong>{" "}
                      the enemy plays <strong>{enemyPose.name}</strong>.
                    </div>
                    <div style={{ fontSize: 11, color: "#6b4f1a", marginTop: 2 }}>
                      {enemyPose.type} / {enemyPose.height}
                    </div>
                  </div>
                </div>
              );
            }
            if (!canReveal) return null;
            return (
              <button
                onClick={() => useOracleEye(player)}
                style={{
                  marginTop: 10,
                  marginLeft: "auto",
                  marginRight: "auto",
                  background: "#fff8e7",
                  border: "1px solid #7a5500",
                  borderRadius: 6,
                  padding: "7px 12px",
                  fontFamily: "Georgia, serif",
                  fontSize: 12,
                  color: "#5a4317",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  textAlign: "left",
                }}
                title={SORCERY_BY_ID.oracle_eye.description}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>🔮</span>
                <span>
                  Cast the sorcery{" "}
                  <strong style={{
                    color: "#7a5500",
                    fontStyle: "italic",
                    letterSpacing: 0.3,
                  }}>
                    "Oracle's Eye"
                  </strong>{" "}
                  to reveal the enemy's move.
                </span>
              </button>
            );
          })()}
        </div>
        {(() => {
          const basePoses = poses.filter((p) => !EXTRA_POSE_ID_SET.has(p.id));
          const heightOrder = { High: 0, Mid: 1, Low: 2 };
          const extraPoses = poses
            .filter((p) => EXTRA_POSE_ID_SET.has(p.id))
            .sort((a, b) => heightOrder[a.height] - heightOrder[b.height]);
          return (
            <>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10, marginBottom: extraPoses.length > 0 ? 14 : 16,
              }}>
                {basePoses.map((pose) => {
                  const isLocked = lockedType != null && pose.type === lockedType;
                  return (
                    <PoseCard
                      key={pose.id}
                      pose={pose}
                      character={cardCharacter}
                      selected={selecting?.id === pose.id}
                      locked={isLocked}
                      isFinal={isFinal}
                      onSelect={() => {
                        if (isLocked) return;
                        setSelecting(pose);
                      }}
                    />
                  );
                })}
              </div>
              {extraPoses.length > 0 && (
                <>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    marginBottom: 10,
                    color: "#5a4317", fontSize: 13, fontWeight: 700,
                    letterSpacing: 0.6,
                  }}>
                    <span style={{ flex: 1, height: 1, background: "#c4ad7b" }} />
                    <span style={{ color: "#7a5500" }}>✦ Your Secret Techniques ✦</span>
                    <span style={{ flex: 1, height: 1, background: "#c4ad7b" }} />
                  </div>
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10, marginBottom: 16,
                  }}>
                    {extraPoses.map((pose) => (
                      <PoseCard
                        key={pose.id}
                        pose={pose}
                        character={cardCharacter}
                        selected={selecting?.id === pose.id}
                        locked={false}
                        isFinal={isFinal}
                        onSelect={() => setSelecting(pose)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          );
        })()}
        <button
          style={{
            ...BTN_PRIMARY,
            opacity: selecting ? 1 : 0.55,
            cursor: selecting ? "pointer" : "not-allowed",
          }}
          onClick={player === "p1" ? confirmP1 : confirmP2}
          disabled={!selecting}
        >
          {isSolo
            ? "Confirm pose"
            : (player === firstChooser
                ? "I have chosen — pass to other player"
                : "Reveal")}
        </button>
      </Draggable>
    );
  }

  function handoffScreen(toPlayer, label) {
    const color = toPlayer === "p1" ? "#22c55e" : "#ff5252";
    return (
      <Draggable style={{ ...MODAL_BOX, maxWidth: 420, width: "90%" }}>
        <div style={{ fontSize: 13, color: "#7a5500", marginBottom: 6 }}>
          Round {round} of {maxRounds}
        </div>
        <ScorePips scores={scores} p1Label={p1Label} p2Label={p2Label} winsToWin={winsToWin} />
        <div style={{ fontSize: 40, marginBottom: 8 }}>🤲</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 18 }}>Pass the device</h2>
        <p style={{ fontSize: 14, marginBottom: 22, color: "#5a4317" }}>
          Hand over to <strong style={{ color }}>{label}</strong> — they will choose their pose next.
        </p>
        <button style={BTN_PRIMARY} onClick={() => readyFor(toPlayer)}>
          I am ready
        </button>
      </Draggable>
    );
  }

  function revealScreen() {
    const winnerSide = finalWinner;
    const needsDice = outcome.winner === "dice" && !dice;
    // Show the score as it WILL be once this round's winner is committed, so
    // the pip matching the just-announced winner already appears filled. While
    // dice are pending (finalWinner not yet known) the pre-round score stays.
    const displayedScores = finalWinner
      ? { ...scores, [finalWinner]: scores[finalWinner] + 1 }
      : scores;
    return (
      <Draggable style={{
        ...MODAL_BOX,
        maxWidth: 640, width: "94%",
        border: "2px solid #f3e6c4",
        backgroundImage: `url(${bambooBackground})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}>
        <div style={{
          background: "#f3e6c4",
          borderRadius: 10,
          padding: "14px 18px 12px 18px",
          marginBottom: 18,
          color: "#1a1208",
        }}>
          <div style={{ fontSize: 13, color: "#1a1208", marginBottom: 4, fontWeight: 700 }}>
            Round {round}
          </div>
          <ScorePips
            scores={displayedScores}
            p1Label={p1Label}
            p2Label={p2Label}
            nameColor="#1a1208"
            vsColor="#1a1208"
            p1PipColor="#0a5e2a"
            p2PipColor="#8e1620"
            winsToWin={winsToWin}
          />
          <h2 style={{ margin: "6px 0 0 0", fontSize: 18, color: "#1a1208" }}>Reveal</h2>
        </div>
        {(() => {
          // Shaolin Master always on the left, Ninja always on the right.
          // If neither side is shaolin, fall back to p1-left/p2-right.
          const swap = p2Character === "shaolin" && p1Character !== "shaolin";
          const leftChoice  = swap ? p2Choice  : p1Choice;
          const rightChoice = swap ? p1Choice  : p2Choice;
          const leftLabel   = swap ? p2Label   : p1Label;
          const rightLabel  = swap ? p1Label   : p2Label;
          const leftChar    = swap ? p2Character : p1Character;
          const rightChar   = swap ? p1Character : p2Character;
          const leftColor   = swap ? "#ff5252" : "#22c55e";
          const rightColor  = swap ? "#22c55e" : "#ff5252";
          // Ninja Warrior art faces right by default. In the final duel it sits on
          // the right (Shaolin is pinned left), so mirror it to face the opponent.
          const rightFlip = isFinal && rightChar === "ninja";
          const sideStyle = {
            width: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          };
          return (
            <div style={{
              display: "flex",
              gap: 24,
              justifyContent: "center",
              alignItems: "center",
              marginBottom: 14,
            }}>
              <div style={sideStyle}>
                <div style={{ fontSize: 13, color: leftColor, fontWeight: 700, marginBottom: 6 }}>{leftLabel}</div>
                <PoseCard pose={leftChoice} character={leftChar} selected={false} onSelect={() => {}} isFinal={isFinal} />
              </div>
              <div style={{ fontSize: 20, color: "#7a5500", fontWeight: 700, alignSelf: "center" }}>vs</div>
              <div style={sideStyle}>
                <div style={{ fontSize: 13, color: rightColor, fontWeight: 700, marginBottom: 6 }}>{rightLabel}</div>
                <PoseCard pose={rightChoice} character={rightChar} selected={false} onSelect={() => {}} flip={rightFlip} isFinal={isFinal} />
              </div>
            </div>
          );
        })()}
        <div style={{
          background: "#f3e6c4", border: "1px dashed #c4ad7b",
          borderRadius: 8, padding: "10px 12px", fontSize: 13,
          color: "#5a4317", marginBottom: 14,
        }}>
          {outcome.reason}
          {dice && (
            <div style={{ marginTop: 6 }}>
              <div>
                Dice: <strong>{p1Label}</strong> rolled <strong>{dice.p1}</strong>
                {dice.p1Weapon && dice.p1Extra && (
                  <span style={{ color: "#7a5500", fontStyle: "italic" }}>
                    {" "}{SORCERY_ICONS[dice.p1Weapon]} {SORCERY_BY_ID[dice.p1Weapon].name} bonus: <strong>{dice.p1Extra.a}</strong> & <strong>{dice.p1Extra.b}</strong> — higher taken
                  </span>
                )}
                {dice.p1Mod !== 0 && (
                  <span style={{ color: "#7a5500", fontStyle: "italic" }}>
                    {" "}⚔ Combat Rating: <strong>{formatSignedRating(dice.p1Mod)}</strong> → total <strong>{dice.p1Final}</strong>
                  </span>
                )}
                ,{" "}
                <strong>{p2Label}</strong> rolled <strong>{dice.p2}</strong>
                {dice.p2Weapon && dice.p2Extra && (
                  <span style={{ color: "#7a5500", fontStyle: "italic" }}>
                    {" "}{SORCERY_ICONS[dice.p2Weapon]} {SORCERY_BY_ID[dice.p2Weapon].name} bonus: <strong>{dice.p2Extra.a}</strong> & <strong>{dice.p2Extra.b}</strong> — higher taken
                  </span>
                )}
                {dice.p2Mod !== 0 && (
                  <span style={{ color: "#7a5500", fontStyle: "italic" }}>
                    {" "}⚔ Combat Rating: <strong>{formatSignedRating(dice.p2Mod)}</strong> → total <strong>{dice.p2Final}</strong>
                  </span>
                )}
                {dice.tries > 1 ? ` (after ${dice.tries - 1} tie re-roll${dice.tries > 2 ? "s" : ""})` : ""}.
              </div>
            </div>
          )}
        </div>
        {finalWinner && techniqueNote(finalWinner) && (
          <div style={{
            background: "#2a1206", border: "1px solid #8a1620",
            borderRadius: 8, padding: "10px 12px", fontSize: 13,
            color: "#f5d9a8", marginBottom: 14, fontWeight: 600,
          }}>
            ✦ {techniqueNote(finalWinner)}
          </div>
        )}
        {needsDice ? (
          <button style={BTN_PRIMARY} onClick={rollDice}>Roll the dice</button>
        ) : magicPowderPending ? (
          // Dice resolved as a loss; player holds Magic Powder. Offer a re-roll.
          <div style={{
            background: "#fff8e7", border: "1px solid #c4ad7b", borderRadius: 8,
            padding: "12px 14px", marginBottom: 4,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#7a5500" }}>
              ✨ Magic Powder ({magicPowderPending === "p1" ? p1Label : p2Label})
            </div>
            <div style={{ fontSize: 13, color: "#5a4317", marginBottom: 12, fontStyle: "italic" }}>
              The dice went against <strong>{magicPowderPending === "p1" ? p1Label : p2Label}</strong>. Use Magic Powder to re-roll? The new result will stand.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={BTN_PRIMARY} onClick={useMagicPowder}>Re-roll — spend it</button>
              <button style={BTN_SECONDARY} onClick={declineMagicPowder}>Accept the loss</button>
            </div>
          </div>
        ) : (() => {
          // Iron Bell — after a fully resolved round loss, offer to replay it.
          const loser = winnerSide === "p1" ? "p2" : "p1";
          const loserLabel = loser === "p1" ? p1Label : p2Label;
          const offerIronBell = playerHas(loser, "iron_bell") && !ironBellDeclined;
          return (
            <>
              <div style={{
                fontSize: 16, fontWeight: 700, marginBottom: 16,
                color: winnerSide === "p1" ? "#22c55e" : "#ff5252",
              }}>
                {winnerSide === "p1" ? p1Label : p2Label} wins round {round}!
              </div>
              {offerIronBell ? (
                <div style={{
                  background: "#fff8e7", border: "1px solid #c4ad7b", borderRadius: 8,
                  padding: "12px 14px", marginBottom: 4,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "#7a5500" }}>
                    🔔 Iron Bell ({loserLabel})
                  </div>
                  <div style={{ fontSize: 13, color: "#5a4317", marginBottom: 12, fontStyle: "italic" }}>
                    This round was lost by <strong>{loserLabel}</strong>. Ring the Iron Bell and replay it from pose selection?
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button style={BTN_PRIMARY} onClick={() => ringIronBell(loser)}>Ring it — spend it</button>
                    <button style={BTN_SECONDARY} onClick={() => setIronBellDeclined(true)}>Accept the loss</button>
                  </div>
                </div>
              ) : (
                <button style={BTN_PRIMARY} onClick={nextRound}>
                  {(scores[winnerSide] + 1) >= winsToWin ? "End battle" : "Next round"}
                </button>
              )}
            </>
          );
        })()}
      </Draggable>
    );
  }

  function endScreen() {
    const battleWinner = scores.p1 >= winsToWin ? "p1" : "p2";
    if (!isSolo) {
      // Final duel: first reveal the winner's portrait. The follow-up "The Duel
      // is Over" summary modal (with score pips and the Start New Game button)
      // is rendered by the parent after this Continue resolves the battle.
      // Hold the modal back until the portrait has decoded — otherwise the
      // first paint shows the text + empty image frame for a beat.
      if (!winnerImageReady) return null;
      const winnerChar = battleWinner === "p1" ? activeCharacter : otherCharacter;
      const winnerName = winnerChar === "shaolin" ? "Shaolin Master" : "Ninja Warrior";
      const winnerIcon = winnerChar === "shaolin" ? "🥋" : "🥷";
      const winnerImg = MODAL_IMAGES.finalDuelWin[winnerChar];
      const flavor = winnerChar === "shaolin"
        ? "The Shadow Clan is defeated. Peace is restored."
        : "The Shaolin Master has fallen. Darkness prevails.";
      return (
        <Draggable style={{
          ...MODAL_BOX,
          maxWidth: 640, width: "94%",
          background: "#120d04",
          border: "2px solid #d4af37",
          color: "#f5e8c4",
        }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>{winnerIcon}</div>
          <h1 style={{ margin: "0 0 10px 0", fontSize: 22, color: "#d4af37", letterSpacing: 1 }}>
            {winnerName} wins the ultimate duel.
          </h1>
          <p style={{ fontSize: 14, color: "#c4ad7b", margin: "0 0 14px 0" }}>{flavor}</p>
          <ScorePips
            scores={scores}
            p1Label={p1Label}
            p2Label={p2Label}
            winsToWin={winsToWin}
            onDark={true}
            nameColor="#f5e8c4"
            vsColor="#d4af37"
          />
          {winnerImg && (
            <div style={{
              width: "100%",
              marginBottom: 24,
              border: "1px solid #d4af37",
              borderRadius: 10,
              boxShadow: "0 0 12px rgba(212,175,55,0.18)",
              overflow: "hidden",
              lineHeight: 0,
            }}>
              <img
                src={winnerImg}
                alt={`${winnerName} wins`}
                style={{ display: "block", width: "100%", height: "auto" }}
              />
            </div>
          )}
          <button
            style={{ ...BTN_PRIMARY, background: "#d4af37", color: "#120d04", fontSize: 15, padding: "12px 28px" }}
            onClick={finishBattle}
          >
            Continue
          </button>
        </Draggable>
      );
    }
    const won = battleWinner === "p1";
    return (
      <Draggable style={{ ...MODAL_BOX, maxWidth: 420, width: "90%" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{won ? "🏆" : "💀"}</div>
        <h2 style={{ margin: "0 0 10px 0", fontSize: 20 }}>
          {won ? "Victory!" : "Defeat"}
        </h2>
        <ScorePips scores={scores} p1Label={p1Label} p2Label={p2Label} winsToWin={winsToWin} />
        <p style={{ fontSize: 14, marginBottom: 20, color: "#5a4317" }}>
          {won
            ? `${p1Label} defeats the ${ninjaInfo.name} and holds their ground.`
            : `${p1Label} is bested by the ${ninjaInfo.name} and falls back ${NINJA_SETBACK[ninjaType]} tile${NINJA_SETBACK[ninjaType] === 1 ? "" : "s"}.`}
        </p>
        <button style={BTN_PRIMARY} onClick={finishBattle}>Continue</button>
      </Draggable>
    );
  }

  function oracleCancelScreen() {
    return (
      <Draggable style={{ ...MODAL_BOX, maxWidth: 460, width: "92%" }}>
        <div style={{ fontSize: 44, marginBottom: 6 }}>🔮</div>
        <h2 style={{ margin: "0 0 14px 0", fontSize: 20, color: "#7a5500" }}>
          Both Eyes cancel each other out
        </h2>
        <p style={{ fontSize: 14, marginBottom: 18, color: "#5a4317", fontStyle: "italic" }}>
          Both <strong>{p1Label}</strong> and <strong>{p2Label}</strong> hold Oracle's Eye.
          The two visions clash and dissolve. Both sorceries are spent —
          the round proceeds with standard pose selection.
        </p>
        <button style={BTN_PRIMARY} onClick={() => setPhase("p1_choose")}>
          Continue
        </button>
      </Draggable>
    );
  }

  return (
    <div style={MODAL_OVERLAY}>
      {/* Shake wrapper: transforms only the battle content, never the backdrop
          or the fixed overlays below, so a shake never reveals the board edge. */}
      <div ref={shakeRef} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {phase === "oracle_cancel" && oracleCancelScreen()}
        {phase === "p1_choose"   && chooseScreen("p1", p1Label, p1Poses)}
        {phase === "handoff_p2"  && handoffScreen("p2", p2Label)}
        {phase === "p2_choose"   && chooseScreen("p2", p2Label, p2Poses)}
        {phase === "handoff_p1"  && handoffScreen("p1", p1Label)}
        {phase === "reveal"      && revealScreen()}
        {phase === "battle_end"  && endScreen()}
      </div>
      {referencePlayer && (
        <FightReferenceModal
          character={referencePlayer === "p1" ? p1Character : p2Character}
          isFinal={isFinal}
          heldExtraIds={(referencePlayer === "p1" ? p1Extras : p2Extras).map((p) => p.id)}
          onClose={() => setReferencePlayer(null)}
        />
      )}
      <FlashOverlay flash={flash} />
      <ConfettiBurst burst={burst} />
    </div>
  );
}

export default function ShaolinGame() {
  const [board, setBoard] = useState(() => generateBoard());
  const [shaolinTile, setShaolinTile] = useState(null);
  const [ninjaTile, setNinjaTile] = useState(null);
  const [currentTurn, setCurrentTurn] = useState(null); // null | "any" | "shaolin" | "ninja"
  // Board-level "How fights work" reference: holds the character whose techniques
  // to show, or null when closed.
  const [boardReferenceChar, setBoardReferenceChar] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [modal, setModal] = useState(null); // null | { type, resolve, ...data }
  const [lastRoll, setLastRoll] = useState(null); // null | { value, character }
  const [gameWinner, setGameWinner] = useState(null); // null | "shaolin" | "ninja"
  const [shaolinInventory, setShaolinInventory] = useState({ sorceries: [], extraPoses: [] });
  const [ninjaInventory, setNinjaInventory] = useState({ sorceries: [], extraPoses: [] });
  const [shaolinDepleted, setShaolinDepleted] = useState(() => new Set());
  const [ninjaDepleted, setNinjaDepleted] = useState(() => new Set());
  const [shaolinBattleLog, setShaolinBattleLog] = useState([]); // [{ ninjaType, outcome }]
  const [ninjaBattleLog, setNinjaBattleLog] = useState([]);
  const [shaolinHeld, setShaolinHeld] = useState(false);
  const [ninjaHeld, setNinjaHeld] = useState(false);
  const [shaolinLockedType, setShaolinLockedType] = useState(null); // "Strike" | "Block" | "Dodge" | null
  const [ninjaLockedType, setNinjaLockedType] = useState(null);
  // Ghost Walk carries a 1-0 head start (for or against) into the player's next
  // board fight. "self" | "opponent" | null. Consumed by that fight.
  const [shaolinHeadStart, setShaolinHeadStart] = useState(null);
  const [ninjaHeadStart, setNinjaHeadStart] = useState(null);
  // Each player draws traps from their OWN shuffled deck of 4 (out of 6)
  // and tracks which trap tiles they have personally triggered.
  // Per-player set of trap TYPES already encountered. Each type fires at most
  // once per game per player. Replaces the older pre-shuffled deck approach;
  // the trap type is now picked live at landing from the remaining pool, so
  // eligibility filters like Rival's Tribute can be applied at decision time.
  const [shaolinUsedTrapTypes, setShaolinUsedTrapTypes] = useState(() => new Set());
  const [ninjaUsedTrapTypes, setNinjaUsedTrapTypes] = useState(() => new Set());
  const [shaolinTrappedTiles, setShaolinTrappedTiles] = useState(() => new Set());
  const [ninjaTrappedTiles, setNinjaTrappedTiles] = useState(() => new Set());
  const [skipNotice, setSkipNotice] = useState(null); // transient "turn skipped" banner
  const [forcedRoll, setForcedRoll] = useState(null); // testing: null = random, else 1..6
  // Pre-game overlay shown at first load and after each "Start New Game" click
  // in the final-duel post-game modal.
  const [showStartScreen, setShowStartScreen] = useState(true);

  function showModal(data) {
    return new Promise((resolve) => {
      setModal({ ...data, resolve });
    });
  }

  // Auto-skip held players when their turn comes around.
  useEffect(() => {
    if (isRolling || modal) return;
    if (currentTurn !== "shaolin" && currentTurn !== "ninja") return;
    const isShaolin = currentTurn === "shaolin";
    const currentHeld = isShaolin ? shaolinHeld : ninjaHeld;
    const otherHeld = isShaolin ? ninjaHeld : shaolinHeld;
    if (!currentHeld) return;
    if (otherHeld) {
      // Both held simultaneously: both flags clear, play resumes normally.
      setShaolinHeld(false);
      setNinjaHeld(false);
      setSkipNotice("Both warriors break free of their bonds — play resumes.");
    } else {
      if (isShaolin) setShaolinHeld(false);
      else setNinjaHeld(false);
      setSkipNotice(`${isShaolin ? "🥋 Shaolin Master" : "🥷 Ninja Warrior"} is held — turn skipped.`);
      setCurrentTurn(isShaolin ? "ninja" : "shaolin");
    }
  }, [currentTurn, shaolinHeld, ninjaHeld, isRolling, modal]);

  // Skip notice auto-dismisses after ~2 seconds.
  useEffect(() => {
    if (!skipNotice) return;
    const handle = setTimeout(() => setSkipNotice(null), 2200);
    return () => clearTimeout(handle);
  }, [skipNotice]);

  function resetPlayerProgress() {
    setShaolinInventory({ sorceries: [], extraPoses: [] });
    setNinjaInventory({ sorceries: [], extraPoses: [] });
    setShaolinDepleted(new Set());
    setNinjaDepleted(new Set());
    setShaolinBattleLog([]);
    setNinjaBattleLog([]);
    setShaolinHeld(false);
    setNinjaHeld(false);
    setShaolinLockedType(null);
    setNinjaLockedType(null);
    setShaolinHeadStart(null);
    setNinjaHeadStart(null);
    setShaolinUsedTrapTypes(new Set());
    setNinjaUsedTrapTypes(new Set());
    setShaolinTrappedTiles(new Set());
    setNinjaTrappedTiles(new Set());
    setSkipNotice(null);
  }

  function startGame() {
    if (isRolling) return;
    setShaolinTile(null);
    setNinjaTile(null);
    setCurrentTurn("any");
    setLastRoll(null);
    setGameWinner(null);
    resetPlayerProgress();
  }

  function regenerate() {
    if (isRolling) return;
    setBoard(generateBoard());
    setShaolinTile(null);
    setNinjaTile(null);
    setCurrentTurn(null);
    setLastRoll(null);
    setGameWinner(null);
    resetPlayerProgress();
  }

  async function usePreRollSorcery(character) {
    if (isRolling || (currentTurn !== character && currentTurn !== "any")) return;
    if (modal) return;
    const inv = character === "shaolin" ? shaolinInventory : ninjaInventory;
    const currentPos = character === "shaolin" ? shaolinTile : ninjaTile;

    // Filter pre-roll-trigger sorceries the player can actually use right now.
    const usable = inv.sorceries.filter((s) => {
      const def = SORCERY_BY_ID[s.id];
      if (!def || def.trigger !== "pre_roll") return false;
      if (s.id === "ancient_key" && currentPos === null) return false;
      if (s.id === "magic_compass" && currentPos === null) return false;
      return true;
    });

    const chosenId = await showModal({
      type: "sorcery_picker",
      title: "Use an item before rolling",
      sorceries: usable,
    });
    setModal(null);
    if (!chosenId) return;

    if (chosenId === "magic_compass") {
      const choice = await showModal({ type: "magic_compass", currentTile: currentPos });
      setModal(null);
      if (!choice) return;
      const setInv = character === "shaolin" ? setShaolinInventory : setNinjaInventory;
      setInv((prev) => ({ ...prev, sorceries: prev.sorceries.filter((s) => s.id !== "magic_compass") }));
      await rollFor(character, { directTarget: choice.target, stepwise: true });
      return;
    }

    if (chosenId === "ancient_key") {
      if (currentPos === null) return;
      const choice = await showModal({ type: "ancient_key", currentTile: currentPos });
      setModal(null);
      if (!choice) return;
      const setInv = character === "shaolin" ? setShaolinInventory : setNinjaInventory;
      setInv((prev) => ({ ...prev, sorceries: prev.sorceries.filter((s) => s.id !== "ancient_key") }));
      await rollFor(character, { directTarget: choice.target });
      return;
    }
  }

  async function rollFor(character, opts = {}) {
    if (isRolling || (currentTurn !== character && currentTurn !== "any")) return;
    setIsRolling(true);
    const tiles = board.tiles;
    const directTarget = opts.directTarget;
    const isDirect = directTarget != null;
    let steps = 0;
    if (!isDirect) {
      steps = forcedRoll != null ? forcedRoll : Math.floor(Math.random() * 6) + 1;
      setLastRoll({ value: steps, character });
    }
    const setTile = character === "shaolin" ? setShaolinTile : setNinjaTile;
    let current = character === "shaolin" ? shaolinTile : ninjaTile;

    // Per-player trap-state mirrors. We snapshot at rollFor entry and mutate
    // locally so cascades (setback → another trap) see the up-to-date state.
    const trapState = {
      shaolin: {
        usedTypes: new Set(shaolinUsedTrapTypes),
        triggered: new Set(shaolinTrappedTiles),
        dirty: false,
      },
      ninja: {
        usedTypes: new Set(ninjaUsedTrapTypes),
        triggered: new Set(ninjaTrappedTiles),
        dirty: false,
      },
    };

    // Local inventory mirror, tracking BOTH players' sorceries and extra
    // poses. Lets multiple board-triggered sorceries / traps fire correctly
    // within the same cascade (rare but possible).
    const invMirror = {
      shaolin: {
        sorceries: [...shaolinInventory.sorceries],
        extraPoses: [...shaolinInventory.extraPoses],
      },
      ninja: {
        sorceries: [...ninjaInventory.sorceries],
        extraPoses: [...ninjaInventory.extraPoses],
      },
    };
    function holdsSorcery(char, id) {
      return invMirror[char].sorceries.some((s) => s.id === id);
    }
    function spendSorcery(char, id) {
      invMirror[char].sorceries = invMirror[char].sorceries.filter((s) => s.id !== id);
      const setInv = char === "shaolin" ? setShaolinInventory : setNinjaInventory;
      setInv((prev) => ({ ...prev, sorceries: prev.sorceries.filter((s) => s.id !== id) }));
    }
    function rivalAlreadyHas(rival, item) {
      // An item can only move if the rival does not already hold what they
      // would receive — which is the counterpart for character-exclusive items
      // (weapons, extra poses) and the item itself for everything else.
      const incoming = tributeItemFor(item);
      const held = incoming.kind === "sorcery"
        ? invMirror[rival].sorceries
        : invMirror[rival].extraPoses;
      return held.some((x) => x.id === incoming.id);
    }
    function transferablePool(char) {
      const rival = char === "shaolin" ? "ninja" : "shaolin";
      const sorcs = invMirror[char].sorceries.map((s) => ({ kind: "sorcery", ...s }));
      const extras = invMirror[char].extraPoses.map((p) => ({ kind: "extra_pose", ...p }));
      return [...sorcs, ...extras].filter((it) => !rivalAlreadyHas(rival, it));
    }
    function hasItemsToSteal(char) {
      // True if the landing player has at least one thing that can actually
      // move — so Rival's Tribute never fires with nothing to give.
      return transferablePool(char).length > 0;
    }
    function pickRandomTributeItem(char) {
      const pool = transferablePool(char);
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    // `taken` leaves fromChar; `given` is what toChar receives. They differ for
    // character-exclusive items, which translate into the receiver's own
    // version (see TRIBUTE_COUNTERPART).
    function transferItem(fromChar, toChar, taken) {
      const given = tributeItemFor(taken);
      // Mutate both local mirrors to keep cascades consistent.
      if (taken.kind === "sorcery") {
        invMirror[fromChar].sorceries = invMirror[fromChar].sorceries.filter((s) => s.id !== taken.id);
        invMirror[toChar].sorceries.push({ id: given.id, name: given.name, description: given.description });
      } else {
        invMirror[fromChar].extraPoses = invMirror[fromChar].extraPoses.filter((p) => p.id !== taken.id);
        invMirror[toChar].extraPoses.push({ id: given.id, name: given.name, type: given.type, height: given.height });
      }
      // Mirror those updates into React state.
      const setFrom = fromChar === "shaolin" ? setShaolinInventory : setNinjaInventory;
      const setTo = toChar === "shaolin" ? setShaolinInventory : setNinjaInventory;
      setFrom((prev) => {
        if (taken.kind === "sorcery") {
          return { ...prev, sorceries: prev.sorceries.filter((s) => s.id !== taken.id) };
        }
        return { ...prev, extraPoses: prev.extraPoses.filter((p) => p.id !== taken.id) };
      });
      setTo((prev) => {
        if (given.kind === "sorcery") {
          return { ...prev, sorceries: [...prev.sorceries, { id: given.id, name: given.name, description: given.description }] };
        }
        return { ...prev, extraPoses: [...prev.extraPoses, { id: given.id, name: given.name, type: given.type, height: given.height }] };
      });
      return given;
    }

    // Resolves the landing event on `tile` (chip is already shown there).
    // Returns the final tile position after the event (and any cascading
    // events triggered by a fight-loss setback) resolves.
    async function resolveLanding(tile, opts = {}) {
      const t = tiles[tile];

      if (t.type === T.HOLE) {
        await sleep(400);
        // Safety Rope: offered before the fall executes. The for-loop sets
        // `skipRopeCheck` when it has already asked the player about the rope,
        // so we don't double-prompt for the same hole.
        if (!opts.skipRopeCheck && holdsSorcery(character, "safety_rope")) {
          const use = await showModal({
            type: "sorcery_confirm",
            sorceryId: "safety_rope",
            title: "Safety Rope",
            prompt: "You hold the Safety Rope. Anchor yourself and stay on this hole?",
            detail: "Spends the sorcery — your chip stays on the hole tile.",
            yesLabel: "Use the rope",
            noLabel: "Let me fall",
          });
          setModal(null);
          if (use) {
            spendSorcery(character, "safety_rope");
            return tile;
          }
        }
        await sleep(100);
        if (t.fallRows === 2) {
          const { row: rOrig, col } = tileGridPos(tile);
          const intermediate = gridPosToTile(rOrig + 1, col);
          if (intermediate !== null && intermediate !== t.dest) {
            setTile(intermediate);
            await sleep(500);
          }
        }
        setTile(t.dest);
        await sleep(200);
        // Trigger the destination tile's normal landing event (item, fight,
        // trap, etc.). Hole landings can never themselves be holes by board
        // rules, so this won't recurse into another fall.
        return await resolveLanding(t.dest);
      }

      if (t.type === T.LADDER) {
        await sleep(400);
        const choice = await showModal({
          type: "ladder", tileNum: tile, climbDir: t.climbDir, dest: t.dest,
          bothWay: t.ladderKind === "both",
        });
        setModal(null);
        if (choice === "climb") {
          setTile(t.dest);
          // A both-way ladder lands on its partner ladder tile — traversal is
          // complete, so don't re-prompt. DOWN/UP land on a NORMAL/ITEM tile,
          // whose landing logic (e.g. item pickup) still resolves.
          if (t.ladderKind === "both") return t.dest;
          return await resolveLanding(t.dest);
        }
        return tile;
      }

      if (t.type === T.TRAP) {
        // Trap type is decided PER PLAYER at landing time, drawn from that
        // player's personal shuffled deck. Tile.trap is ignored intentionally.
        const playerTrap = trapState[character];
        if (playerTrap.triggered.has(tile)) {
          // Already sprung for this player — silent pass-through.
          return tile;
        }
        // Build the live pool: every trap type minus those this player has
        // already encountered. Rival's Tribute is then filtered out if the
        // landing player has nothing to give up.
        let pool = ALL_TRAP_TYPES.filter((typ) => !playerTrap.usedTypes.has(typ));
        if (!hasItemsToSteal(character)) {
          pool = pool.filter((typ) => typ !== "rivals_tribute");
        }
        if (pool.length === 0) {
          // Nothing left this player can suffer — silent pass-through.
          return tile;
        }
        await sleep(400);
        const trapType = pool[Math.floor(Math.random() * pool.length)];
        playerTrap.usedTypes.add(trapType);
        playerTrap.triggered.add(tile);
        playerTrap.dirty = true;

        // Sixth Sense: reveal the trap and offer to block before any effect runs.
        if (holdsSorcery(character, "sixth_sense")) {
          const preview = {
            hold: "You would be held — your next turn would be lost.",
            sorcery_theft: "A thief would take one of your sorceries.",
            pose_theft: "An ancient seal would suppress one of your extra poses.",
            setback: "You would be swept 2–4 tiles backward.",
            battle_log_modifier: "Your greatest recent victory would be erased from history.",
            pose_lock: "All three stances of one type would be sealed for your next battle.",
            rivals_tribute: "One of your sorceries or extra poses would be torn away and given to your rival.",
          };
          const info = TRAP_INFO[trapType] || {};
          const use = await showModal({
            type: "sorcery_confirm",
            sorceryId: "sixth_sense",
            title: "Sixth Sense",
            prompt: `You sense a ${info.title || "trap"}. ${preview[trapType] || ""}`,
            detail: "Spend the sorcery to block this trap entirely. Refusing preserves the sorcery and the trap fires normally.",
            yesLabel: "Block it — spend it",
            noLabel: "Let it strike",
          });
          setModal(null);
          if (use) {
            spendSorcery(character, "sixth_sense");
            return tile;
          }
        }

        if (trapType === "hold") {
          await showModal({ type: "trap_announce", trapType, message: "You are held. Lose your next turn." });
          setModal(null);
          if (character === "shaolin") setShaolinHeld(true);
          else setNinjaHeld(true);
          return tile;
        }

        if (trapType === "sorcery_theft") {
          const live = invMirror[character].sorceries;
          if (live.length === 0) {
            await showModal({ type: "trap_announce", trapType, message: "The thief finds nothing and retreats." });
            setModal(null);
          } else {
            const chosenId = await showModal({ type: "trap_sorcery_theft", sorceries: live });
            setModal(null);
            invMirror[character].sorceries = invMirror[character].sorceries.filter((s) => s.id !== chosenId);
            const setInv = character === "shaolin" ? setShaolinInventory : setNinjaInventory;
            setInv((prev) => ({ ...prev, sorceries: prev.sorceries.filter((s) => s.id !== chosenId) }));
          }
          return tile;
        }

        if (trapType === "pose_theft") {
          const live = invMirror[character].extraPoses;
          if (live.length === 0) {
            await showModal({ type: "trap_announce", trapType, message: "The seal finds nothing to suppress." });
            setModal(null);
          } else {
            const chosenId = await showModal({ type: "trap_pose_theft", poses: live });
            setModal(null);
            invMirror[character].extraPoses = invMirror[character].extraPoses.filter((p) => p.id !== chosenId);
            const setInv = character === "shaolin" ? setShaolinInventory : setNinjaInventory;
            setInv((prev) => ({ ...prev, extraPoses: prev.extraPoses.filter((p) => p.id !== chosenId) }));
          }
          return tile;
        }

        if (trapType === "setback") {
          const amount = 2 + Math.floor(Math.random() * 3); // 2..4 inclusive
          const target = Math.max(1, tile - amount);
          await showModal({
            type: "trap_announce",
            trapType,
            message: `You are set back ${amount} tile${amount === 1 ? "" : "s"}.`,
          });
          setModal(null);
          let pos = tile;
          while (pos > target) {
            pos--;
            await sleep(500);
            setTile(pos);
          }
          // Apply normal landing logic on the final tile (could trigger another event).
          return await resolveLanding(pos);
        }

        if (trapType === "battle_log_modifier") {
          const log = character === "shaolin" ? shaolinBattleLog : ninjaBattleLog;
          const hasWin = log.some((e) => e.outcome === "won");
          if (!hasWin) {
            await showModal({ type: "trap_announce", trapType, message: "The curse finds no glory to tarnish." });
            setModal(null);
          } else {
            const setLog = character === "shaolin" ? setShaolinBattleLog : setNinjaBattleLog;
            setLog((prev) => {
              const reverseIdx = [...prev].reverse().findIndex((e) => e.outcome === "won");
              if (reverseIdx < 0) return prev;
              const idx = prev.length - 1 - reverseIdx;
              return prev.map((e, i) => i === idx ? { ...e, outcome: "lost" } : e);
            });
            await showModal({
              type: "trap_announce",
              trapType,
              message: "Your greatest recent victory has been erased from history.",
            });
            setModal(null);
          }
          return tile;
        }

        if (trapType === "pose_lock") {
          const LOCKABLE_TYPES = ["Strike", "Block", "Dodge"];
          const lockedTypeChoice = LOCKABLE_TYPES[Math.floor(Math.random() * LOCKABLE_TYPES.length)];
          const setLock = character === "shaolin" ? setShaolinLockedType : setNinjaLockedType;
          setLock(lockedTypeChoice);
          await showModal({
            type: "trap_announce",
            trapType,
            message: `All three of your ${lockedTypeChoice} stances have been sealed for your next battle.`,
          });
          setModal(null);
          return tile;
        }

        if (trapType === "rivals_tribute") {
          const other = character === "shaolin" ? "ninja" : "shaolin";
          const taken = pickRandomTributeItem(character);
          // taken is guaranteed non-null — the eligibility filter only allowed
          // rivals_tribute into the pool when the player has something to give.
          const given = transferItem(character, other, taken);
          await showModal({ type: "trap_tribute", item: taken, given });
          setModal(null);
          return tile;
        }

        return tile;
      }

      if (t.type === T.ITEM) {
        await sleep(400);
        const depleted = character === "shaolin" ? shaolinDepleted : ninjaDepleted;
        if (depleted.has(tile)) {
          await showModal({ type: "item", variant: "depleted" });
          setModal(null);
          return tile;
        }
        const inv = character === "shaolin" ? shaolinInventory : ninjaInventory;
        const heldSorceryIds = new Set(inv.sorceries.map((s) => s.id));
        const otherChar = character === "shaolin" ? "ninja" : "shaolin";
        const availableSorceries = SORCERIES.filter((s) => {
          if (heldSorceryIds.has(s.id)) return false;
          // Weapons (Sword/Nunchaku) can only be discovered by one character.
          if (WEAPON_DISCOVERY_CHAR[s.id] && WEAPON_DISCOVERY_CHAR[s.id] !== character) return false;
          // Each weapon is globally unique. Since Rival's Tribute now translates
          // a weapon into the receiver's own counterpart, a weapon can no longer
          // cross characters and this check is belt-and-braces — kept so the
          // uniqueness guarantee does not depend on that translation.
          if (WEAPON_ITEM_IDS.includes(s.id) && invMirror[otherChar].sorceries.some((x) => x.id === s.id)) return false;
          return true;
        }).map((s) => ({ kind: "sorcery", ...s }));
        const extras = character === "shaolin" ? EXTRA_POSES_SHAOLIN : EXTRA_POSES_NINJA;
        const heldExtraIds = new Set(inv.extraPoses.map((p) => p.id));
        const availableExtras = extras.filter((p) => !heldExtraIds.has(p.id))
          .map((p) => ({ kind: "extra_pose", ...p }));

        // Weighted find: secret techniques are rarer than sorceries and differ
        // by difficulty (see TECHNIQUE_DROP_RATE). Tiles never come up empty
        // unless the player already holds every item.
        const picked = pickItemFind(availableExtras, availableSorceries);
        if (!picked) {
          await showModal({ type: "item", variant: "none" });
          setModal(null);
          return tile;
        }
        await showModal({ type: "item", variant: "found", item: picked });
        setModal(null);

        const setInv = character === "shaolin" ? setShaolinInventory : setNinjaInventory;
        const setDepleted = character === "shaolin" ? setShaolinDepleted : setNinjaDepleted;
        setInv((prev) => {
          if (picked.kind === "sorcery") {
            return { ...prev, sorceries: [...prev.sorceries, { id: picked.id, name: picked.name, description: picked.description }] };
          }
          return { ...prev, extraPoses: [...prev.extraPoses, { id: picked.id, name: picked.name, type: picked.type, height: picked.height }] };
        });
        setDepleted((prev) => {
          const nextSet = new Set(prev);
          nextSet.add(tile);
          return nextSet;
        });
        return tile;
      }

      if (t.type === T.FIGHT) {
        await sleep(400);
        const ninjaType = t.ninja;
        // Mantle of Mist: offered AFTER the player learns who they face,
        // but before the fight begins. Spec excludes the boss tile (tile 64),
        // which is not reachable here anyway (boss is its own branch).
        if (holdsSorcery(character, "mantle_of_mist")) {
          const use = await showModal({
            type: "sorcery_confirm",
            sorceryId: "mantle_of_mist",
            title: "Mantle of Mist",
            prompt: `You face the ${NINJA[ninjaType].name}. Slip past unseen?`,
            detail: "Spends the sorcery and skips the fight entirely — no battle, no Combat Rating change.",
            yesLabel: "Slip past — spend it",
            noLabel: "Fight anyway",
          });
          setModal(null);
          if (use) {
            spendSorcery(character, "mantle_of_mist");
            return tile;
          }
        }
        await showModal({ type: "fight_intro", ninjaType });
        setModal(null);
        const playerInv = character === "shaolin" ? shaolinInventory : ninjaInventory;
        const playerLock = character === "shaolin" ? shaolinLockedType : ninjaLockedType;
        const pendingHeadStart = character === "shaolin" ? shaolinHeadStart : ninjaHeadStart;
        const setHeadStart = character === "shaolin" ? setShaolinHeadStart : setNinjaHeadStart;
        // A head start from a previous Ghost Walk is consumed by this fight.
        setHeadStart(null);
        const result = await showModal({
          type: "battle",
          mode: "solo",
          ninjaType,
          activeCharacter: character,
          otherCharacter: character === "shaolin" ? "ninja" : "shaolin",
          p1Extras: playerInv.extraPoses,
          p1LockedType: playerLock,
          headStart: pendingHeadStart === "self" ? "p1"
                   : pendingHeadStart === "opponent" ? "p2" : null,
        });
        setModal(null);
        const outcome = result.outcome;
        // Ghost Walk sets up the NEXT fight.
        if (result.headStart) setHeadStart(result.headStart);
        // The pose lock applies only to the player's next battle — clear it.
        const setLock = character === "shaolin" ? setShaolinLockedType : setNinjaLockedType;
        setLock(null);
        const setLog = character === "shaolin" ? setShaolinBattleLog : setNinjaBattleLog;
        // Thunder Dragon and Steel Lotus record the fight twice, so the Combat
        // Rating (derived from the log) moves by 2 instead of 1.
        setLog((prev) => [
          ...prev,
          ...Array.from({ length: result.logEntries }, () => ({ ninjaType, outcome })),
        ]);
        if (outcome === "lost") {
          const setback = NINJA_SETBACK[ninjaType];
          const target = Math.max(1, tile - setback);
          let pos = tile;
          while (pos > target) {
            pos--;
            await sleep(500);
            setTile(pos);
          }
          // Apply normal landing logic on the final setback tile.
          return await resolveLanding(pos);
        }
        return tile;
      }

      return tile;
    }

    // Direct movement via sorcery (Magic Compass / Ancient Key) — bypass dice.
    if (isDirect) {
      // Magic Compass animates step-by-step along the path; intermediate
      // tiles are walked over visually without firing any landing logic, and
      // the destination tile opens normally (item, fight, trap, hole, or
      // ladder — all with their standard prompts). Ancient Key teleports
      // along its vertical jump (no step animation).
      const stepwise = !!opts.stepwise;
      if (stepwise && current !== null && current !== directTarget) {
        const dir = directTarget > current ? 1 : -1;
        let pos = current;
        while (pos !== directTarget) {
          pos += dir;
          // Reaching the boss tile mid-walk should still trigger the final
          // duel like a normal step-into-64 move.
          if (pos >= 64) {
            setTile(64);
            current = 64;
            setIsRolling(false);
            await showModal({ type: "final_duel_intro" });
            setModal(null);
            const result = await showModal({
              type: "battle",
              mode: "duel",
              ninjaType: null,
              activeCharacter: "shaolin",
              otherCharacter: "ninja",
              p1Extras: shaolinInventory.extraPoses,
              p2Extras: ninjaInventory.extraPoses,
              p1LockedType: shaolinLockedType,
              p2LockedType: ninjaLockedType,
              isFinal: true,
            });
            setModal(null);
            setShaolinLockedType(null);
            setNinjaLockedType(null);
            setGameWinner(result === "p1" ? "shaolin" : "ninja");
            return;
          }
          await sleep(500);
          setTile(pos);
        }
        current = directTarget;
        await sleep(200);
        current = await resolveLanding(directTarget);

        if (trapState.shaolin.dirty) {
          setShaolinUsedTrapTypes(trapState.shaolin.usedTypes);
          setShaolinTrappedTiles(trapState.shaolin.triggered);
        }
        if (trapState.ninja.dirty) {
          setNinjaUsedTrapTypes(trapState.ninja.usedTypes);
          setNinjaTrappedTiles(trapState.ninja.triggered);
        }
        setIsRolling(false);
        setCurrentTurn(character === "shaolin" ? "ninja" : "shaolin");
        return;
      }

      if (directTarget >= 64) {
        setTile(64);
        current = 64;
        setIsRolling(false);
        await showModal({ type: "final_duel_intro" });
        setModal(null);
        const result = await showModal({
          type: "battle",
          mode: "duel",
          ninjaType: null,
          activeCharacter: "shaolin",
          otherCharacter: "ninja",
          p1Extras: shaolinInventory.extraPoses,
          p2Extras: ninjaInventory.extraPoses,
          p1LockedType: shaolinLockedType,
          p2LockedType: ninjaLockedType,
          isFinal: true,
        });
        setModal(null);
        setShaolinLockedType(null);
        setNinjaLockedType(null);
        setGameWinner(result === "p1" ? "shaolin" : "ninja");
        return;
      }
      setTile(directTarget);
      current = directTarget;
      await sleep(300);
      current = await resolveLanding(directTarget);

      if (trapState.shaolin.dirty) {
        setShaolinUsedTrapTypes(trapState.shaolin.usedTypes);
        setShaolinTrappedTiles(trapState.shaolin.triggered);
      }
      if (trapState.ninja.dirty) {
        setNinjaUsedTrapTypes(trapState.ninja.usedTypes);
        setNinjaTrappedTiles(trapState.ninja.triggered);
      }
      setIsRolling(false);
      setCurrentTurn(character === "shaolin" ? "ninja" : "shaolin");
      return;
    }

    for (let i = 0; i < steps; i++) {
      let next;
      if (current === null) next = 1;
      else next = current + 1;

      if (next >= 64) {
        setTile(64);
        current = 64;
        setIsRolling(false);
        await showModal({ type: "final_duel_intro" });
        setModal(null);
        const result = await showModal({
          type: "battle",
          mode: "duel",
          ninjaType: null,
          activeCharacter: "shaolin",
          otherCharacter: "ninja",
          p1Extras: shaolinInventory.extraPoses,
          p2Extras: ninjaInventory.extraPoses,
          p1LockedType: shaolinLockedType,
          p2LockedType: ninjaLockedType,
          isFinal: true,
        });
        setModal(null);
        setShaolinLockedType(null);
        setNinjaLockedType(null);
        setGameWinner(result === "p1" ? "shaolin" : "ninja");
        return; // Game over — skip normal turn handoff
      }

      setTile(next);
      current = next;

      const isLastStep = i === steps - 1;
      const t = tiles[next].type;

      // Hole — the player can use Safety Rope (if held) to cross the gap and
      // continue their dice move. Without the rope (or if they refuse), the
      // chip falls to the destination tile and the normal landing event there
      // resolves (e.g. item pickup, fight, trap).
      if (t === T.HOLE) {
        if (holdsSorcery(character, "safety_rope")) {
          await sleep(400);
          const use = await showModal({
            type: "sorcery_confirm",
            sorceryId: "safety_rope",
            title: "Safety Rope",
            prompt: isLastStep
              ? "You hold the Safety Rope. Anchor yourself on the hole and stay?"
              : "You hold the Safety Rope. Use it to cross the hole and continue your move?",
            detail: isLastStep
              ? "Spends the sorcery — your chip stays on the hole tile."
              : "Spends the sorcery — your chip passes over the hole and finishes the dice move.",
            yesLabel: "Use the rope",
            noLabel: "Let me fall",
          });
          setModal(null);
          if (use) {
            spendSorcery(character, "safety_rope");
            if (!isLastStep) {
              await sleep(300);
              continue;
            }
            break;
          }
        }
        current = await resolveLanding(next, { skipRopeCheck: true });
        break;
      }

      // Ladder modal opens every time the chip touches a ladder tile,
      // whether passing through or landing. Climbing (up or down) jumps to the
      // chosen destination and ends the move; "Stay" leaves the chip on the
      // ladder and the remaining dice steps continue normally.
      if (t === T.LADDER) {
        await sleep(400);
        const lt = tiles[next];
        const choice = await showModal({
          type: "ladder", tileNum: next, climbDir: lt.climbDir, dest: lt.dest,
          bothWay: lt.ladderKind === "both",
        });
        setModal(null);
        if (choice === "climb") {
          setTile(lt.dest);
          if (lt.ladderKind === "both") {
            // Landed on the partner ladder tile — traversal complete.
            current = lt.dest;
          } else {
            // Apply landing logic on the ladder destination (e.g. item pickup).
            current = await resolveLanding(lt.dest);
          }
          break;
        }
        if (!isLastStep) await sleep(500);
        continue;
      }

      // Fights only trigger when the final dice step lands on them —
      // passing over a fight tile mid-roll does not start a battle.
      if (t === T.FIGHT && isLastStep) {
        current = await resolveLanding(next);
        break;
      }

      // Items only trigger when the final dice step lands on them —
      // passing over an item tile mid-roll does not search the cache.
      if (t === T.ITEM && isLastStep) {
        current = await resolveLanding(next);
        break;
      }

      // Traps trigger only when the chip actually lands — passing over a
      // (hidden) trap tile does not spring it.
      if (t === T.TRAP && isLastStep) {
        current = await resolveLanding(next);
        break;
      }

      if (!isLastStep) await sleep(500);
    }

    if (trapState.shaolin.dirty) {
      setShaolinUsedTrapTypes(trapState.shaolin.usedTypes);
      setShaolinTrappedTiles(trapState.shaolin.triggered);
    }
    if (trapState.ninja.dirty) {
      setNinjaUsedTrapTypes(trapState.ninja.usedTypes);
      setNinjaTrappedTiles(trapState.ninja.triggered);
    }

    setIsRolling(false);
    setCurrentTurn(character === "shaolin" ? "ninja" : "shaolin");
  }

  if (!board.tiles) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif", color: "#a8261b" }}>
        Board generation failed after {board.attempts} attempts.
        <button onClick={() => setBoard(generateBoard())}>Retry</button>
      </div>
    );
  }

  const btn = {
    padding: "6px 12px", borderRadius: 6, border: "1px solid #c4ad7b",
    background: "#fff8e7", color: PALETTE.text,
    fontFamily: "inherit", fontSize: 13, fontWeight: 600,
    cursor: "pointer",
  };
  const btnActive = {
    ...btn, background: "#7a5500", color: "#fff8e7", borderColor: "#7a5500",
  };
  const styleFor = (active, disabled) => ({
    ...(active ? btnActive : btn),
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  });

  const gameStarted = currentTurn !== null;
  const bossTileReached = gameStarted && (shaolinTile === 64 || ninjaTile === 64);
  const isGameOver = gameWinner !== null;

  return (
    <div style={{
      minHeight: "100vh", padding: 20, background: "#1f1a10",
      fontFamily: "Georgia, serif", color: "#fdf6e3",
    }}>
      {showStartScreen && (
        <StartScreen
          onStart={() => { setShowStartScreen(false); startGame(); }}
          onSettings={() => { /* TODO: settings dialog (LLM config, etc.) */ }}
          onShare={() => { /* TODO: share link + preview image */ }}
        />
      )}
      <h1 style={{ margin: "0 0 4px 0", letterSpacing: 1 }}>
        Shaolin vs Ninja
      </h1>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        A duel of fortune, fate, and martial wisdom.
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!gameStarted && (
          <button onClick={startGame} style={{ ...btnActive, fontSize: 15, padding: "10px 24px" }}>
            ▶ Start the Game
          </button>
        )}
        <button
          onClick={regenerate}
          disabled={isRolling}
          style={{
            ...btn, fontSize: 13, padding: "7px 16px",
            cursor: isRolling ? "not-allowed" : "pointer",
            opacity: isRolling ? 0.5 : 1,
          }}
        >
          ↺ Regenerate Board
        </button>
      </div>

      {skipNotice && (
        <div style={{
          marginBottom: 14, padding: "10px 16px",
          background: "#2c1a0a", border: "1px solid #8a1620",
          borderRadius: 8, color: "#f5e6c8",
          fontFamily: "Georgia, serif", fontSize: 14,
          textAlign: "center", letterSpacing: 0.4,
        }}>
          ⛓ {skipNotice}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <Board
            tiles={board.tiles}
            shaolinTile={shaolinTile}
            ninjaTile={ninjaTile}
            gameStarted={gameStarted}
          />
        </div>

        {gameStarted && (
          <div style={{
            flex: "0 0 auto", width: 240,
            position: "sticky", top: 12,
            alignSelf: "flex-start",
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto",
          }}>
            <BattleLogPanel
              shaolinLog={shaolinBattleLog}
              ninjaLog={ninjaBattleLog}
            />
          </div>
        )}

        {gameStarted && (() => {
          // Compute per-player usability of pre-roll sorceries and roll eligibility.
          function preRollUsableFor(char) {
            const inv = char === "shaolin" ? shaolinInventory : ninjaInventory;
            const t = char === "shaolin" ? shaolinTile : ninjaTile;
            return inv.sorceries.some((s) => {
              const def = SORCERY_BY_ID[s.id];
              if (!def || def.trigger !== "pre_roll") return false;
              if (s.id === "ancient_key" && t === null) return false;
              if (s.id === "magic_compass" && t === null) return false;
              return true;
            });
          }
          function canRollFor(char) {
            return !isRolling && !bossTileReached && !isGameOver &&
                   (currentTurn === char || currentTurn === "any");
          }
          function rollLabel(char) {
            const showDice = lastRoll?.character === char;
            const dice = showDice ? ` 🎲 ${lastRoll.value}` : "";
            if (isRolling && currentTurn === char) return `Rolling…${dice}`;
            const name = char === "shaolin" ? "🥋 Roll for Shaolin Master" : "🥷 Roll for Ninja Warrior";
            return `${name}${dice}`;
          }
          return (
            <div style={{
              flex: "0 0 auto", width: 300,
              display: "flex", flexDirection: "column", gap: 12,
              position: "sticky", top: 12,
              alignSelf: "flex-start",
              maxHeight: "calc(100vh - 24px)",
              overflowY: "auto",
            }}>
              <button
                onClick={() => setBoardReferenceChar(currentTurn === "ninja" ? "ninja" : "shaolin")}
                style={{
                  padding: "7px 12px", borderRadius: 8,
                  background: "#fff8e7", border: "1px solid #c4ad7b",
                  color: "#5a4317", fontFamily: "Georgia, serif", fontSize: 13,
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                ❓ How fights work
              </button>
              <PlayerPanel
                character="shaolin"
                label="🥋 Shaolin Master"
                sorceries={shaolinInventory.sorceries}
                extraPoses={shaolinInventory.extraPoses}
                held={shaolinHeld}
                lockedType={shaolinLockedType}
                headStart={shaolinHeadStart}
                tile={shaolinTile}
                isMyTurn={currentTurn === "shaolin"}
                canRoll={canRollFor("shaolin")}
                rollLabelOverride={rollLabel("shaolin")}
                onRoll={() => rollFor("shaolin")}
                hasUsablePreRoll={preRollUsableFor("shaolin")}
                onUseSorcery={() => usePreRollSorcery("shaolin")}
                forcedRoll={forcedRoll}
                onForcedRollChange={setForcedRoll}
              />
              <PlayerPanel
                character="ninja"
                label="🥷 Ninja Warrior"
                sorceries={ninjaInventory.sorceries}
                extraPoses={ninjaInventory.extraPoses}
                held={ninjaHeld}
                lockedType={ninjaLockedType}
                headStart={ninjaHeadStart}
                tile={ninjaTile}
                isMyTurn={currentTurn === "ninja"}
                canRoll={canRollFor("ninja")}
                rollLabelOverride={rollLabel("ninja")}
                onRoll={() => rollFor("ninja")}
                hasUsablePreRoll={preRollUsableFor("ninja")}
                onUseSorcery={() => usePreRollSorcery("ninja")}
                forcedRoll={forcedRoll}
                onForcedRollChange={setForcedRoll}
              />
            </div>
          );
        })()}
      </div>

      {isGameOver && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.90)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 2000, fontFamily: "Georgia, serif",
        }}>
          <Draggable style={{
            ...MODAL_BOX,
            maxWidth: 640, width: "94%",
            maxHeight: "90vh",
            display: "flex", flexDirection: "column",
            background: "#120d04",
            border: "2px solid #d4af37",
            color: "#f5e8c4",
          }}>
            <div
              aria-label="Victory"
              title="勝 — Victory"
              style={{
                fontSize: 56,
                lineHeight: 1,
                marginBottom: 10,
                color: "#d4af37",
                textShadow: "0 0 20px rgba(212,175,55,0.55), 0 2px 4px rgba(0,0,0,0.6)",
                fontFamily: '"Songti SC", "STKaiti", "DFKai-SB", "Noto Serif CJK SC", "SimSun", Georgia, serif',
                fontWeight: 700,
                letterSpacing: "0.15em",
              }}
            >
              勝
            </div>
            <h1 style={{ margin: "0 0 10px 0", fontSize: 22, color: "#d4af37", letterSpacing: 1 }}>
              A Legend Is Born
            </h1>
            <p style={{ fontSize: 15, fontStyle: "italic", margin: "0 0 18px 0", color: "#c4ad7b" }}>
              The battle has ended, but the story lives on.
            </p>
            <div style={{
              flex: "1 1 auto",
              minHeight: 0,
              overflowY: "auto",
              textAlign: "left",
              padding: "16px 18px",
              marginBottom: 22,
              background: "rgba(245,232,196,0.05)",
              border: "1px solid rgba(212,175,55,0.45)",
              borderRadius: 8,
              color: "#e8dcb0",
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 14.5,
              lineHeight: 1.65,
            }}>
              {getFinalStory(gameWinner).split(/\n\s*\n/).map((para, i) => (
                <p key={i} style={{ margin: i === 0 ? "0 0 12px 0" : "0 0 12px 0" }}>
                  {para.trim()}
                </p>
              ))}
            </div>
            <button
              style={{ ...BTN_PRIMARY, background: "#d4af37", color: "#120d04", fontSize: 15, padding: "12px 28px", flex: "0 0 auto" }}
              onClick={() => { regenerate(); setShowStartScreen(true); }}
            >
              ↺ Start New Game
            </button>
          </Draggable>
        </div>
      )}

      {modal?.type === "final_duel_intro" && (
        <FinalDuelIntroModal onBegin={() => modal.resolve("begin")} />
      )}

      {modal?.type === "ladder" && (
        <LadderModal
          tileNum={modal.tileNum}
          climbDir={modal.climbDir}
          dest={modal.dest}
          bothWay={modal.bothWay}
          onClimb={() => modal.resolve("climb")}
          onStay={() => modal.resolve("stay")}
        />
      )}
      {modal?.type === "fight_intro" && (
        <FightIntroModal
          ninjaType={modal.ninjaType}
          onFight={() => modal.resolve("fight")}
        />
      )}
      {modal?.type === "battle" && (
        <BattleScreen
          mode={modal.mode || "duel"}
          ninjaType={modal.ninjaType}
          activeCharacter={modal.activeCharacter}
          otherCharacter={modal.otherCharacter}
          p1Label={modal.activeCharacter === "shaolin" ? "🥋 Shaolin Master" : "🥷 Ninja Warrior"}
          p2Label={
            modal.mode === "solo"
              ? `🥷 ${NINJA[modal.ninjaType].name}`
              : (modal.otherCharacter === "shaolin" ? "🥋 Shaolin Master" : "🥷 Ninja Warrior")
          }
          p1Extras={modal.p1Extras || []}
          p2Extras={modal.p2Extras || []}
          p1LockedType={modal.p1LockedType || null}
          p2LockedType={modal.p2LockedType || null}
          p1Sorceries={modal.activeCharacter === "shaolin" ? shaolinInventory.sorceries : ninjaInventory.sorceries}
          p2Sorceries={
            modal.mode === "duel"
              ? (modal.otherCharacter === "shaolin" ? shaolinInventory.sorceries : ninjaInventory.sorceries)
              : []
          }
          onSpendSorcery={(player, id) => {
            const char = player === "p1" ? modal.activeCharacter : modal.otherCharacter;
            if (!char) return;
            const setInv = char === "shaolin" ? setShaolinInventory : setNinjaInventory;
            setInv((prev) => ({ ...prev, sorceries: prev.sorceries.filter((s) => s.id !== id) }));
          }}
          onDestroyTechnique={(player, poseId) => {
            // Thunder Dragon burns out when it loses — gone for the session.
            const char = player === "p1" ? modal.activeCharacter : modal.otherCharacter;
            if (!char) return;
            const setInv = char === "shaolin" ? setShaolinInventory : setNinjaInventory;
            setInv((prev) => ({ ...prev, extraPoses: prev.extraPoses.filter((p) => p.id !== poseId) }));
          }}
          headStart={modal.headStart || null}
          isFinal={!!modal.isFinal}
          p1CombatRating={
            modal.activeCharacter === "shaolin"
              ? computeCombatRating(shaolinBattleLog)
              : computeCombatRating(ninjaBattleLog)
          }
          p2CombatRating={
            modal.mode === "duel"
              ? (modal.otherCharacter === "shaolin"
                  ? computeCombatRating(shaolinBattleLog)
                  : computeCombatRating(ninjaBattleLog))
              : 0
          }
          onResolved={(result) => modal.resolve(result)}
        />
      )}
      {modal?.type === "item" && (
        <ItemModal
          variant={modal.variant}
          item={modal.item}
          onClose={() => modal.resolve("ok")}
        />
      )}
      {modal?.type === "sorcery_confirm" && (
        <SorceryConfirmModal
          sorceryId={modal.sorceryId}
          title={modal.title}
          prompt={modal.prompt}
          detail={modal.detail}
          yesLabel={modal.yesLabel}
          noLabel={modal.noLabel}
          onChoose={(yes) => modal.resolve(yes)}
        />
      )}
      {modal?.type === "sorcery_picker" && (
        <SorceryPickerModal
          sorceries={modal.sorceries}
          title={modal.title}
          onPick={(id) => modal.resolve(id)}
          onCancel={() => modal.resolve(null)}
        />
      )}
      {modal?.type === "magic_compass" && (
        <MagicCompassModal
          currentTile={modal.currentTile}
          onConfirm={(choice) => modal.resolve(choice)}
          onCancel={() => modal.resolve(null)}
        />
      )}
      {modal?.type === "ancient_key" && (
        <AncientKeyModal
          currentTile={modal.currentTile}
          onConfirm={(choice) => modal.resolve(choice)}
          onCancel={() => modal.resolve(null)}
        />
      )}
      {modal?.type === "trap_announce" && (
        <TrapAnnounceModal
          trapType={modal.trapType}
          message={modal.message}
          onClose={() => modal.resolve("ok")}
        />
      )}
      {modal?.type === "trap_sorcery_theft" && (
        <TrapSorceryTheftModal
          sorceries={modal.sorceries}
          onChoose={(id) => modal.resolve(id)}
        />
      )}
      {modal?.type === "trap_pose_theft" && (
        <TrapPoseTheftModal
          poses={modal.poses}
          onChoose={(id) => modal.resolve(id)}
        />
      )}
      {modal?.type === "trap_tribute" && (
        <TrapTributeModal
          item={modal.item}
          given={modal.given}
          onClose={() => modal.resolve("ok")}
        />
      )}
      {boardReferenceChar && (
        <FightReferenceModal
          character={boardReferenceChar}
          isFinal={false}
          heldExtraIds={(boardReferenceChar === "shaolin" ? shaolinInventory : ninjaInventory).extraPoses.map((p) => p.id)}
          onClose={() => setBoardReferenceChar(null)}
        />
      )}
    </div>
  );
}
