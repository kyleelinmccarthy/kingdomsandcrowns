import { render } from "@testing-library/react";
import { GameIcon, type GameIconName } from "@/components/game-icon";

/** What an icon's <svg> draws, so two icons can be compared by what they show. */
export function drawing(svg: Element | null | undefined): string {
  if (!svg) throw new Error("no icon here");
  return svg.innerHTML;
}

/** The drawing of one icon from the set, rendered on its own. */
export function drawingOf(name: GameIconName): string {
  const { container, unmount } = render(<GameIcon name={name} />);
  const drawn = drawing(container.querySelector("svg"));
  unmount();
  return drawn;
}
