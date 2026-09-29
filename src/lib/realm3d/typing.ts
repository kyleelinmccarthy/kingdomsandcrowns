/**
 * True when a key press belongs to a field that takes text — an input, text area, select or
 * editable element the HUD put on screen — and so is the field's, not the game's. A slider, a
 * checkbox, a radio and a button take no text, so the game keeps its keys over them.
 */
export function typingInto(t: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT") return true;
  return t instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit"].includes(t.type);
}
