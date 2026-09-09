const MAX_LENGTH = 10_000;

export function sanitizeText(input: string, maxLength = MAX_LENGTH): string {
  return input
    .replace(/<[^>]*>/g, "") // strip HTML tags
    .trim()
    .slice(0, maxLength);
}

export function sanitizeName(input: string): string {
  return sanitizeText(input, 100);
}

export function sanitizeEmail(input: string): string {
  return input.trim().toLowerCase().slice(0, 254);
}

const MIN_MEANINGFUL_NOTES_LENGTH = 5;

// Required scribe notes must describe actual work, not just pass a non-empty check.
// Rejects whitespace, stray punctuation (e.g. "'", ".", "-"), and other low-effort filler.
export function hasMeaningfulNotes(input: string | null | undefined): boolean {
  if (!input) return false;
  const trimmed = input.trim();
  if (trimmed.length < MIN_MEANINGFUL_NOTES_LENGTH) return false;
  const letters = trimmed.match(/[a-zA-Z]/g);
  return (letters?.length ?? 0) >= MIN_MEANINGFUL_NOTES_LENGTH;
}
