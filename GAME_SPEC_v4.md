# Shaolin Master vs The Shadow Clan — Game Design Specification

This document describes the full game design as agreed during the design session. It is intended for use by Claude Code and the developer to guide implementation, iteration, and debugging.

---

## Overview

A digital board game inspired by a classic Polish tabletop game "Bruce Lee" (1980s). Designed primarily for a parent and child (age 8+) to play together. Tone: fun, dramatic, visual, Asian martial arts with kung fu flair. Target session length: 35–45 minutes.

The game is built as a React/JSX single-page application running in the browser. No backend, no persistent state between sessions. Optional AI narration via various AI/LLM APIs, but gameplay must never depend on it.

---

## Game Modes

Three modes are selectable at game start:

1. **Team — Play as Shaolin Master**
   One or two players share the same screen and cooperate as Shaolin Master against computer-controlled ninjas and a final ninja boss.

2. **Team — Play as Ninja**
   One or two players share the same screen and cooperate as a Ninja against computer-controlled Shaolin Master encounters and a final ultimate fight with Shaolin Master.

3. **Versus — Player vs Player**
   One player is Shaolin Master, the other is a Ninja. They share the same game board. Turns alternate. The game ends with an Ultimate Duel (see Win Conditions).

---

## The Board

The board is a winding path of tiles from tile 1 to tile 64. Visually it follows the style of classic tabletop snakes-and-ladders games: a thick bordered path that snakes back and forth across the board, with individual coloured tile squares inside the path outline. It should look like a road, not a grid of isolated cells.

The board layout is procedurally generated each game. Every generation obeys balancing constraints (see below) so that no game is unplayable or heavily skewed. The path shape itself can vary between games.

The path follows a standard snake pattern: left to right on odd rows, right to left on even rows, starting at tile 1 (top-left) and ending at tile 64 (bottom-left). The boss tile 
is always visually distinct regardless of its position. 

### Tile Types

| Type | Visible before landing? | Description |
|---|---|---|
| Normal | Yes — plain tile | Safe. Landing modal opens with a short flavour scene. No game effect. |
| Fight | Yes — shows enemy type icon (colour-coded per ninja type) | An encounter. Landing modal announces the enemy, then opens the battle screen. |
| Item | Partial — shows a chest or scroll icon; contents unknown | Landing modal reveals what was found. Player clicks to pick up. |
| Ladder | Yes — full | Player may choose to use it or ignore it. Ladders always move forward (downward toward the boss), skipping tiles between the ladder and its destination.|
| Hole | Yes — renders as a visible abyss | Player falls forward 1 or 2 rows. Safety Rope sorcery offers a choice to stay or fall. |
| Trap | No — looks identical to a normal tile | Hidden event. Revealed only on landing. No advance warning. |
| Boss | Yes — visually distinct final tile | Triggers the boss fight or Ultimate Duel. Reached by direct landing or overshoot. |

### Tile Distribution (64 tiles total)

- 28 normal tiles
- 12 fight tiles
- 10 item tiles
- 6 ladder tiles (all forward-facing, toward the boss)
- 4 trap tiles (one per trap type)
- 3 hole tiles (forward skips of 1 or 2 rows)
- 1 boss tile (tile 64)

### Hole Mechanics

Holes are gaps in the path. You fall through and land further ahead — skipping a section of the path entirely. This makes holes a risky shortcut: you advance faster but miss everything in between (items, fights, ladders). Sometimes that is good. Sometimes it is not.

**Visual:** A hole tile does not render as a filled square. It renders as an abyss — dark, empty, irregular. The path visually breaks at this point.

**Fall depth:**
- 1-row fall: player skips forward one row of the snaking path (approximately 8 tiles ahead).
- 2-row fall: player skips forward two rows (approximately 16 tiles ahead).
- Depth is assigned at board generation and fixed for the session.
- The destination tile is always a normal tile — never a hole, trap, fight, or boss tile.
- If a fall would land the player on tile 64 or beyond, they land on tile 64 and the boss sequence triggers normally.

**Resolution:**
- If the player does not hold a Safety Rope sorcery: the chip falls automatically to the destination tile. The destination tile's landing modal then opens normally.
- If the player holds a Safety Rope sorcery: a modal opens asking "Use the Safety Rope to stay on this tile?" Yes spends the sorcery and the player stays. No lets the player fall willingly — the sorcery is preserved. A player may sometimes choose to fall even with the rope available.

### Trap Types

Traps are hidden tile events with negative effects. A trap tile looks identical to a normal tile until landed on. When triggered, a modal announces the trap and resolves the effect before the turn ends. Four trap types exist. Each appears at most once per game. No sorcery can be used to avoid a trap in advance — only reactive sorceries that apply after the trap triggers are relevant.

**Hold**
The player loses their next turn. A visible indicator appears on their panel as a reminder. At the start of what would be their next turn, the hold resolves automatically and play passes on. If both players are simultaneously held, both skip a turn and the hold clears.

**Sorcery Theft**
The player must surrender one sorcery of their choice. A modal shows their current sorceries and prompts a selection. If the player holds no sorceries, no effect ("The thief finds nothing and retreats."). The surrendered sorcery is removed from the game — it does not transfer to the opponent.

**Pose Theft**
The player must surrender one acquired extra pose (secret technique) of their choice. A modal shows their extra poses and prompts a selection. If the player holds no extra poses, no effect ("The seal finds nothing to suppress."). Base poses (the standard starting set of 9) cannot be stolen. The surrendered pose is removed from the game.

**Unexpected Fight**
A ninja ambushes the player. This fight cannot be skipped with the Ancient Key sorcery — it is an ambush, not a guarded passage. The ninja type is drawn randomly from Fire Ninja, Shadow Ninja, or Demon Ninja only. The Black Ninja does not appear here. All other battle rules apply normally. The outcome of this fight affects the Combat Rating (see Combat Rating).

### Balancing Constraints for Generation

Every generated board must satisfy all of the following:

**Fight tiles:**
- No two fight tiles adjacent to each other.
- No fight tile within 3 tiles of the start (tiles 1–3 are always normal).
- Fight tile ninja types are assigned at generation: ~45% Black, ~20% Fire, ~20% Shadow, ~10% Demon, remainder Black.
- The Demon Ninja tile (if present) must not appear in the first 20 tiles.

**Item tiles:**
- At least 2 item tiles must appear in the first half of the board (tiles 1–32).

**Ladders:**
- All ladders move the player forward (downward toward the boss).
- At least 1 ladder in the first half (tiles 1–32) and at least 1 in the second half (tiles 33–63).
- Each ladder's origin tile must be a normal tile
- Each ladder's destination tile must be a normal tile or an item tile - this is not prohibited.
- No ladder may land on a fight, trap, hole, or boss tile.
- No ladder may land to an adjucent tile.
- There should be no more than 2 ladders in a given row. 

**Holes:**
- No hole within 5 tiles of the start.
- No two holes within 3 tiles of each other.
- No hole within 2 tiles of a trap tile.
- At least one item tile or normal tile must exist between a hole's origin and its destination (so the skip always costs something).

**Traps:**
- No trap tile within 5 tiles of the start.
- No trap tile within 2 tiles of a fight tile.
- No two trap tiles adjacent to each other.
- The Unexpected Fight trap must not appear within 4 tiles of a regular fight tile.

**Boss Approach Zone (tiles 60–63):**
- Tiles 60–63 must all be normal tiles — no fights, no traps, no ladders, no holes. Once a player enters this zone, the path to the boss is clear.

### Reaching the Boss

**Boss tile (64):** Any roll that would move a player to tile 64 or beyond lands them on tile 64 exactly. The excess is discarded.

**Team mode:** The player reaches tile 64 when any roll lands them there or past it. The approach zone (tiles 60–63) guarantees arrival within one to four turns once entered. The boss fight begins immediately upon landing.

**Versus mode:** The same overshoot rule applies to both players independently. The first player to land on tile 64 triggers the Ultimate Duel immediately — the second player does not need to reach tile 64 for the duel to happen. If the first player loses the duel, they are sent back to tile 40, and the second player now has their own chance to reach tile 64 and trigger a new duel. The approach zone applies equally to both players.

---

## Movement

- The active player shakes the fortune sticks to roll 1–6.
- The player's chip animates across each intermediate tile along the path until reaching the target tile. Each tile is briefly highlighted as the chip passes through — replicating the physical feel of sliding a piece across a board. Animation should complete within roughly 1.5–2 seconds total.
- The landing tile shows the player's chip placed on it (visually highlighted) until the player moves on.
- Upon landing, a landing modal opens automatically (see Landing Modals).

### Ladder Tiles

- When the chip lands on a ladder tile, the landing modal shows the ladder and asks: "Use the ladder?" with Yes / No.
- If Yes: the chip animates along the ladder to the connected tile on the level above or below, then that tile's landing modal opens normally.
- If No: turn ends normally. The chip stays on the ladder tile until the next move.


### Hole Tiles

- When the chip lands on a hole tile:
- If the player holds no Safety Rope: chip falls automatically to the destination tile Destination tile's landing modal opens.
- If the player holds a Safety Rope: modal opens asking "Use the Safety Rope to stay?" Yes spends the rope and the player stays. No falls willingly, rope preserved.

### Trap Tiles

- Trap tiles look identical to normal tiles before landing. The player has no advance warning.
- When the chip lands on a trap tile, the modal announces the trap type and resolves the effect immediately.

---

## Landing Modals

Every tile landing triggers a modal. Modals must be dismissed by the player before the next turn begins.

### Normal Tile Modal

- Displays a pre-selected or AI-generated Asian scenery illustration (bamboo forest, mountain path, temple gate, misty river, etc.).
- Displays a short flavour text in an atmospheric tone. Examples:
- "The path winds through bamboo. Shaolin Master breathes, steadies himself, and walks on."
- "A crow watches from a pine branch. No enemies today. Press forward."
- "Silence. Even the wind holds its breath."
- If AI narration is enabled, this text is generated via the API. Otherwise drawn from a pool of ~30 pre-written lines.
- One "Continue" button closes the modal and ends the turn.

### Item Tile Modal

- Displays an illustration of the item found (or an empty tile image if nothing is present).
- If something is found: names and describes the item and its effect. A "Pick up" button adds it to the player's inventory. The item visually appears in their equipment panel.
- If nothing: short flavour message ("You search carefully. Nothing but dust and silence."). Continue button.

### Fight Tile Modal

- First frame: announces the enemy. Shows ninja type name, colour, and a brief description of their fighting style. A "Face them" button begins the battle.
- Battle screen then opens (see Combat System). This is a separate layer from the modal.
- After battle: brief result modal showing outcome and updated Combat Rating before returning to the board.

### Boss Tile Modal

- Opens with a cinematic frame: the Master Ninja (or Shaolin Master, if playing as Ninja team) stands at the path's end.
- **Team Mode:** Displays the current Combat Rating and remaining boss attempts alongside the cinematic frame. "The Master Ninja awaits. This is the final test." Boss fight begins immediately.
- **Versus Mode:** "The path ends here. The final fight begins." The Ultimate Duel triggers immediately between the two players (Shaolin Master vs Ninja), not against the Master Ninja. Full rules in Win Conditions.

---

## Combat System

### Poses and Move Types

Every fighter has a set of poses. Each pose has two attributes:

- **Type:** Strike, Block, or Dodge.
- **Height:** High, Mid, or Low — representing where the body is positioned or where the attack is aimed.

These two attributes together determine the outcome of every combat round.

### Base Pose Set

All players start with the full base set of 9 poses. No poses are locked or gated. All 9 are available from the first turn.

**Shaolin Master:**
| Pose | Type | Height |
|---|---|---|
| Flying Kick | Strike | High |
| Dragon Fist | Strike | Mid |
| Crescent Sweep | Strike | Low |
| Iron Guard | Block | High |
| Tiger Block | Block | Mid |
| Mountain Stance | Block | Low |
| Shadow Step | Dodge | High |
| Cat Retreat | Dodge | Mid |
| Low Slip | Dodge | Low |

**Ninja:**
| Pose | Type | Height |
|---|---|---|
| Blade Edge | Strike | High |
| Death Kick | Strike | Mid |
| Spinning Fist | Strike | Low |
| Turtle Shell | Block | High |
| Stone Wall | Block | Mid |
| Shield Cross | Block | Low |
| Phantom Drift | Dodge | High |
| Snake Coil | Dodge | Mid |
| Wind Escape | Dodge | Low |

The visual stances differ between Shaolin Master and Ninja, but types and heights are symmetrical. Players may develop favourite poses over time.

### Extra Poses (Secret Techniques)

Up to 3 extra poses are hidden in the game, found via item tiles by luck. Each extra pose is a Strike with an assigned height. They are visually distinct and unfamiliar — opponents won't know the height until revealed, which is their strategic value.

**Shaolin Master extras:**
| Pose | Type | Height |
|---|---|---|
| Thunder Dragon | Strike | High |
| Ghost Walk | Strike | Mid |
| Steel Lotus | Strike | Low |

**Ninja extras:**
| Pose | Type | Height |
|---|---|---|
| Demon Claw | Strike | High |
| Void Step | Strike | Mid |
| Iron Shroud | Strike | Low |

Probability of finding each:
- 1st extra pose: likely but not guaranteed during a normal playthrough
- 2nd extra pose: harder, requires luck
- 3rd extra pose: rare

Extra poses are permanent once acquired for that session. They do not carry to the next game. They can be lost via the Pose Theft trap.

### Battle Resolution

Both players choose a pose secretly, then reveal simultaneously. The outcome is determined by type and height as follows.

**Strike vs Dodge:**

| | Dodge-High | Dodge-Mid | Dodge-Low |
|---|---|---|---|
| **Strike-High** | Dodge wins | Dodge wins | Strike wins |
| **Strike-Mid** | Strike wins | Strike wins | Dodge wins |
| **Strike-Low** | Strike wins | Dice | Dodge wins |

Physical logic: a dodge moves the body away at a specific level. Strike-High aims at the head — Dodge-High and Dodge-Mid both move the head out of reach, but Dodge-Low leaves the head exposed. Strike-Mid aims at the chest — only Dodge-Low moves the chest away sufficiently. Strike-Low sweeps the legs — only Dodge-Low moves the legs away; Dodge-Mid is a partial evasion, luck decides.

**Strike vs Block:**

| | Block-High | Block-Mid | Block-Low |
|---|---|---|---|
| **Strike-High** | Block wins | Dice | Strike wins |
| **Strike-Mid** | Dice | Block wins | Dice |
| **Strike-Low** | Strike wins | Dice | Block wins |

Physical logic: a block is a static defence positioned at one level. Same height = clean intercept, block wins. Adjacent height = uncertain, dice decides. Opposite height = strike sails past the block, strike wins.

**All other matchups — dice decides:**
- Strike vs Strike (any heights): both connect, luck decides who hit harder
- Block vs Block (any heights): neither attacking, positional standoff
- Dodge vs Dodge (any heights): both evading
- Block vs Dodge (any heights): both defensive, neither attacking

**Dice roll:**
Both sides roll one die. Higher roll wins the round. On equal rolls: re-roll until one side wins.

**Winning a battle:**
First to win 2 rounds wins the battle. No fixed round limit — play continues until one side reaches 2 wins.

### Ninja Types and Computer Behaviour

In team mode, the computer controls all enemy encounters. The computer picks a pose type based on weighted probability per ninja type, then selects a random height within that type.

| Ninja Type | Strike % | Block % | Dodge % | Special behaviour |
|---|---|---|---|---|
| Black Ninja | 33 | 33 | 34 | None. Balanced and predictable. |
| Fire Ninja | 60 | 20 | 20 | Relentless. Punishes hesitation. |
| Shadow Ninja | 20 | 20 | 60 | Evasive. Hard to anticipate. |
| Demon Ninja | 34 | 33 | 33 | 15% chance to use one of the three extra ninja poses (Demon Claw, Void Step, or Iron Shroud) instead of a base pose — introducing a Strike at an unexpected height. |
| Master Ninja | 34 | 33 | 33 | Uses the full pose set including all three extra ninja poses. Boss only. |

**Ninja setbacks on player loss (intermediate fights):**
| Ninja Type | Tiles set back | Combat Rating effect |
|---|---|---|
| Black Ninja | 2 | −1 |
| Fire Ninja | 3 | −1 |
| Shadow Ninja | 3 | −1 |
| Demon Ninja | 5 | −1 |

**Ninja colours (for board icons and battle screen):**
- Black Ninja: dark grey
- Fire Ninja: orange-red
- Shadow Ninja: blue-violet
- Demon Ninja: purple
- Master Ninja: gold

---

## Combat Rating (Team Mode Only)

The Combat Rating tracks the team's fighting performance across all intermediate fights throughout the session. It starts at 0, persists across all three boss attempts, and directly affects the dice rolls during the boss fight.

### How It Changes

- **Win an intermediate fight:** +1
- **Lose an intermediate fight:** −1
- **Skip a fight (Ancient Key):** no change — skipping is neutral
- **Unexpected Fight trap:** applies normally (+1 win, −1 loss)
- **Boss fight itself:** does not affect the Combat Rating

The rating has no floor or ceiling — it can go negative if losses outweigh wins.

### Effect on the Boss Fight

The Combat Rating applies as a dice modifier to all dice-roll situations during the boss fight (see Battle Resolution for when dice are used):

| Combat Rating | Dice modifier vs boss |
|---|---|
| +3 or higher | +2 to your die roll |
| +1 or +2 | +1 to your die roll |
| 0 | no modifier |
| −1 or −2 | −1 to your die roll |
| −3 or lower | −2 to your die roll |

A +2 modifier against the boss is a meaningful edge in any dice situation. A −2 modifier makes the boss fight significantly harder.

### The Comeback Loop

When the team loses a boss attempt and is sent back to tile 40, they retain their current Combat Rating. If that rating is low or negative, they now have 20+ tiles to travel before reaching the boss again — more fight encounters, more opportunities to push the rating upward before the next attempt. A poor first attempt is not a dead end; it is a second chance to earn strength.

### Display

The Combat Rating is always visible on the player panel. It updates immediately after each fight result is shown. On the boss tile modal, the current rating and its dice modifier are displayed clearly before the fight begins so the team knows what they are bringing into the final confrontation.

---

## Sorceries

Sorceries are single-use special items found on item tiles. They are a separate category from poses — they do not participate in combat resolution directly. They override, modify, or augment outcomes.

Finding a sorcery is luck-based. Players cannot acquire them on demand. Multiple sorceries can be held simultaneously. Sorceries expire at the end of the session and can be lost via the Sorcery Theft trap.

### Sorcery Types

| Sorcery | When used | Effect |
|---|---|---|
| Magic Powder | During battle, before choosing a pose | For one round against a Fire Ninja, the player's pose wins the round automatically — no dice, no matchup calculation. Spent on use. Cannot be used against other ninja types. |
| Ancient Key | On landing on a fight tile | Skip the fight entirely. No battle occurs. Combat Rating unchanged. Cannot be used on the Boss tile or against the Unexpected Fight trap. Spent on use. |
| Shadow Scroll | During battle, before choosing a pose | Reveals the enemy's pose (type and height) for that round before the player commits their own choice. Spent on use. |
| Iron Bell | During battle, immediately after losing a round | The lost round is cancelled — no point is scored for either side and the round is replayed from pose selection. Spent on use. |
| Dragon Rope | At the start of a turn, before rolling | Instead of rolling fortune sticks, the player jumps 1–4 tiles forward (random). The destination tile's landing modal opens normally. Spent on use. |
| Safety Rope | On landing on a hole tile | A modal asks: "Use the Safety Rope to stay?" Yes spends the rope and the player stays on the hole tile. No lets the player fall willingly — rope preserved. |

### Balance Principles

- No sorcery guarantees a win. Each only removes one obstacle or shifts odds in one situation.
- Powerful sorceries (Dragon Rope, Ancient Key) should be rarer on the board than minor ones (Iron Bell, Safety Rope).

---

## Win Conditions

### Team Mode

Goal: reach tile 64 and defeat the Master Ninja (or Shaolin Master, if playing as Ninja) within 3 attempts.

**Boss attempt limit:** The team has exactly 3 attempts to defeat the boss. The remaining attempt count is displayed at all times once the first attempt has been made. If the team loses all 3 attempts, the game ends in defeat.

**On a boss loss:** the team is sent back to tile 40. All items, extra poses, and sorceries are retained. The Combat Rating is retained and carries into the next attempt. The team resumes play from tile 40.

**On a boss win:** victory. Game ends immediately.

The Combat Rating accumulated across intermediate fights applies as a dice modifier during every boss attempt (see Combat Rating). A team that fought well throughout the board enters the boss fight stronger. A team that avoided or lost fights will find the boss harder — but being sent back to tile 40 gives them more path to recover their rating before the next attempt.

### Versus Mode

Goal: be the first to reach tile 64 and win the Ultimate Duel.

- The first player to reach tile 64 triggers the Ultimate Duel immediately — no waiting for the second player.
- The Ultimate Duel is a battle between the two players (Shaolin Master vs Ninja) — not against the Master Ninja.
- Standard battle rules apply. All items, sorceries, and extra poses collected during the board phase carry into the duel.
- If the first player loses the duel: they are sent back to tile 40. The second player now has a chance to reach tile 64 and trigger a new duel.
- This can repeat, reflecting the "multiple fights throughout the film, one final decisive clash" structure of kung fu cinema.

Note: Combat Rating is a team mode mechanic only. It does not apply in versus mode.

---

## Progression Within a Session

There is no explicit rank or level system. What changes during a game:

- **Combat Rating** (team mode): rises with fight wins, falls with losses. Carries through all boss attempts. Directly affects boss fight dice rolls.
- **Extra poses acquired**: up to 3. Luck-based. Cannot be deliberately farmed. Can be lost via Pose Theft trap.
- **Sorceries held**: any combination, found by luck. Can be lost via Sorcery Theft trap.
- **Board position**: naturally progresses but can be affected by holes (forward skip), lost battles (tile setback), and the Hold trap (lost turn).
- **Boss attempts remaining** (team mode): starts at 3, decrements on each boss loss. Displayed visibly at all times once the first attempt is made.

The intent: two players always start equal. What separates them by the end is how the board treated them and how they fought — neither fully in their control.

---

## Battle Log

A persistent panel (collapsible, visible on the main board screen) that records every combat encounter during the session.

Each entry contains:
- Turn number
- Which player fought
- Enemy type (e.g. Fire Ninja)
- Outcome (Victory / Defeat)
- Tile number where the encounter occurred
- Combat Rating change (+1 / −1, team mode only)

A summary line at the top shows total wins and losses for each player, and the current Combat Rating (team mode only). The log is session-only and resets with a new game.

---

## Visual Design Principles

- Light theme for the board itself (path, tiles, background). Keeps the board readable and close to the physical tabletop feel.
- Dark overlays for battle screens and modals — these are dramatic moments and should feel distinct from the board.
- Typography: serif (Georgia or similar) for titles and dramatic moments; clean sans for UI.
- Stick figures in SVG for all poses. Each pose is a distinct body position readable at small size.
- Fortune sticks visual for dice: bamboo cup, 5 sticks, Chinese numeral result (一 through 六).
- The pose selection screen during battle displays all available poses as cards with the stick figure, pose name, type, and height label.
- Enemy pose is shown face-down until reveal. Both poses displayed side by side after reveal.
- Fight tiles display a small enemy-type icon visible before landing (colour-coded per ninja type). Item tiles display a neutral chest or scroll icon — contents are not shown. Trap tiles have no special marking and are visually indistinguishable from normal tiles.
- Hole tiles render as an abyss — dark, irregular, visually breaking the path outline.
- The player panel displays: board position, extra poses held, sorceries held, Combat Rating (team mode), boss attempts remaining (team mode).

---

## AI Narration (Optional)

- Configured via an API key entered in the settings panel on the title screen.
- If no key is provided, or if an API call fails: fall back to a pool of pre-written flavour lines. Gameplay is never blocked.
- Narration appears in two places: after a battle round resolves (one cinematic sentence), and on normal tile landings (atmospheric scene text).
- Battle narration prompt includes: player pose name, type and height, enemy pose name, type and height, whether dice were rolled, round outcome, ninja type.
- Max 80 tokens per narration call. Model: claude-sonnet-4-20250514 (or equivalent).
- Narration is atmospheric only. It does not affect game logic.

---

## Technical Notes

- Framework: React (JSX), single file component.
- No external libraries required beyond React.
- No backend. No persistent storage. Stateless between sessions.
- Board state, player state, and battle state are all held in React `useState`.
- The AI API is called client-side using `fetch`. The API key is stored only in component state (not localStorage).
- All randomness uses `Math.random()`. No seeded RNG required.

---


