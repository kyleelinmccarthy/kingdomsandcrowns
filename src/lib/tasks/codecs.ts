import type { ResponseByKind, TaskKind } from "./types";

/**
 * How a response is written down, read back and compared, per kind. Client-safe: the presenters
 * encode with it and the server's definitions delegate to it, so the two cannot drift. It imports
 * only types, so it never pulls the server-only registry, drawing or bench code into the browser
 * bundle (`client-boundary.test.ts` guards that).
 */
export type TaskCodec<K extends TaskKind> = {
  /** The response as stored in the database and sent from the client. */
  encode(r: ResponseByKind[K]): string;
  decode(s: string): ResponseByKind[K] | null;
  sameResponse(a: ResponseByKind[K], b: ResponseByKind[K]): boolean;
};

export const TASK_CODECS: { [K in TaskKind]: TaskCodec<K> } = {
  // Responses are the trimmed choice text, so rows stored before kinds existed keep grading
  // exactly as trimmed equality does.
  choice: {
    encode: (r) => r.trim(),
    decode: (s) => s.trim(),
    sameResponse: (a, b) => a.trim() === b.trim(),
  },
};
