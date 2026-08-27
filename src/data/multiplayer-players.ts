import { THEMES } from "@/data/themes";

// Mock roster for the multiplayer UI — there is no realtime backend yet, so
// this stands in for the player list a websocket/session service would send.
// Colors are pulled from the real accent-theme set so a player's identity
// color always matches something already in the app's palette.
export type MultiplayerPlayer = {
  id: string;
  name: string;
  initial: string;
  color: string;
  isYou?: boolean;
};

export const YOU: MultiplayerPlayer = { id: "you", name: "You", initial: "R", color: "var(--signal)", isYou: true };

export const MOCK_OPPONENTS: MultiplayerPlayer[] = [
  { id: "priya", name: "Priya", initial: "P", color: THEMES[0].from },
  { id: "marcus", name: "Marcus", initial: "M", color: THEMES[1].from },
  { id: "elena", name: "Elena", initial: "E", color: THEMES[2].from },
  { id: "devon", name: "Devon", initial: "D", color: THEMES[3].from },
  { id: "sana", name: "Sana", initial: "S", color: THEMES[4].from },
];

export const ALL_MOCK_PLAYERS: MultiplayerPlayer[] = [YOU, ...MOCK_OPPONENTS];

export const ROOM_CAP = 8;
export const MIN_PLAYERS_TO_START = 5;
