/**
 * The hands-on kinds: the ones a grown-up can switch on beyond multiple choice. Client-safe (a
 * settings panel can list them), so it holds names only, never a definition or a generator.
 */
export const HANDS_ON_KINDS = ["measure"] as const;

export type HandsOnKind = (typeof HANDS_ON_KINDS)[number];
