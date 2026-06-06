import type { PlaidInstitution } from "react-plaid-link";

/**
 * Shared Plaid Link restore + exchange helpers.
 *
 * Some banks force an OAuth flow where Plaid Link bounces the browser to the
 * bank and back to a registered redirect_uri. To resume Link on return, the
 * launching button stashes the original link token (plus a small mode marker)
 * in localStorage; the /oauth return page reads it back. Factoring this into
 * one module keeps the buttons and the return page from drifting.
 */

export const LINK_RESTORE_KEY = "plaid_oauth_restore";

export type LinkRestoreMode = "link" | "update";

export interface LinkRestore {
  token: string;
  mode: LinkRestoreMode;
  itemId?: number;
}

/** Stash the link token + mode so the OAuth return page can resume Link. */
export function persistLinkRestore(
  token: string,
  mode: LinkRestoreMode,
  itemId?: number
): void {
  const payload: LinkRestore =
    mode === "update" && itemId !== undefined
      ? { token, mode, itemId }
      : { token, mode };
  localStorage.setItem(LINK_RESTORE_KEY, JSON.stringify(payload));
}

/** Read + validate the stashed restore. Returns null on missing/malformed. */
export function readLinkRestore(): LinkRestore | null {
  const raw = localStorage.getItem(LINK_RESTORE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.token !== "string") return null;
  if (obj.mode !== "link" && obj.mode !== "update") return null;

  const restore: LinkRestore = { token: obj.token, mode: obj.mode };
  if (typeof obj.itemId === "number") {
    restore.itemId = obj.itemId;
  }
  return restore;
}

/** Remove the stashed restore. */
export function clearLinkRestore(): void {
  localStorage.removeItem(LINK_RESTORE_KEY);
}

/** Exchange a public token for a new linked item (verbatim from the button). */
export async function exchangeNewLink(
  publicToken: string,
  institution: PlaidInstitution | null
): Promise<void> {
  await fetch("/api/plaid/exchange-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      public_token: publicToken,
      institution,
    }),
  });
}
