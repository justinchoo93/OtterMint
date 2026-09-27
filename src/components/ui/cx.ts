/** Join class names, dropping falsy entries. Callers avoid conflicting utilities. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
