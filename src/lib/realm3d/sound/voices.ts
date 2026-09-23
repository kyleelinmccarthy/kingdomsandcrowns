/**
 * THE VOICE POOL: a fixed number of playback slots, handed out without allocating.
 *
 * Each voice in the browser is a gain and a panner that live for the whole visit (`web-audio.ts`);
 * this is the bookkeeping for which one is free. When every voice is busy a new sound may take
 * the oldest voice of the same or lower priority, never a higher one — so a flurry of footsteps
 * can never cut short a building finishing — and a sound with nowhere to go is simply not played.
 *
 * Plus the gate: the least time between two of the same sound, and the most of one sound at
 * once, so a beam that clears three troubles in one frame is one chime, not three on top of each
 * other.
 */

export type Voice = {
  /** The sound it is playing, or "" when it has never played. */
  id: string;
  priority: number;
  startedAt: number;
  /** When it finishes, on the audio clock; a voice past this is free. */
  endsAt: number;
};

export type VoicePool = { voices: Voice[] };

export function makePool(size: number): VoicePool {
  const voices: Voice[] = [];
  for (let i = 0; i < size; i++) voices.push({ id: "", priority: 0, startedAt: -1, endsAt: -1 });
  return { voices };
}

export function busyCount(pool: VoicePool, now: number): number {
  let n = 0;
  for (const v of pool.voices) if (v.endsAt > now) n++;
  return n;
}

/** How many voices are playing this one sound right now. */
export function playingCount(pool: VoicePool, id: string, now: number): number {
  let n = 0;
  for (const v of pool.voices) if (v.id === id && v.endsAt > now) n++;
  return n;
}

/**
 * Picks a voice for a sound and marks it taken, or returns -1 to drop the sound. A free voice
 * first; failing that, the oldest busy one whose priority is no higher than this sound's.
 * `stolen` tells the caller it must fade the old sound out first.
 */
export function claimVoice(pool: VoicePool, id: string, priority: number, now: number, seconds: number): { index: number; stolen: boolean } {
  let free = -1;
  let victim = -1;
  let victimAt = Infinity;
  const vs = pool.voices;
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    if (v.endsAt <= now) {
      free = i;
      break;
    }
    if (v.priority <= priority && v.startedAt < victimAt) {
      victim = i;
      victimAt = v.startedAt;
    }
  }
  const index = free >= 0 ? free : victim;
  if (index < 0) return { index: -1, stolen: false };
  const v = vs[index];
  v.id = id;
  v.priority = priority;
  v.startedAt = now;
  v.endsAt = now + seconds;
  return { index, stolen: free < 0 };
}

/** A voice cut short (a charge that released, a sound stopped): it is free from `at`. */
export function endVoice(pool: VoicePool, index: number, at: number): void {
  const v = pool.voices[index];
  if (v && v.endsAt > at) v.endsAt = at;
}

/** Everything stops. */
export function clearPool(pool: VoicePool): void {
  for (const v of pool.voices) {
    v.id = "";
    v.endsAt = -1;
  }
}

/* ------------------------------------------------------------------ the gate */

export type Gate = { lastAt: Map<string, number> };

export function makeGate(): Gate {
  return { lastAt: new Map() };
}

/**
 * Whether a sound may play now: not within `gap` seconds of the last one of it, and not while
 * `max` of it are already sounding. Records the play when it says yes.
 */
export function admit(gate: Gate, pool: VoicePool, id: string, now: number, gap: number, max: number): boolean {
  const last = gate.lastAt.get(id);
  if (last !== undefined && now - last < gap) return false;
  if (playingCount(pool, id, now) >= max) return false;
  gate.lastAt.set(id, now);
  return true;
}
