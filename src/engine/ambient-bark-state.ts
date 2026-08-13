let activeSpeakerId: string | null = null;
let activeUntil = 0;

export function setAmbientSpeaker(id: string | null, untilMs = 0): void {
  activeSpeakerId = id;
  activeUntil = untilMs;
}

export function isAmbientSpeakerActive(id: string, nowMs: number): boolean {
  return activeSpeakerId === id && nowMs < activeUntil;
}
