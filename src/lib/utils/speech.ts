export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

type SpeakingListener = (speaking: boolean) => void;
const listeners = new Set<SpeakingListener>();
let current: SpeechSynthesisUtterance | null = null;

function tell(speaking: boolean) {
  for (const l of listeners) l(speaking);
}

/**
 * Hears read-aloud start and stop. The Realm's sound listens, so the music and the world duck
 * under a question being read and come back up after it. Returns the unsubscribe.
 */
export function onSpeaking(listener: SpeakingListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
  const u = new SpeechSynthesisUtterance(text);
  current = u;
  if (listeners.size > 0) {
    // Ducked from the moment it is asked for, not from when the voice starts: the first word is
    // the one a child most needs to hear. Only the latest line un-ducks: the `cancel` above ends
    // the previous one, and its late "interrupted" must not bring the music up under this one.
    tell(true);
    const done = () => {
      if (current === u) {
        current = null;
        tell(false);
      }
    };
    u.onend = done;
    u.onerror = done;
  }
  window.speechSynthesis.speak(u);
}
