import type { CardTrialState } from "../types";
import { resumeShuffleStream } from "../rng";

export function cloneFight(s: CardTrialState): CardTrialState {
  const rkState = s.streams["rat-king"].getState();
  const omState = s.streams["old-man"].getState();
  const draftState = s.draftStream.getState();
  const { streams: _streams, draftStream: _draftStream, ...rest } = s;
  const copy = structuredClone(rest) as CardTrialState;
  copy.streams = {
    "rat-king": resumeShuffleStream(rkState),
    "old-man": resumeShuffleStream(omState),
  };
  copy.draftStream = resumeShuffleStream(draftState);
  return copy;
}
