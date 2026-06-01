// Default introduction text, shown on the game-start screen before the user
// begins a new game. Edit freely — paragraphs are separated by a blank line
// and rendered as separate paragraphs in the start screen. Plain text only.
//
// When the user later connects their own LLM via game settings, the start
// screen will show an LLM-generated intro instead of this default. This
// remains the fallback whenever no LLM is configured.

export const DEFAULT_GAME_START_STORY = `In an age of ancient rivalries, two legendary warriors stand opposed: the disciplined Shaolin Master and the elusive Ninja Warrior. Across a perilous path of fortune and fate, every step may bring swift progress or unexpected setbacks. Climb toward glory, overcome the trials ahead, and outmaneuver your rival in a journey inspired by classic martial arts tales. Only one warrior will reach the end of the path and earn a place in legend.`;

export function getGameStartStory(llmStory = null) {
  if (llmStory && typeof llmStory === "string" && llmStory.trim()) {
    return llmStory;
  }
  return DEFAULT_GAME_START_STORY;
}
