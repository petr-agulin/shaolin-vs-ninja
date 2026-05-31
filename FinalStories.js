// Default end-of-game epilogues, shown in the final "Start New Game" modal
// after a Final Duel concludes. One per winner.
//
// You can freely edit the text below — paragraphs are separated by a blank
// line and rendered as separate paragraphs in the modal. Plain text only
// (no markdown / HTML).
//
// When the user later connects their own LLM via game settings, the modal
// will show an LLM-generated story instead of these defaults. These remain
// the fallback whenever no LLM is configured.

export const DEFAULT_FINAL_STORIES = {
  shaolin: `As the final echo of battle faded into the mountains, the Shaolin Master stood victorious. The shadows of the Ninja Clan scattered like leaves before an autumn storm, and a new chapter began.

Years passed. The Shaolin Monastery flourished. New fighting arts were forged from old traditions, and deeper wisdom was uncovered with every generation. Before long, its name became the highest symbol of martial mastery. The Master's teachings inspired a golden age, and techniques born within the monastery would endure for centuries.

Yet the Master spoke little of his victory. Instead, he taught patience, discipline, and harmony to a new generation.

When his hair turned silver and the seasons grew many, he vanished into the misty peaks. Some say he became one with the mountain itself. Yet on quiet nights, when the moon hangs above the temple, the elders still tell of the warrior whose wisdom shaped an age. In every ringing temple bell and every disciplined strike, his spirit lived on, guiding those who sought the endless path of perfection.`,

  ninja: `As the last sound of battle vanished into the darkness, the Ninja Warrior lowered his blade. The Ninja Warrior emerged victorious, and the path ahead belonged to him alone.

Years passed. The Ninja Clan remained hidden from the world, known more through whispers than by sight. Its secret strongholds were said to lie beyond mist-covered forests and forgotten mountain paths. There, new arts of stealth, strategy, and silent combat were perfected, and the clan's influence spread farther than any outsider could measure.

Yet the Ninja Warrior walked his own path. He accepted only causes he believed worthy, and no challenge placed before him remained unconquered for long. His name became a legend carried by travelers, soldiers, and rulers alike—a warrior who needed no army and sought no glory.

As the years grew many, he vanished into the shadows from which he came. Some say he became one with the night itself. Yet when moonlight falls upon silent rooftops and the wind stirs the treetops, the elders still tell of the warrior whose mastery shaped an age. In every unseen step and every silent strike, his spirit lives on.`,
};

// Resolve the story to show given a winner ("shaolin" | "ninja") and an
// optional LLM-generated override. Once LLM integration lands, callers will
// pass `llmStory` when one was produced; otherwise the default is returned.
export function getFinalStory(winner, llmStory = null) {
  if (llmStory && typeof llmStory === "string" && llmStory.trim()) {
    return llmStory;
  }
  return DEFAULT_FINAL_STORIES[winner] || "";
}
