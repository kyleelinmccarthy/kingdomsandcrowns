import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { onSpeaking, speak, stopSpeaking } from "./speech";

type Utter = { text: string; onend: (() => void) | null; onerror: (() => void) | null };

let spoken: Utter[];
let cancels: number;
beforeEach(() => {
  spoken = [];
  cancels = 0;
  const synth = {
    cancel: () => void cancels++,
    speak: (u: Utter) => spoken.push(u),
  };
  (window as unknown as { speechSynthesis: unknown }).speechSynthesis = synth;
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: Utter, text: string) {
    this.text = text;
    this.onend = null;
    this.onerror = null;
  };
});
afterEach(() => {
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});

describe("read-aloud tells the Realm's sound when it speaks", () => {
  it("says speaking the moment a line is asked for, and quiet when it ends", () => {
    const heard: boolean[] = [];
    const off = onSpeaking((s) => heard.push(s));
    speak("How many apples?");
    expect(heard).toEqual([true]);
    spoken[0].onend!();
    expect(heard).toEqual([true, false]);
    off();
  });

  it("does not bring the music up under a new line when the old one is interrupted", () => {
    const heard: boolean[] = [];
    const off = onSpeaking((s) => heard.push(s));
    speak("First.");
    speak("Second.");
    // The first line's late "interrupted" arrives after the second has started.
    spoken[0].onerror!();
    expect(heard[heard.length - 1]).toBe(true);
    spoken[1].onend!();
    expect(heard[heard.length - 1]).toBe(false);
    off();
  });

  it("still reads aloud with nobody listening", () => {
    speak("Hello.");
    expect(spoken.map((u) => u.text)).toEqual(["Hello."]);
  });
});

describe("stopping only your own line", () => {
  it("stops the caller's line while it is still the one being spoken", () => {
    const mine = speak("What is two plus three?");
    const before = cancels;
    stopSpeaking(mine);
    expect(cancels).toBe(before + 1);
  });

  it("leaves a newer line alone: a closing board must not cut off 'The Village Well is rising!'", () => {
    const mine = speak("What is two plus three?");
    speak("The Village Well is rising!");
    const before = cancels;
    stopSpeaking(mine);
    stopSpeaking(null);
    expect(cancels).toBe(before);
  });
});
