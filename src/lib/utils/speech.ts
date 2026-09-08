export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

/** Reads `text` aloud, replacing anything still being spoken. A no-op where speech is unavailable. */
export function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
