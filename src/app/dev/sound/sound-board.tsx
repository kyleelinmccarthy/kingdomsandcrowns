"use client";

/**
 * THE SOUND BOARD. Every sound in the 3D Realm on a button, with its waveform, length and level,
 * grouped the way the game uses them — plus the soundscape of each country and a few phrases of
 * the music. It plays through the game's own engine and Web Audio output, so what is heard here
 * is exactly what the Realm plays, voice pool, gate and mix included.
 *
 * Nothing is fetched: every sound is synthesised on this page, in the browser, from
 * `lib/realm3d/sound/recipes.ts`.
 */

import { useEffect, useRef, useState } from "react";
import { stats, waveformPeaks } from "@/lib/realm3d/sound/dsp";
import { onDemand, SoundEngine, type AudioOut, type SoundBuffer, type Timers } from "@/lib/realm3d/sound/engine";
import { composePhrase, renderPhrase } from "@/lib/realm3d/sound/music";
import { BEDS, DETAILS, ELEMENTS, FIXTURES, MOUNT_CALLS, MOUNT_FEET, MOUNT_SURFACES, renderSound, SURFACES, ZONES, type Element, type SoundId, type Zone } from "@/lib/realm3d/sound/recipes";
import { DEFAULT_SOUND } from "@/lib/realm3d/sound/settings";
import { createWebAudioOut } from "@/lib/realm3d/sound/web-audio";
import { workerSynth } from "@/lib/realm3d/sound/synth-client";

type Item = { id: SoundId; label: string; note?: string };
type Group = { title: string; blurb: string; items: Item[] };

const label = (id: string) => id.replace(/^(step|charge|release|fixture|amb|bed)-/, "").replace(/-/g, " ");

const GROUPS: Group[] = [
  { title: "Footsteps", blurb: "Off the stride phase: grass, the road and village lane, boards indoors, the great hall's flags, the shallows.", items: SURFACES.map((s) => ({ id: `step-${s}` as SoundId, label: s })) },
  { title: "The body", blurb: "A jump that took, and a landing after a real fall.", items: [{ id: "jump", label: "jump" }, { id: "land", label: "land" }] },
  { title: "Spells: the charge", blurb: "Swells for the cast time. The game starts a quick spell part-way in, so it lands on the peak.", items: ELEMENTS.map((e) => ({ id: `charge-${e}` as SoundId, label: e })) },
  { title: "Spells: the release", blurb: "The moment it leaves the hands.", items: ELEMENTS.map((e) => ({ id: `release-${e}` as SoundId, label: e })) },
  {
    title: "Troubles",
    blurb: "A hit, a clear (the reward), a blob's bounce, one noticed, a shield.",
    items: (["trouble-hit", "trouble-clear", "blob-bounce", "trouble-sighted", "trouble-shielded"] as const).map((id) => ({ id, label: id.replace("trouble-", "") })),
  },
  {
    title: "The village",
    blurb: "The E prompt, a villager greeted, a deed answered, a building rising a stage and finished.",
    items: (["prompt", "talk", "deed-right", "deed-wrong", "rise", "complete"] as const).map((id) => ({ id, label: id.replace("-", " ") })),
  },
  {
    title: "Doors and rooms",
    blurb: "In and out, and each room's one thing: the chapel bell, the mill lever, the throne…",
    items: [{ id: "door-in", label: "door in" }, { id: "door-out", label: "door out" }, ...FIXTURES.map((f) => ({ id: `fixture-${f}` as SoundId, label: f }))],
  },
  {
    title: "Menus and moments",
    blurb: "Button ticks, pause and resume, a refusal, a lesson done, the tutorial finished, a place found.",
    items: (["ui-click", "pause", "resume", "refuse", "lesson", "tutorial-done", "found"] as const).map((id) => ({ id, label: id.replace("-", " ") })),
  },
  {
    title: "Riding: feet",
    blurb: "A mount's footfall off its own gait, at a walk, and a gallop's three beats (ba-da-DUM). Hooves for the pony, donkey, goat and stag; padded feet for the direwolf, boar, gryphon and wyrm. The game plays them at the mount's own pitch.",
    items: MOUNT_FEET.flatMap((f) => MOUNT_SURFACES.flatMap((s) => [{ id: `${f}-${s}` as SoundId, label: `${f} ${s}` }, { id: `gallop-${f}-${s}` as SoundId, label: `gallop ${f} ${s}` }])),
  },
  {
    title: "Riding: moments",
    blurb: "Wings (the gryphon's and the wyrm's, in the air), the jump and the landing in the saddle, the mount called in with a puff, getting on and off, and fast travel's start, arrival and pulling up.",
    items: (["wingbeat", "mount-jump", "mount-land", "mount-summon", "mount-up", "mount-down", "travel-start", "travel-arrive", "travel-stop"] as const).map((id) => ({ id, label: id.replace("-", " ") })),
  },
  {
    title: "Mounts say hello",
    blurb: "A soft call as the child gets on: pony, donkey, goat, stag, boar, direwolf, gryphon, wyrm.",
    items: MOUNT_CALLS.map((c) => ({ id: `call-${c}` as SoundId, label: c })),
  },
  {
    title: "The big quiet moments",
    blurb: "The crown worn at the ceremony, the last minute on the clock, and the goodbye under \u201cWell played\u201d. Each steps the music right back while it plays.",
    items: (["crown", "last-minute", "farewell"] as const).map((id) => ({ id, label: id.replace("-", " ") })),
  },
  { title: "Ambience: now and then", blurb: "The little sounds each country scatters over its beds.", items: DETAILS.map((id) => ({ id, label: label(id) })) },
  { title: "Ambience: the beds", blurb: "Seamless loops. Each country plays two of different lengths at once.", items: BEDS.map((id) => ({ id, label: label(id), note: "loop" })) },
];

/** Every id the board shows, once. */
export const BOARD_SOUNDS: readonly SoundId[] = GROUPS.flatMap((g) => g.items.map((i) => i.id));

const browserTimers: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
  idle: (fn) => window.setTimeout(() => fn(12), 30),
};

/** The board's engine on the window, for the screenshot scripts (this page is dev-only anyway). */
function expose(engine: SoundEngine) {
  window.__realmSound = engine;
}

function Wave({ buf, color }: { buf: SoundBuffer | null; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext?.("2d");
    if (!c || !g || !buf) return;
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#1a1510";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,0.08)";
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    const { min, max } = waveformPeaks(buf.data, w);
    // Drawn against a fixed full scale of ±0.5, so loudness can be compared across the board.
    g.fillStyle = color;
    for (let x = 0; x < w; x++) {
      const y0 = h / 2 - (max[x] / 0.5) * (h / 2);
      const y1 = h / 2 - (min[x] / 0.5) * (h / 2);
      g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
    }
  }, [buf, color]);
  return <canvas ref={ref} width={260} height={52} className="block h-[52px] w-[260px] rounded" aria-hidden="true" />;
}

function describe(buf: SoundBuffer | null): string {
  if (!buf) return "…";
  const s = stats(buf.data, buf.rate);
  const db = s.peak > 0 ? (20 * Math.log10(s.peak)).toFixed(0) : "-∞";
  return `${s.seconds.toFixed(2)} s · peak ${db} dB`;
}

export function SoundBoard() {
  const [calm, setCalm] = useState(false);
  const [bufs, setBufs] = useState<Record<string, SoundBuffer>>({});
  const [phrases, setPhrases] = useState<SoundBuffer[]>([]);
  const [zone, setZone] = useState<Zone | null>(null);
  const [last, setLast] = useState<string>("");
  const [volume, setVolume] = useState(DEFAULT_SOUND.master);
  const audio = useRef<{ engine: SoundEngine; out: AudioOut | null } | null>(null);

  // Synthesise everything a few at a time, so the page draws while it works.
  useEffect(() => {
    let cancelled = false;
    const queue = [...BOARD_SOUNDS];
    const done: Record<string, SoundBuffer> = {};
    const work = () => {
      if (cancelled) return;
      for (let n = 0; n < 6 && queue.length; n++) {
        const id = queue.shift()!;
        done[id] = renderSound(id, { calm });
      }
      setBufs({ ...done });
      if (queue.length) window.setTimeout(work, 0);
      else setPhrases([1, 2, 3].map((seed) => renderPhrase(composePhrase(seed))));
    };
    work();
    return () => {
      cancelled = true;
    };
  }, [calm]);

  useEffect(() => () => audio.current?.engine.close(), []);

  /** The engine and the speakers, made on the first press (a browser will not allow sooner). */
  function ensure(): { engine: SoundEngine; out: AudioOut | null } {
    if (!audio.current) {
      const engine = new SoundEngine({ settings: { ...DEFAULT_SOUND, master: volume, music: 80 }, enabled: true, calm, paused: false, speaking: false }, browserTimers, undefined, workerSynth() ?? undefined);
      // The board plays everything, so it wants the sounds a visit makes only on demand too.
      engine.want(BOARD_SOUNDS.filter(onDemand));
      const out = createWebAudioOut();
      if (out) engine.attach(out);
      audio.current = { engine, out };
      expose(engine);
    }
    return audio.current;
  }

  function play(id: SoundId) {
    const { engine } = ensure();
    setLast(id);
    if (id.startsWith("bed-")) {
      // A bed is a loop: hear it on its own for a few seconds on an ambience voice.
      engine.play(id);
      return;
    }
    const element = id.startsWith("charge-") ? (id.slice(7) as Element) : null;
    if (element) engine.cast(element, 800);
    // The big moments play as the game plays them: with the music stepped back under them.
    else if (id === "crown" || id === "last-minute" || id === "farewell") engine.moment(id, { duck: true, wait: 5 });
    else if (onDemand(id)) engine.moment(id, { wait: 5 });
    else engine.play(id);
  }

  function playPhrase(i: number) {
    const { out } = ensure();
    const buf = phrases[i];
    if (!out || !buf) return;
    setLast(`music ${i + 1}`);
    out.play("music", 0, buf, out.now() + 0.02, 1, 0, 1, false, 0);
  }

  function scape(z: Zone | null) {
    const { engine } = ensure();
    setZone(z);
    if (z) engine.setZone(z);
    else engine.setMix({ settings: { ...DEFAULT_SOUND, master: volume, muted: true } });
    if (z) engine.setMix({ settings: { ...DEFAULT_SOUND, master: volume, music: 80, muted: false } });
  }

  function toggleCalm() {
    const next = !calm;
    setCalm(next);
    audio.current?.engine.setMix({ calm: next });
  }

  const colour = calm ? "#8fb7d9" : "#f0c25a";

  return (
    <div className="min-h-screen bg-[#0f0c09] p-6 text-[#f3e6c9]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">The Realm&apos;s sound board</h1>
          <p className="max-w-2xl text-sm text-[#cdb88f]">
            Every sound the 3D Realm makes, synthesised in the browser from code. Press one to hear it through the game&apos;s own engine. Waveforms are drawn to a
            fixed scale, so their sizes compare.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Volume
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                audio.current?.engine.setMix({ settings: { ...DEFAULT_SOUND, master: v, music: 80 } });
              }}
            />
            <span className="w-8 tabular-nums">{volume}</span>
          </label>
          <button type="button" aria-pressed={calm} onClick={toggleCalm} className="rounded border border-[#6b4a2a] px-3 py-1 font-semibold aria-pressed:bg-[#3b5a78]">
            Calm mode {calm ? "on" : "off"}
          </button>
          <span className="text-[#cdb88f]" aria-live="polite">
            {last ? `Playing: ${last}` : "Nothing played yet"}
          </span>
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-bold">The soundscape, by country</h2>
        <p className="mb-3 text-sm text-[#cdb88f]">Two looping beds and the little sounds between them, as the game plays them. They cross-fade as you switch.</p>
        <div className="flex flex-wrap gap-2">
          {ZONES.map((z) => (
            <button key={z} type="button" aria-pressed={zone === z} onClick={() => scape(z)} className="rounded border border-[#6b4a2a] bg-[#2a1d12] px-3 py-1.5 font-semibold capitalize aria-pressed:bg-[#8a5a1c]">
              {z}
            </button>
          ))}
          <button type="button" onClick={() => scape(null)} className="rounded border border-[#6b4a2a] px-3 py-1.5 font-semibold">
            Silence
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-lg font-bold">The music</h2>
        <p className="mb-3 text-sm text-[#cdb88f]">A kalimba phrase over a soft bass, then most of a minute of quiet. Every appearance is a new phrase; here are three.</p>
        <div className="flex flex-wrap gap-4">
          {[0, 1, 2].map((i) => (
            <button key={i} type="button" onClick={() => playPhrase(i)} className="rounded-lg border border-[#6b4a2a] bg-[#1d150d] p-2 text-left hover:bg-[#2a1d12]">
              <span className="mb-1 block text-sm font-semibold">Phrase {i + 1}</span>
              <Wave buf={phrases[i] ?? null} color="#9fd49a" />
              <span className="mt-1 block text-xs text-[#cdb88f]">{describe(phrases[i] ?? null)}</span>
            </button>
          ))}
        </div>
      </section>

      {GROUPS.map((g) => (
        <section key={g.title} className="mb-8">
          <h2 className="mb-1 text-lg font-bold">{g.title}</h2>
          <p className="mb-3 text-sm text-[#cdb88f]">{g.blurb}</p>
          <div className="flex flex-wrap gap-4">
            {g.items.map((it) => (
              <button
                key={it.id}
                type="button"
                data-sound={it.id}
                onClick={() => play(it.id)}
                className="rounded-lg border border-[#6b4a2a] bg-[#1d150d] p-2 text-left hover:bg-[#2a1d12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0c25a]"
              >
                <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold capitalize">
                  {it.label}
                  <span className="font-mono text-[10px] font-normal normal-case text-[#9c8763]">{it.id}</span>
                </span>
                <Wave buf={bufs[it.id] ?? null} color={colour} />
                <span className="mt-1 block text-xs text-[#cdb88f]">{describe(bufs[it.id] ?? null)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
