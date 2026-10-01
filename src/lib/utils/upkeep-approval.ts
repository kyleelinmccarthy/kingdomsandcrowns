/**
 * Whether a hero's completed chore waits for a grown-up to confirm it.
 *
 * Two settings decide this: the family's default, and an optional per-hero
 * override. The override is nullable rather than a plain boolean because
 * "inherit" is a real third state — a parent who has not made a choice for
 * this hero should keep following the family default as it changes, not be
 * silently frozen at whatever it happened to be when the hero was added.
 *
 * A six-year-old's work usually wants checking; a fourteen-year-old's usually
 * does not. This is what lets one family hold both.
 */
export function resolveRequiresApproval(
  familyRequiresApproval: boolean,
  childOverride: boolean | null | undefined
): boolean {
  return childOverride ?? familyRequiresApproval;
}

/**
 * What the "Inherit" option resolves to right now, for the settings copy.
 * Showing this inline is what keeps the three-state control unambiguous —
 * otherwise "Inherit" tells a parent nothing about what will actually happen.
 */
export function describeApprovalInheritance(familyRequiresApproval: boolean): string {
  return familyRequiresApproval ? "currently always confirm" : "currently no confirmation";
}
