import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpkeepTaskForm } from "./upkeep-task-form";

const createUpkeepTask = vi.fn().mockResolvedValue({ id: "t1", title: "Dishes" });

vi.mock("@/lib/actions/upkeep-tasks", () => ({
  createUpkeepTask: (...args: unknown[]) => createUpkeepTask(...args),
  updateUpkeepTask: vi.fn(),
}));
vi.mock("@/lib/actions/upkeep-schedules", () => ({ upsertUpkeepSchedule: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  createUpkeepTask.mockClear();
});

describe("UpkeepTaskForm", () => {
  it("converts the typed dollar amount to whole cents", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} timeZone="America/Denver" />);

    await user.type(screen.getByLabelText(/title/i), "Dishes");
    await user.type(screen.getByLabelText(/worth/i), "2.50");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createUpkeepTask).toHaveBeenCalledWith(
      expect.objectContaining({ childId: "c1", title: "Dishes", valueCents: 250 })
    );
  });

  it("sends a null value when no amount is given", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} timeZone="America/Denver" />);

    await user.type(screen.getByLabelText(/title/i), "Tidy the hall");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createUpkeepTask).toHaveBeenCalledWith(
      expect.objectContaining({ valueCents: null })
    );
  });

  it("shows an error and does not submit an unparseable amount", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} timeZone="America/Denver" />);

    await user.type(screen.getByLabelText(/title/i), "Dishes");
    await user.type(screen.getByLabelText(/worth/i), "lots");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText(/amount like/i)).toBeInTheDocument();
    expect(createUpkeepTask).not.toHaveBeenCalled();
  });

  it("defaults a task to required", async () => {
    const user = userEvent.setup();
    render(<UpkeepTaskForm childId="c1" task={null} onDone={vi.fn()} timeZone="America/Denver" />);

    await user.type(screen.getByLabelText(/title/i), "Dishes");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(createUpkeepTask).toHaveBeenCalledWith(
      expect.objectContaining({ isRequired: true })
    );
  });
});
