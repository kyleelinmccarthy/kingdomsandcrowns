import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOUND } from "@/lib/realm3d/sound/settings";
import { makeSoundStore } from "@/lib/realm3d/sound/store";
import { PauseMenu } from "./frame-hud";
import { SoundControls } from "./realm-sound";

vi.mock("@/lib/actions/realm-sound", () => ({ saveRealmSound: vi.fn(async () => {}) }));

afterEach(cleanup);

const noSettings = { depth: null, onDepth: null, depthError: "", tone: null, onTone: null, toneError: "", calm: false };

describe("the pause menu's sound controls", () => {
  it("sit in the pause menu with a mute and three sliders", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    render(
      <PauseMenu
        heroName="Emma"
        viewer="child"
        onResume={() => {}}
        onControls={() => {}}
        leaveHref="/tavern"
        settings={noSettings}
        sound={<SoundControls store={store} enabled calm={false} viewer="child" heroName="Emma" />}
      />,
    );
    expect(screen.getByRole("group", { name: "Sound" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue(String(DEFAULT_SOUND.master));
    expect(screen.getByRole("slider", { name: "Effects" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Music" })).toBeInTheDocument();
  });

  it("changes the settings as the sliders move, and mutes", () => {
    const changed = vi.fn();
    const store = makeSoundStore(DEFAULT_SOUND, changed);
    render(<SoundControls store={store} enabled calm={false} viewer="child" heroName="Emma" />);
    fireEvent.change(screen.getByRole("slider", { name: "Music" }), { target: { value: "20" } });
    expect(store.get().music).toBe(20);
    expect(screen.getByRole("slider", { name: "Music" })).toHaveValue("20");
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(store.get().muted).toBe(true);
    expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("slider", { name: "Volume" })).toBeDisabled();
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("offers no music slider to move in calm mode, and says why", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    render(<SoundControls store={store} enabled calm viewer="child" heroName="Emma" />);
    expect(screen.getByRole("slider", { name: "Music" })).toBeDisabled();
    expect(screen.getByText(/no music/i)).toBeInTheDocument();
  });

  it("says so, instead of offering dead controls, when a grown-up switched sound off", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    render(<SoundControls store={store} enabled={false} calm={false} viewer="child" heroName="Emma" />);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByText(/grown-up can turn it on/i)).toBeInTheDocument();
  });

  it("tells a visiting grown-up the settings are their own", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    render(<SoundControls store={store} enabled calm={false} viewer="parent" heroName="Emma" />);
    expect(screen.getByText(/just for you/i)).toBeInTheDocument();
  });

  it("shows a failed save", () => {
    const store = makeSoundStore(DEFAULT_SOUND, () => {});
    render(<SoundControls store={store} enabled calm={false} viewer="child" heroName="Emma" />);
    act(() => store.setError("That didn't save. Try again."));
    expect(screen.getByText("That didn't save. Try again.")).toBeInTheDocument();
  });
});
