export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

/**
 * Reads `text` aloud, replacing anything still being spoken. A no-op where speech is unavailable.
 *
 * Read-aloud is gated by `profile.readAloud` alone and never by `profile.soundEnabled`.
 * `readAloud` is an access feature; `soundEnabled` governs game sound, which is a
 * different channel. Nothing that mutes the game may be allowed to mute this call.
 */
export function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
