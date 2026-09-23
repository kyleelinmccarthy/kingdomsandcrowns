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
export function speak(text: string): SpeechToken | null {
  if (!canSpeak()) return null;
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
  return u;
}

/** What `speak` returns: the line it started, for `stopSpeaking`. */
export type SpeechToken = SpeechSynthesisUtterance;

/**
 * Stops read-aloud, but only if what is being spoken is still `token` — the line this caller
 * started. A panel that silences itself on the way out must not cut off whatever the next thing
 * on screen has just started saying ("The Village Well is rising!" is spoken in the same click
 * that closes the side quest's board, before the board's cleanup runs).
 */
export function stopSpeaking(token: SpeechToken | null) {
  if (!token || current !== token || !canSpeak()) return;
  window.speechSynthesis.cancel();
}
