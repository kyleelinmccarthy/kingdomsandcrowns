import { notFound } from "next/navigation";
import { SoundBoard } from "./sound-board";

/**
 * Dev-only: every sound the 3D Realm makes, on a button, with its waveform drawn — the place to
 * audition the whole set at once. Like `/dev/content`, it does not exist in production, and the
 * gate is decided per request inside the component.
 */
export default function DevSoundPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SoundBoard />;
}
