export const EXPERIENCE_PROBE = [
  "What do you believe your current goal is?",
  "Where do you think you are?",
  "What do you think is dangerous here?",
  "What do you expect to happen next?",
  "What mechanics do you think you understand?",
  "Which party abilities do you currently value?",
  "Which abilities have you mostly ignored, and why?",
  "How engaged are you right now, 1–10?",
  "How confused are you right now, 1–10?",
  "Would you voluntarily keep playing right now?",
  "What was the last memorable thing that happened?",
  "What has become repetitive?",
].join("\n");

export const MENTAL_MAP_PROBE =
  "Without opening the game map, describe how the last several rooms or corridors connect, where you think major landmarks are, and which direction you think progression lies.";

export interface ProbeConfig {
  everyActions: number;
  onFirstCombat: boolean;
  onFloorChange: boolean;
  onWipe: boolean;
}

export const DEFAULT_PROBE_CONFIG: ProbeConfig = {
  everyActions: 40,
  onFirstCombat: true,
  onFloorChange: true,
  onWipe: true,
};
