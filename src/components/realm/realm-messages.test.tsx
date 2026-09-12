import { describe, it, expect, vi, afterEach } from "vitest";
import { createRef } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmMessages } from "./realm-messages";

afterEach(cleanup);

const arrow = () => createRef<HTMLDivElement>();

describe("RealmMessages", () => {
  it("shows one problem and one speech message, each in its own lane", () => {
    render(
      <RealmMessages
        problem={{ kind: "kingdomError", text: "The villagers are resting. Try again.", actionLabel: "Wake the villagers" }}
        speech={{ kind: "toast", text: "The Village Well stands.", tone: "cheer" }}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    const problem = screen.getByTestId("realm-problem");
    const speech = screen.getByTestId("realm-speech");
    expect(problem).toHaveTextContent("The villagers are resting. Try again.");
    expect(problem).toHaveClass("realm-message", "realm-message--problem");
    expect(speech).toHaveTextContent("The Village Well stands.");
    expect(speech).toHaveClass("realm-message", "realm-message--cheer");
  });

  it("keeps one unchanging live-region role on the problem lane, whatever the kind", () => {
    // The lane used to swap role="alert" in for the three error kinds while pinning
    // aria-live="polite" on both branches — identical announcement behaviour, bought at the
    // price of mutating `role` on a live node, which is the one thing screen readers handle
    // inconsistently. One role for the life of the node, and polite on purpose: nothing in
    // this lane is urgent enough to talk over a child mid-sentence.
    const kinds = [
      { kind: "spriteError", text: "boom", actionLabel: "Try again" },
      { kind: "lastMinute", text: "One minute left in the Realm today.", actionLabel: null },
      { kind: "preview", text: "You're looking at Lily's grounds.", actionLabel: null },
    ] as const;
    for (const problem of kinds) {
      render(<RealmMessages problem={problem} speech={null} arrowRef={arrow()} onAction={() => {}} hudScale={1} />);
      const lane = screen.getByTestId("realm-problem");
      expect(lane).toHaveAttribute("role", "status");
      expect(lane).toHaveAttribute("aria-live", "polite");
      cleanup();
    }
    // And with nothing showing, so the role cannot depend on there being a problem at all.
    render(<RealmMessages problem={null} speech={null} arrowRef={arrow()} onAction={() => {}} hudScale={1} />);
    expect(screen.getByTestId("realm-problem")).toHaveAttribute("role", "status");
  });

  it("keeps both lanes mounted and empty when there is nothing to say", () => {
    render(<RealmMessages problem={null} speech={null} arrowRef={arrow()} onAction={() => {}} hudScale={1} />);
    const problem = screen.getByTestId("realm-problem");
    const speech = screen.getByTestId("realm-speech");
    expect(problem.tagName).toBe("P");
    expect(speech.tagName).toBe("P");
    expect(problem).toBeEmptyDOMElement();
    expect(speech).toBeEmptyDOMElement();
    expect(problem).toHaveAttribute("aria-live", "polite");
    expect(speech).toHaveAttribute("aria-live", "polite");
  });

  it("lets pointers through the layer and takes them only in the action button", () => {
    render(
      <RealmMessages
        problem={{ kind: "kingdomError", text: "The villagers are resting. Try again.", actionLabel: "Wake the villagers" }}
        speech={null}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-messages").style.pointerEvents).toBe("none");
    expect(screen.getByRole("button", { name: "Wake the villagers" }).style.pointerEvents).toBe("auto");
  });

  it("calls onAction from the problem's action button, and renders no button without a label", () => {
    const onAction = vi.fn();
    render(
      <RealmMessages
        problem={{ kind: "ceremonyError", text: "The crown could not be recorded.", actionLabel: "Try again" }}
        speech={null}
        arrowRef={arrow()}
        onAction={onAction}
        hudScale={1}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    cleanup();
    render(
      <RealmMessages
        problem={{ kind: "lastMinute", text: "One minute left in the Realm today.", actionLabel: null }}
        speech={null}
        arrowRef={arrow()}
        onAction={onAction}
        hudScale={1}
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("styles ceremony narration as the stage lane and a calm toast as the plain one", () => {
    render(
      <RealmMessages
        problem={null}
        speech={{ kind: "ceremony", text: "Hail, Lily, Crown of Spring!", tone: "stage" }}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-speech")).toHaveClass("realm-message--stage");
    cleanup();
    render(
      <RealmMessages
        problem={null}
        speech={{ kind: "toast", text: "The Village Well stands.", tone: "plain" }}
        arrowRef={arrow()}
        onAction={() => {}}
        hudScale={1}
      />
    );
    expect(screen.getByTestId("realm-speech")).toHaveClass("realm-message--plain");
  });

  it("hands the scene an edge-arrow node that is hidden and silent until the scene moves it", () => {
    const ref = arrow();
    render(<RealmMessages problem={null} speech={null} arrowRef={ref} onAction={() => {}} hudScale={1} />);
    const el = document.querySelector<HTMLDivElement>(".realm-edge-arrow")!;
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.hidden).toBe(true);
    expect(ref.current).toBe(el);
  });

  it("scales the lanes with the hero's HUD scale", () => {
    render(<RealmMessages problem={null} speech={null} arrowRef={arrow()} onAction={() => {}} hudScale={1.25} />);
    expect(screen.getByTestId("realm-messages").style.fontSize).toBe("1.25em");
  });
});
