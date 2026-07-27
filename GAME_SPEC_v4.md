# Shaolin Master vs The Shadow Clan — Game Design Specification

This document describes the full game design as agreed during the design session. It is intended for use by Claude Code and the developer to guide implementation, iteration, and debugging.

---

## Overview

A digital board game inspired by a classic Polish tabletop game "Bruce Lee" (1980s). Designed primarily for a parent and child (age 8+) to play together. Tone: fun, dramatic, visual, Asian martial arts with kung fu flair. Target session length: 35–45 minutes.

The game is built as a React/JSX single-page application running in the browser. No backend, no persistent state between sessions. Optional AI narration via various AI/LLM APIs, but gameplay must never depend on it.

A session is framed by story: an intro screen sets the scene before the first roll, and a closing epilogue keyed to the winner plays after the Ultimate Duel. In between, up to two shared mid-game beats appear — one the moment a player first crosses the halfway point (tile 33), and one the first time a Demon Ninja is defeated — shown immediately as they happen. All of this is flavour only and affects no rules.

---

## Game Mode

One mode: **Versus — Player vs Player.** One player is Shaolin Master, the other is a Ninja. They share the same board and the same screen; turns alternate. Intermediate fight tiles are fought against computer-controlled ninjas; the game ends with an Ultimate Duel between the two players (see Win Conditions).

Team/cooperative modes are not implemented.

---

## The Board

The board is a winding path of tiles from tile 1 to tile 64. Visually it follows the style of classic tabletop snakes-and-ladders games: a thick bordered path that snakes back and forth across the board, with individual coloured tile squares inside the path outline. It should look like a road, not a grid of isolated cells.

The board layout is procedurally generated each game. Every generation obeys balancing constraints (see below) so that no game is unplayable or heavily skewed. The path shape itself can vary between games.

The path follows a standard snake pattern: left to right on odd rows, right to left on even rows, starting at tile 1 (top-left) and ending at tile 64 (bottom-left). The duel tile is always visually distinct.

### Tile Types

| Type | Visible before landing? | Description |
|---|---|---|
| Normal | Yes — plain tile | Safe. Landing modal opens with a short flavour scene. No game effect. |
| Fight | Yes — shows enemy type icon (colour-coded per ninja type) | An encounter. Landing modal announces the enemy, then opens the battle screen. |
| Item | Partial — shows a chest or scroll icon; contents unknown | Landing modal reveals what was found. Player clicks to pick up. |
| Ladder | Yes — full | Player may choose to use it or ignore it. A ladder may run forward (toward the duel tile), backward (toward tile 1), or both ways, skipping the tiles between the ladder and its destination.|
| Hole | Yes — renders as a visible abyss | Player falls forward 1 or 2 rows. Safety Rope sorcery offers a choice to stay or fall. |
| Trap | No — looks identical to a normal tile | Hidden event. Revealed only on landing. No advance warning. |
| Duel | Yes — visually distinct final tile (gold ♔ DUEL) | Triggers the Ultimate Duel between the two players. Reached by direct landing or overshoot. |

### Tile Distribution (64 tiles total)

- 25 normal tiles
- 12 fight tiles
- 12 item tiles (at list one item tile per "board row")
- 6 ladder tiles (2 forward, 2 backward, 2 two-way)
- 6 trap tiles (the danger set slides during play — see Trap Types)
- 3 hole tiles (forward skip 1 row)
- 1 duel tile (tile 64)

### Hole Mechanics

Holes are gaps in the path. You fall through and land further ahead — skipping a section of the path entirely. This makes holes a risky shortcut: you advance faster but miss everything in between (items, fights, ladders). Sometimes that is good. Sometimes it is not.

**Visual:** A hole tile does not render as a filled square. It renders as an abyss — dark, empty, irregular. The path visually breaks at this point.

**Fall depth:**
- All holes are 1-row falls: the player skips forward one row of the snaking path (approximately 8 tiles ahead).
- The destination tile is always a normal tile — never a hole, trap, fight, item, or duel tile.
- Tile 49 is excluded as a hole origin, since its fall would land on tile 64.

**Resolution:**
- If the player does not hold a Safety Rope sorcery: the chip falls automatically to the destination tile. The destination tile's landing modal then opens normally.
- If the player holds a Safety Rope sorcery: a modal opens asking "Use the Safety Rope to stay on this tile?" Yes spends the sorcery and the player stays. No lets the player fall willingly — the sorcery is preserved. A player may sometimes choose to fall even with the rope available.

### Trap Types

Traps are hidden tile events with negative effects. A trap tile looks identical to a normal tile until landed on. When triggered, a modal announces the trap and resolves the effect before the turn ends. Seven trap types are defined. No sorcery can be used to avoid a trap in advance.

There are six live trap tiles at any time, but **traps are not fixed to their tiles**. The moment a trap springs, it slides away: the tile it was on becomes safe, and the danger reappears on a fresh tile elsewhere on the board. So a tile that trapped you can be harmless when you return to it, and a tile that was safe can become dangerous — you can never learn the board's traps by heart. The type a trap deals is decided per player at the moment it springs, and **each player suffers any given trap type at most once per game**, so no player is hit by the same kind of trap twice.

**Hold**
The player loses their next turn. A visible indicator appears on their panel as a reminder. At the start of what would be their next turn, the hold resolves automatically and play passes on. If both players are simultaneously held, both skip a turn and the hold clears.

**Sorcery Theft**
The player must surrender one sorcery of their choice. A modal shows their current sorceries and prompts a selection. If the player holds no sorceries, no effect ("The thief finds nothing and retreats."). The surrendered sorcery is removed from the game — it does not transfer to the opponent.

**Pose Theft**
The player must surrender one acquired extra pose (secret technique) of their choice. A modal shows their extra poses and prompts a selection. If the player holds no extra poses, no 
effect ("The seal finds nothing to suppress."). Base poses cannot be stolen. The surrendered pose is removed from the game.

**Pose Lock**
One type of the player's standard base poses (three moves) is randomly selected and locked for their next battle only. The locked poses are visible in the pose selection screen but greyed out and unselectable. 
After the next battle resolves (win or lose), the lock lifts automatically. Extra poses are not affected — only standard base poses can be locked.

**Setback**
The player is immediately moved back 2–4 tiles (random). The destination tile's event does not trigger — the chip simply lands there and waits for the next turn. Always has an effect regardless of inventory or battle history.

**Battle Log Modifier**
Turns a battle victory into a defeat. If the player has no battles recorded in their log yet, no effect ("There is no history here to rewrite."). If the player has at least one recorded battle, find the most recent Victory entry and change it to Defeat in the log. If all recorded battles are already Defeats, no effect.
Note: when Combat Rating is implemented, it must be calculated dynamically from the current state of the battle log (total wins minus total defeats) rather than tracked as a running counter. This ensures the trap's log modification automatically reflects in the Combat Rating without any separate adjustment. For example: a player with 3 wins and 0 defeats has Combat Rating +3. After the trap turns one win into a defeat, the log shows 2 wins and 1 defeat, so Combat Rating recalculates to +1. If that player then reaches the final duel with this record, their dice modifier is +1 (positive, still an advantage) — the trap hurt them but did not erase all their progress.

**Rival's Tribute**
When a player lands on a trap tile, the game selects a trap type randomly from a valid pool. Rival's Tribute is only included in the pool if the landing player currently holds at least one sorcery or at least one acquired extra pose. If the landing player holds neither, Rival's Tribute is excluded from the pool entirely for this landing and another trap type is selected instead.This guarantees the trap tile always produces a meaningful effect and Rival's Tribute is never triggered when there is nothing to take.

When this trap is validly triggered, the game builds a combined pool of all sorceries and all acquired extra poses currently held by **the landing player**. The system automatically selects one item at random from this pool — neither player makes a choice. The selected item is immediately removed from the landing player's inventory and added to the other player's 
inventory. If an extra pose is transferred, it becomes available to the other player in all future battles (unless lossed later) and is no longer available to the landing player from that 
point forward (unless acquired again). Both player panels update immediately to reflect the change.

**Translation on transfer.** Character-exclusive items — the two weapons and all six extra poses — never cross to the other character as themselves. Each has an exact counterpart in the other character's set with identical mechanics, and the receiver gets *their own* version instead:

| Shaolin Master | | Ninja | Type / Height |
|---|---|---|---|
| Nunchaku | ↔ | Sword | dice tiebreaker: roll two, keep higher |
| Thunder Dragon | ↔ | Demon Claw | Strike / High |
| Ghost Walk | ↔ | Void Step | Strike / Mid |
| Steel Lotus | ↔ | Iron Shroud | Strike / Low |

So a Ninja who loses Demon Claw gives the Shaolin Master **Thunder Dragon** — same Strike, same High, different name and stance. Nothing about the mechanics changes; a fighter simply never performs the other character's technique. Ordinary sorceries have no counterpart and transfer unchanged.

**When the rival already holds it.** An item can only be taken if the rival does not already hold what they would receive — the counterpart for character-exclusive items, the item itself otherwise. Anything failing that test is excluded from the pool, and a different item is selected. If nothing in the landing player's inventory can move, Rival's Tribute is not offered at all and another trap type is chosen (see the eligibility rule above).

The modal announces: "The trap springs against you. Your [item name] passes into your rival's hands." displaying the item name and type clearly. Single Continue button closes 
the modal and re-enables Roll Dice for the next player's turn.

This trap is distinct from Sorcery Theft and Pose Theft, which remove the item from the game entirely. Rival's Tribute transfers it to the opponent instead.

### Balancing Constraints for Generation

Every generated board must satisfy all of the following:

**Fight tiles:**
- No two fight tiles adjacent to each other.
- No fight tile within 3 tiles of the start (tiles 1–3 are always normal).
- Fight tile ninja types are assigned at generation: ~45% Black, ~20% Fire, ~20% Shadow, ~10% Demon, remainder Black.
- The Demon Ninja tile is placed in the mid-second-half of the board (tiles 38–54), clearly past the halfway point.

**Item tiles:**
- Every row of the board must contain at least one item tile. No player can cross a whole row with nothing to find.

**Ladders:**
- Exactly 6 ladders: 2 forward-only (toward the duel tile), 2 backward-only (toward tile 1), and 2 two-way (usable in either direction).
- At least 1 ladder in the first half (tiles 1–32) and at least 1 in the second half (tiles 33–63).
- Tile 1 may never be a ladder.
- Each ladder's origin tile must be a normal tile
- Each ladder's destination tile must be a normal tile or an item tile - this is not prohibited.
- No ladder may land on a fight, trap, hole, or duel tile.
- No ladder may land on an adjacent tile — a ladder must span at least 2 tiles.
- There should be no more than 2 ladders in a given row.
- No two ladder tiles may sit on adjacent positions along the path.
- Ladder origins are confined to tiles 2–59.

**Holes:**
- No hole within 5 tiles of the start.
- No two holes on adjacent tiles.
- No hole within 2 tiles of a trap tile.
- At least one item tile or normal tile must exist between a hole's origin and its destination (so the skip always costs something).

**Traps:**
- At board generation, 6 trap types are randomly selected from the pool of 7 types: Hold, Sorcery Theft, Pose Theft, Setback, Battle Log Modifier, Pose Lock, and Rival's Tribute. (During play the tiles slide, and the live type is drawn per player on landing; this initial per-tile assignment only seeds the board.)
- No trap tile within 5 tiles of the start.
- No trap tile within 2 tiles of a fight tile or a hole tile.
- No two trap tiles adjacent to each other.
- No trap may precede the first item tile on the path. A player always has a chance to find something before anything can be taken from them.


**Duel Approach Zone (tiles 60–63):**
- Tiles 60–63 must all be normal tiles — no fights, no traps, no ladders, no holes. Tiles 61–63 are the **Sacred Pagoda** (see below); once a player is admitted, the path to the duel tile is clear.

### Reaching the Duel

**Duel tile (64):** Any roll that would move a player to tile 64 or beyond lands them on tile 64 exactly. The excess is discarded. This applies to both players independently.

The first player to land on tile 64 triggers the Ultimate Duel immediately — the second player does not need to reach tile 64. The duel decides the game outright.

### The Sacred Pagoda (gate before the duel)

Tiles 61–63 are the **Sacred Pagoda** — the gated approach to the duel. The first time a player's move carries them into the pagoda (crossing to tile ≥ 61), a gate appears before they may go on to tile 64:

- **Holding the Sacred Master Key** — the gate opens at the player's touch. They may **enter at once**, or, if curious, take the 3-question trial first **for honor** — either way the gate opens, even if all three are answered wrong. (A player who has collected **three picklocks** first watches them fuse into the Master Key, then is offered the same choice.)
- **Without the key** — the pagoda poses a **trial of 3 multiple-choice questions**. The player answers all three, then sees which were right, the correct answers, and short explanations. A **Kids / Adults toggle** on the modal chooses the difficulty band (kids ≈ ages 10–12; adults = harder general knowledge). The band may be switched while still on the first question — both bands' questions are held, so toggling shows the same set each way — and **locks once the player advances past question one**; the choice is remembered for the game.
  - The number that must be correct is **3 minus the picklocks held** (so 3 with none, 2 with one, 1 with two).
  - **Pass** → the player earns the Master Key (any picklocks complete into it) and is admitted.
  - **Fail** → the player is swept back to **tile 40**, whose event then resolves; they may try again with fresh questions the next time they reach the pagoda.
- Only the arriving player needs admission — the opponent is drawn into the duel without a key.

Because the trial is always available, admission can always be earned; the pagoda can never dead-end a game.

**The Sacred Master Key** is obtained three ways: found as an uncommon item during the board phase, forged from **three picklocks** when the holder reaches the pagoda, or earned by passing the pagoda's trial. It is kept for the session and **cannot be lost** to any trap.

**Picklocks** are found opportunistically — a sudden, random stroke of luck that can happen on any turn, whatever that turn held (an ordinary move, a fight, a trap, a fall, an item find, or nothing at all). They are not tied to any particular tile or event, and never appear on ordinary item tiles. Each turn a player has a small chance to stumble on one. A player may hold up to three. They are **not** combined on the board; the third is forged into the Master Key only when the player reaches the pagoda. A picklock cannot be taken by Sorcery Theft (it never simply vanishes), but one can be handed to the opponent by Rival's Tribute — and only if that opponent can still use it (they hold fewer than three and no key). A picklock lost this way can be earned again later.

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
- After a trap springs it relocates: that tile becomes safe and a new trap tile appears elsewhere (never on a fight, hole, item, ladder, or pagoda tile, and never right beside another trap). It usually slides to a tile **ahead** of the player who triggered it — a trap that skitters forward keeps threatening, rather than being left behind on tiles already passed — though a minority resettle anywhere. The board therefore always holds six live traps, but which tiles they are drifts throughout the game. Re-landing on a tile you already sprung does nothing — the danger has moved on.

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

### Duel Tile Modal

Opens with a cinematic frame showing the two fighters at the path's end: "The path ends here. The ultimate duel begins." A single button starts the Ultimate Duel between the two players (Shaolin Master vs Ninja). Full rules in Win Conditions.

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

### Battle Resolution

Both players choose a pose secretly, then reveal simultaneously. The outcome is determined by type and height as follows.

In intermediate fights the opponent is the computer, so the player simply picks. In the Ultimate Duel both sides are human on one shared screen — see Ultimate Duel Turn Order for how secrecy is preserved.

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
Both sides roll one die. Higher roll wins the round. On equal rolls: re-roll until one side wins. A player holding the Sword or Nunchaku rolls two dice and keeps the higher; in the Ultimate Duel the Combat Rating modifier is then added to the result.

**Winning a battle:**
**Intermediate fights:** first to win 2 rounds. **Ultimate Duel:** first to win 3 rounds. No fixed round limit in either case — play continues until one side reaches the target.

### Ultimate Duel Turn Order

The duel is played by two humans sharing one screen, so pose choices are made one at a time with the device passed between them.

**Order of play within a round:**
1. The first chooser picks their pose. Their choice is committed and hidden.
2. A "pass the device" screen appears.
3. The second chooser picks their pose.
4. Both poses reveal simultaneously and the round resolves.

The handoff screen appears between the two picks of every round. It does not appear before the first pick of round 1 — players hand the device over themselves at the start.

**Who chooses first:** the Shaolin Master, always — regardless of which player reached tile 64 and triggered the duel.

**Oracle's Eye reorders the round.** The Eye reveals the opponent's chosen pose, which only means anything if the opponent has already committed. So in the duel, a player holding Oracle's Eye picks **second**:

- Only the Shaolin Master holds it → **order flips**: the Ninja picks first, the Shaolin Master second.
- Only the Ninja holds it → order is unchanged; the Ninja already picks second.
- **Both players hold it** → the two Eyes cancel. Both are spent, neither player sees anything, and the round proceeds with standard order. A modal announces this before the round begins.
- Neither holds it → standard order.

The reorder is recomputed at the start of every round, so it follows the Eye as it is spent, stolen, or transferred mid-duel.

### Ninja Types and Computer Behaviour

The computer controls all intermediate fight-tile encounters. It picks a pose type based on weighted probability per ninja type, then selects a random height within that type.

| Ninja Type | Strike % | Block % | Dodge % | Special behaviour |
|---|---|---|---|---|
| Black Ninja | 33 | 33 | 34 | None. Balanced and predictable. |
| Fire Ninja | 60 | 20 | 20 | Relentless. Punishes hesitation. |
| Shadow Ninja | 20 | 20 | 60 | Evasive. Hard to anticipate. |
| Demon Ninja | 34 | 33 | 33 | 15% chance to use one of the three extra ninja poses (Demon Claw, Void Step, or Iron Shroud) instead of a base pose — introducing a Strike at an unexpected height. |

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

---

## Secret Techniques (Extra Poses)

Three secret techniques are hidden in the game and found by luck on item tiles. They are rarer than sorceries and differ in how often they turn up: on each item find, Ghost Walk / Void Step drops **10%** of the time, Thunder Dragon / Demon Claw **6%**, and Steel Lotus / Iron Shroud **4%** — anything else is a sorcery. Every character has their own set of three, and all of them are Strikes:

| Shaolin Master | Ninja | Height |
|---|---|---|
| Ghost Walk | Void Step | Mid |
| Thunder Dragon | Demon Claw | High |
| Steel Lotus | Iron Shroud | Low |

A secret technique is selected during pose selection like any other pose, and **its chance of winning a round is identical to an ordinary strike of the same height** — what differs is the consequence of the round. A technique can be lost to the Pose Theft and Rival's Tribute traps, and Thunder Dragon is also lost when it fails (see below). A lost technique returns to the pool: it can be found again on a later item tile, or received via Rival's Tribute. Nothing carries between games.

### In a fight on the board

Playing a secret technique triggers **sudden death**: whoever wins that round wins the whole fight, whatever the score was. A technique can therefore be used at most once per fight.

| Technique | If you win the round | If you lose the round | Use it when | Never use it when | At an equal score (0–0 or 1–1) |
|---|---|---|---|---|---|
| **Ghost Walk** / Void Step | Fight won. Battle log records **one victory** (+1 rating). Your next fight starts **1–0 in your favour**. | Fight lost. Battle log records **one defeat** (−1 rating). Your next fight starts **0–1 against you**. | You are behind **0–1**, with fight tiles still ahead. | You are ahead **1–0**. | An even bet — only the next-fight head start is at stake. At **1–1**, your last chance to use it this fight. |
| **Thunder Dragon** / Demon Claw | Fight won. Battle log records **two victories** (+2 rating). | Fight lost. Battle log records **one defeat** (−1 rating), and the technique is **destroyed** — it returns to the pool and can be found again. | You are behind **0–1**. | You are ahead **1–0**. | Risks the technique for one extra rating point; usually better kept for **0–1**. Last chance at **1–1**. |
| **Steel Lotus** / Iron Shroud | Fight won. Battle log records **two victories** (+2 rating). | Fight lost. Battle log records **two defeats** (−2 rating). | You are behind **0–1**; best of all when your Combat Rating is **−3 or lower**. | You are ahead **1–0**, or your Combat Rating is **+3 or higher**. | An even bet with a doubled rating swing — your rating decides. Last chance at **1–1**. |

### In the Ultimate Duel

The duel is won by the first player to take 3 rounds. There is no sudden death, and a technique may be played every round for as long as you hold it — the only limit is that Thunder Dragon is destroyed the moment it loses a round. The duel is not recorded in the battle log, and each player's Combat Rating dice bonus is fixed when the duel begins.

| Technique | If you win the round | If you lose the round | Use it when | Never use it when | At an equal score (0–0, 1–1 or 2–2) |
|---|---|---|---|---|---|
| **Ghost Walk** / Void Step | **1 round** to you, and **+1 on your next dice-decided round**. | **1 round** to your opponent, and **+1 to them on their next dice-decided round**. | You are **behind**. | You are **ahead**. | Only the dice bonus is at stake, going to whoever wins the round. At **2–2** it does nothing. |
| **Thunder Dragon** / Demon Claw | **2 rounds** to you. | **1 round** to your opponent, and the technique is **destroyed**. | You are **behind** — and before Steel Lotus, since a loss concedes only 1 round. | You are **ahead**. | Gains 2 rounds but concedes only 1, while risking the technique. An ordinary pose at **2–2**. |
| **Steel Lotus** / Iron Shroud | **2 rounds** to you. | **2 rounds** to your opponent. | You are **behind 0–2 or 1–2** — the largest swing available. | You are **ahead**. | 2 rounds either way. An ordinary pose at **2–2**. |

**The dice bonus from Ghost Walk**

- It waits for the next round actually decided by dice, however many rounds away, and applies to re-rolls too.
- It is added on top of the Combat Rating modifier and works alongside the Sword or Nunchaku.
- It does not stack: winning again with Ghost Walk refreshes it rather than increasing it. Each player carries their own, so two pending bonuses landing on the same dice round cancel out.

**When both players play a technique in the same duel round**

Neither is cancelled. Each technique resolves its own owner's consequence, and the round is worth the larger of the two awards. A Ghost Walk played into a Demon Claw still grants the round winner their dice bonus and still destroys the Demon Claw if its owner lost.

**Head start**

Ghost Walk's 1–0 head start applies to your next board fight, is shown on your player panel beforehand, and does not stack. It has no effect in the duel.

**Rival's Tribute**

A technique taken by Rival's Tribute becomes the receiving character's matching version: Ghost Walk ↔ Void Step, Thunder Dragon ↔ Demon Claw, Steel Lotus ↔ Iron Shroud.

---

## Combat Rating

Each player has a Combat Rating tracking their performance across intermediate fights. It starts at 0 and is **derived dynamically from the battle log** (total wins minus total defeats), never tracked as a running counter. It applies as a dice modifier during the Ultimate Duel only — it has no effect on intermediate fights.

### How It Changes

- **Win an intermediate fight:** +1
- **Lose an intermediate fight:** −1
- **Skip a fight (Mantle of Mist):** no change — skipping is neutral
- **The Ultimate Duel itself:** does not affect the Combat Rating

The rating has no floor or ceiling — it can go negative if losses outweigh wins.

### Effect on the Ultimate Duel

The Combat Rating applies as a dice modifier to all dice-roll situations during the Ultimate Duel (see Battle Resolution for when dice are used):

| Combat Rating | Dice modifier in the duel |
|---|---|
| +3 or higher | +2 to your die roll |
| +1 or +2 | +1 to your die roll |
| 0 | no modifier |
| −1 or −2 | −1 to your die roll |
| −3 or lower | −2 to your die roll |

A +2 modifier in the duel is a meaningful edge in any dice situation. A −2 modifier makes the duel significantly harder. Because the rating is derived from the battle log, the Battle Log Modifier trap automatically reflects in it with no separate adjustment.

### Display

Each player's Combat Rating is always visible on their player panel. It updates immediately after each fight result is shown.

---

## Sorceries

Sorceries and items are found on item tiles. They are a separate category from poses. Most are single-use and are spent (permanently removed from the player's inventory) the moment they are used, regardless of outcome. Two — the Sword and the Nunchaku — are **persistent weapons**: they are never spent, and can only be lost to the Sorcery Theft or Rival's Tribute traps. Multiple may be held simultaneously.

Finding a sorcery is luck-based. Sorceries are distributed across item tiles randomly individually per each player, from the pool of available sorceries. Players cannot acquire them on demand. Sorceries expire at the end of the session.

### Sorcery Types

### Mantle of Mist
**Type:** Board — triggered by the game, player decides to use or not.

When a player lands on a fight tile, before the fight modal opens, the game checks if the player holds this sorcery. If yes, the game asks: "You hold the Mantle of Mist. Slip past unseen?" The player chooses Yes or No. The player must see which enemy type they met. Yes spends the sorcery and skips the fight entirely — no battle occurs, no Combat Rating change, turn ends normally. No preserves the sorcery and the fight proceeds (fight modal opens). Cannot be used on the duel tile (tile 64).

Spent on use.

---

### Magic Compass
**Type:** Board — player initiates before rolling.

A "Use Sorcery" button is available at the start of the player's turn, before rolling the dice. When clicked, it opens a small window to pick from available sorceries of the type that can be used before making the move. Selecting Magic Compass from available options opens some controls where the player defines two things: direction (forward toward the duel tile, or backward toward tile 1) and exact distance (1, 2, or 3 tiles). The chip moves to that exact destination instead of rolling. The destination tile's event resolves normally. The player cannot choose a destination beyond tile 64 in the forward direction or below tile 1 in the backward direction.

Spent on use.

---

### Ancient Key
**Type:** Board — player initiates before rolling.

Works similarly to a ladder: the player jumps one full row up (backward) or down (forward) from their current position. Unlike ladders, this is not tied to a ladder tile — the player creates their own shortcut, and it can be used from any tile.

The "Use Sorcery" button is available at the start of the player's turn, before rolling the dice. This is when Ancient Key must be activated — before the roll, from the player's current standing position. The player selects direction (one row up or one row down). The chip jumps to the corresponding tile on the adjacent row, and that tile's event resolves normally.

Spent on use.

---

### Safety Rope
**Type:** Board — triggered by the game, player decides to use or not.

When a player lands on a hole tile, before the fall is executed, the game checks if the player holds this sorcery. If yes, the game asks: "You hold the Safety Rope. Anchor yourself and stay?" The player chooses Yes or No. Yes spends the sorcery and the player stays on the hole tile — no fall occurs, turn ends normally. No preserves the sorcery and the fall proceeds as normal. A player may deliberately choose to fall even with the rope available.

Spent on use.

---

### Sixth Sense
**Type:** Protection — triggered by the game, player decides to use or not.

When a player lands on a trap tile, the trap type and its full effect are revealed to the player first — before anything is applied. The player reads what is about to happen. Only then does the game check if the player holds this sorcery and ask: "You sense the danger. Use Sixth Sense to block this trap?" The player makes an informed decision — they know exactly what they are blocking. Yes spends the sorcery and the trap is cancelled entirely. No preserves the sorcery and the trap resolves normally.

Spent on use.

---

### Magic Powder
**Type:** Combat — triggered by the game after a dice loss, player decides to use or not.

Magic Powder only applies when a battle round requires a dice roll (tied pose matchup situation). The dice roll happens naturally and visibly — both dice are shown. If the natural result favours the player, the round is won normally and the sorcery is not involved. If the natural result is a loss, the game pauses and — if the player holds Magic Powder — asks: "The dice went against you. Use Magic Powder to re-roll?" The player chooses Yes or No. Yes spends the sorcery and both dice are re-rolled. The new result stands — the player can still lose the re-roll. No preserves the sorcery and the original dice loss stands. If the player does not use it in time or chooses not to, the round is lost.

Spent on use.

---

### Sword / Nunchaku
**Type:** Combat — persistent, always active. No decision to make.

Two persistent weapons with an identical effect. While held, every dice tiebreaker in a battle round rolls two dice for that player and keeps the higher result. This applies automatically in every battle including the Ultimate Duel, and stacks with the Combat Rating modifier.

Each is character-exclusive: only the Ninja can discover the Sword, only the Shaolin Master can discover the Nunchaku. Each is globally unique — at most one of each exists per session — and neither can ever be held by the other character, since Rival's Tribute translates a weapon into the receiver's counterpart.

**Never spent.** Unlike every other item, a weapon is not consumed by use. It can only leave a player's inventory through the Sorcery Theft or Rival's Tribute traps.

---

### Oracle's Eye
**Type:** Combat — player initiates during pose selection.

During the pose selection phase of a battle round, before the player commits their own choice, a "Use Oracle's Eye" button is available (if held). Activating it reveals the enemy's chosen pose — type and height — before the player picks their own pose. The player then makes their choice with full knowledge of what they are facing. The enemy pose does not change after being revealed. Only applies to the current round.

Spent on use.

---

### Iron Bell
**Type:** Combat — triggered by the game after a round loss, player decides to use or not.

After a battle round fully resolves as a loss for the player — poses revealed, result shown, defeat displayed — the game pauses and checks if the player holds this sorcery. If yes, the game asks: "This round was lost. Ring the Iron Bell and replay it?" The player sees the full round result before deciding. Yes spends the sorcery and the entire round is cancelled — both players return to pose selection and play the round again from scratch. The re-played round follows all normal rules and the player can lose it again. No preserves the sorcery and the loss stands. If the player does not use it or chooses not to, the round result is final.

Spent on use.

### Sorcery Balance Principles

- Single-use sorceries are spent on use and cannot be recovered except by finding them again on item tiles (subject to the exclusion rule for already-held sorceries). The persistent weapons are never spent.
- Sorceries range from highly situational (Safety Rope — only applicable on 3 hole tiles) to broadly applicable (Oracle's Eye — useful in any battle round). This is intentional. Not every find is equally powerful, and players cannot choose what they find.
- No sorcery guarantees a final victory. Individual rounds or board events can be influenced, but the overall game outcome remains uncertain.
- All sorceries are drawn from the same pool with equal probability, excluding sorceries the player already holds and excluding the two character-exclusive weapons, which only their own character can discover. There is no rarity weighting — luck determines what you find.

---

## Win Conditions

Goal: be the first to reach tile 64 and win the Ultimate Duel.

- The first player to reach tile 64 triggers the Ultimate Duel immediately — no waiting for the second player.
- The duel is between the two players (Shaolin Master vs Ninja), best of 3 round wins.
- Standard battle rules apply. All items, sorceries, and extra poses collected during the board phase carry into the duel.
- Each player's Combat Rating applies as a dice modifier throughout the duel (see Combat Rating).
- The duel winner wins the game. There is no rematch and no send-back — the game ends immediately with the closing story.

---

## Progression Within a Session

There is no explicit rank or level system. What changes during a game:

- **Combat Rating**: rises with fight wins, falls with losses. Directly affects Ultimate Duel dice rolls.
- **Extra poses acquired**: up to 3. Luck-based. Cannot be deliberately farmed. Can be lost via Pose Theft trap.
- **Sorceries held**: any combination, found by luck. Can be lost via Sorcery Theft trap.
- **Board position**: naturally progresses but can be affected by holes (forward skip), lost battles (tile setback), and the Hold trap (lost turn).

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
- Combat Rating change (+1 / −1)

A summary line at the top shows total wins and losses for each player, and the current Combat Rating. The log is session-only and resets with a new game.

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
- The player panel displays: board position, extra poses held, sorceries held, Combat Rating, and — once obtained — the Sacred Master Key and any picklocks.

---

## AI Narration (Planned — Not Yet Implemented)

*Status: no part of this section is implemented. There is no API key input, no settings panel, and no network calls in the current build. The design below is retained as the intended target.*

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
- *(Planned)* The AI API is called client-side using `fetch`. The API key is stored only in component state (not localStorage).
- All randomness uses `Math.random()`. No seeded RNG required.

---


