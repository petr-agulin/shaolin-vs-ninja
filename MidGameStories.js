// Default mid-game narrative beats, shown once each during a session between
// the intro and the epilogue. Shared / board-wide: a beat appears once for the
// table, right before the next player's move, and never during a battle.
//
// Two beats exist today:
//   equator — always, the first time any player crosses the halfway point.
//   demon   — conditional, the first time any player defeats a Demon Ninja.
//
// Each beat has a fixed title and a small pool of body variants (one is chosen
// at random). Paragraphs are separated by a blank line. Plain text only.
//
// When the user later connects their own LLM via game settings, a beat may show
// LLM-generated text instead; these remain the fallback whenever none is
// configured. A future "destiny" beat (reaching the Sacred Pagoda key) will slot
// in here as the late-game beat.

export const MID_GAME_BEAT_TITLES = {
  equator: "Halfway Upon the Path",
  demon: "A Demon Falls",
};

export const MID_GAME_BEATS = {
  equator: [
    `The path has carried you past its midpoint, chosen one. Time flies — do not linger. Your destiny waits at the road's end, and it will not wait forever.`,
    `Halfway along the sacred road, the mountain wind carries a warning: hasten your steps. Fortune favours the swift of spirit.`,
    `The middle of the journey lies behind you now. The sun climbs higher, the shadows shift. Press on, chosen one — the final trial draws near.`,
  ],
  demon: [
    `A Demon of the Shadow Clan lies broken beneath the pale moon. Such foes do not fall easily — the clan will remember this, and the road ahead will test you harder still.`,
    `The forbidden techniques of the Demon Ninja could not save it. Its defeat echoes through the mountains, and darker trials stir in answer.`,
    `Where a Demon Ninja stood, only silence remains. You have proven your strength — yet the path is far from won.`,
  ],
};

// Returns { title, body } for a beat kind, or null if the kind is unknown.
// `llmBody` overrides the default body when LLM narration is configured later.
export function getMidGameBeat(kind, llmBody = null) {
  const title = MID_GAME_BEAT_TITLES[kind];
  if (!title) return null;
  if (llmBody && typeof llmBody === "string" && llmBody.trim()) {
    return { title, body: llmBody };
  }
  const pool = MID_GAME_BEATS[kind] || [];
  const body = pool[Math.floor(Math.random() * pool.length)] || "";
  return { title, body };
}
