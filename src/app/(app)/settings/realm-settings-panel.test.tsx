import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RealmSettingsPanel } from "./realm-settings-panel";
import { DEFAULT_REALM_SETTINGS } from "@/lib/utils/realm-settings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const updateRealmSettings = vi.fn().mockResolvedValue(undefined);
const resetRealmHelp = vi.fn();
vi.mock("@/lib/actions/realm-settings", () => ({
  updateRealmSettings: (...a: unknown[]) => updateRealmSettings(...a),
  resetRealmHelp: (...a: unknown[]) => resetRealmHelp(...a),
}));
const grantRealmMinutes = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/realm-play", () => ({
  grantRealmMinutes: (...a: unknown[]) => grantRealmMinutes(...a),
}));

const summary = { date: "2026-09-02", balance: 10, spent: 5 };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("RealmSettingsPanel", () => {
  it("hides minutes-per-quest in scheduled mode", () => {
    render(<RealmSettingsPanel childId="c1" settings={{ ...DEFAULT_REALM_SETTINGS, accessMode: "scheduled" }} summary={summary} />);
    expect(screen.queryByLabelText(/minutes per quest/i)).not.toBeInTheDocument();
  });

  it("shows minutes-per-quest in earned mode and saves a mode change", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByLabelText(/minutes per quest/i)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /both/i }));
    expect(updateRealmSettings).toHaveBeenCalledWith("c1", { accessMode: "both" });
  });

  it("grants minutes for today", async () => {
    const user = userEvent.setup();
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    await user.click(screen.getByRole("button", { name: /grant 15/i }));
    expect(grantRealmMinutes).toHaveBeenCalledWith("c1", "2026-09-02", 15);
  });

  it("shows today's balance and spent minutes", () => {
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    expect(screen.getByText(/10 minutes banked/i)).toBeInTheDocument();
    expect(screen.getByText(/5 of 30 played/i)).toBeInTheDocument();
  });

  it("lets a parent show the how-to-play card again", async () => {
    resetRealmHelp.mockResolvedValue(undefined);
    render(<RealmSettingsPanel childId="c1" settings={DEFAULT_REALM_SETTINGS} summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the how-to-play card again" }));
    await waitFor(() => expect(resetRealmHelp).toHaveBeenCalledWith("c1"));
  });
});
