import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChildUpkeepToggle } from "./child-upkeep-toggle";

const setChildUpkeepApproval = vi.fn().mockResolvedValue(undefined);
const setChildUpkeepEnabled = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/actions/upkeep-settings", () => ({
  setChildUpkeepEnabled: (...a: unknown[]) => setChildUpkeepEnabled(...a),
  setChildUpkeepApproval: (...a: unknown[]) => setChildUpkeepApproval(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  setChildUpkeepApproval.mockClear();
  setChildUpkeepEnabled.mockClear();
});

function renderToggle(props: Partial<React.ComponentProps<typeof ChildUpkeepToggle>> = {}) {
  return render(
    <ChildUpkeepToggle
      childId="c1"
      enabled
      familyDisabled={false}
      requiresApproval={null}
      familyRequiresApproval={false}
      {...props}
    />
  );
}

describe("ChildUpkeepToggle", () => {
  it("renders nothing when the family switch is off", () => {
    const { container } = renderToggle({ familyDisabled: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("hides the confirmation control when this hero has Upkeep off", () => {
    // A confirmation setting is meaningless for a hero with no chores.
    renderToggle({ enabled: false });
    expect(screen.queryByLabelText(/confirmation/i)).not.toBeInTheDocument();
  });

  it("shows the confirmation control when this hero has Upkeep on", () => {
    renderToggle();
    expect(screen.getByLabelText(/confirmation/i)).toBeInTheDocument();
  });

  it("says what Inherit currently resolves to, so the choice is unambiguous", () => {
    renderToggle({ familyRequiresApproval: true });
    expect(screen.getByText(/currently always confirm/i)).toBeInTheDocument();
  });

  it("reflects the opposite family default in the Inherit copy", () => {
    renderToggle({ familyRequiresApproval: false });
    expect(screen.getByText(/currently no confirmation/i)).toBeInTheDocument();
  });

  it("selects Inherit when the hero has no override", () => {
    renderToggle({ requiresApproval: null });
    expect(screen.getByLabelText(/confirmation/i)).toHaveValue("inherit");
  });

  it("selects Always when the hero is overridden on", () => {
    renderToggle({ requiresApproval: true });
    expect(screen.getByLabelText(/confirmation/i)).toHaveValue("always");
  });

  it("selects Never when the hero is overridden off", () => {
    renderToggle({ requiresApproval: false });
    expect(screen.getByLabelText(/confirmation/i)).toHaveValue("never");
  });

  it("sends true when a parent picks Always", async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.selectOptions(screen.getByLabelText(/confirmation/i), "always");
    expect(setChildUpkeepApproval).toHaveBeenCalledWith("c1", true);
  });

  it("sends false when a parent picks Never", async () => {
    const user = userEvent.setup();
    renderToggle({ requiresApproval: true });
    await user.selectOptions(screen.getByLabelText(/confirmation/i), "never");
    expect(setChildUpkeepApproval).toHaveBeenCalledWith("c1", false);
  });

  it("sends null when a parent returns the hero to Inherit", async () => {
    // Distinct from picking the value the family happens to have today —
    // inherit must keep following the family default when it changes.
    const user = userEvent.setup();
    renderToggle({ requiresApproval: true });
    await user.selectOptions(screen.getByLabelText(/confirmation/i), "inherit");
    expect(setChildUpkeepApproval).toHaveBeenCalledWith("c1", null);
  });
});
