/// The crawlable copy on /sargam: the "about the game" section rendered under
/// the board, and the FAQ that section shows.
///
/// Lives here rather than inline in the section component because the FAQ is
/// rendered twice — once as visible markup, once as FAQPage JSON-LD — and the
/// two must say exactly the same thing (see the rule at the top of
/// src/lib/structured-data.ts). Everything numeric is derived from the live
/// Game row, so retuning the ladder in admin can't leave this copy lying.
///
/// Claims kept out on purpose: multiplayer rooms and the daily challenge are
/// both behind "Soon" in the game menu, so they are only ever described as
/// coming, never as playable.

/// Rounds a guest can play before the "Keep this run" gate asks them to sign
/// up. Shared with the board so the FAQ and the gate can't disagree.
export const FREE_GUEST_ROUNDS = 5;

export type SargamRules = {
  maxAttempts: number;
  /// Cumulative clip length in ms at each attempt.
  revealLadder: readonly number[];
};

export type FaqEntry = { question: string; answer: string };

/// "0.4 seconds", "15 seconds". One decimal at most, trailing zero dropped.
export function formatClipSeconds(ms: number): string {
  const seconds = Number((ms / 1000).toFixed(1));
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/// First and last rungs of the ladder, with a safe fallback for a
/// misconfigured (empty) row — the same defensive stance as describeLadder in
/// src/lib/structured-data.ts.
export function clipRange(rules: SargamRules): { first: string; last: string } {
  const first = rules.revealLadder.at(0);
  const last = rules.revealLadder.at(-1);
  return {
    first: first === undefined ? "a split second" : formatClipSeconds(first),
    last: last === undefined ? "a few seconds" : formatClipSeconds(last),
  };
}

export function sargamHowToPlay(rules: SargamRules): string[] {
  const { first, last } = clipRange(rules);
  return [
    `Press play. The first clip is only ${first} long, taken from the hook of the song.`,
    "Type a song title, artist or film and pick the match from the list.",
    `Wrong guess or skip? The clip gets longer, up to ${last}. You get ${rules.maxAttempts} attempts per song.`,
    "After two misses, a decade and genre clue appears when one is available.",
    "Guess with less audio to score higher, and keep your streak going song after song.",
  ];
}

export function sargamFaq(rules: SargamRules): FaqEntry[] {
  const { first, last } = clipRange(rules);
  return [
    {
      question: "What is Sargam?",
      answer: `Sargam is a free online song guessing game. You hear a tiny clip of a mystery song, starting at just ${first}, and try to name it in ${rules.maxAttempts} attempts. Each miss plays a longer clip, up to ${last}.`,
    },
    {
      question: "Is Sargam free to play?",
      answer: `Yes. Sargam is completely free and runs in your browser, with no app to install. You can play ${FREE_GUEST_ROUNDS} songs as a guest, then create a free account to keep playing and save your score, streak and history.`,
    },
    {
      question: "What kind of songs are in the game?",
      answer:
        "The catalog is mostly Bollywood and Hindi film songs. Pick the Old tape for classics from 1960 to 1999, the New tape for hits from 2000 to today, or All eras to mix everything.",
    },
    {
      question: "How is Sargam different from Heardle?",
      answer:
        "Like Heardle, Sargam gives you a short clip that grows with every wrong guess. Unlike Heardle, there is no one-song-a-day limit: you can keep playing song after song, choose an era, and chase a streak. You can also search by film name, not just song or artist.",
    },
    {
      question: "Can I play the song guessing game with friends?",
      answer:
        "Live multiplayer rooms, where friends race to guess the same song, are coming soon. A daily challenge, where everyone plays the same set of songs, is on the way too.",
    },
    {
      question: "Does it work on my phone?",
      answer:
        "Yes. Sargam works in any modern browser on phones, tablets and computers. You only need sound on.",
    },
  ];
}
