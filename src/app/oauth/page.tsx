"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import {
  clearLinkRestore,
  exchangeNewLink,
  readLinkRestore,
  type LinkRestore,
} from "@/components/plaid/plaid-restore";

/**
 * Plaid OAuth return page.
 *
 * Some banks force an OAuth flow: Plaid Link sends the browser to the bank and
 * back to this pre-registered redirect_uri. On return we resume Link with the
 * ORIGINAL token (stashed in localStorage by the launching button) and tell
 * Plaid this is an OAuth return via receivedRedirectUri, then auto-open.
 *
 * ALL window/localStorage access lives inside useEffect so SSR/prerender is
 * safe. This route is authenticated: the SameSite=Lax session cookie rides the
 * top-level GET return navigation, so it is NOT in the middleware public paths.
 */
export default function OAuthReturnPage() {
  const router = useRouter();
  const [restore, setRestore] = useState<LinkRestore | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string | null>(
    null
  );

  // Read the stashed restore on mount; bail to "/" if there is nothing to resume.
  useEffect(() => {
    const stored = readLinkRestore();
    if (!stored) {
      router.replace("/");
      return;
    }
    setReceivedRedirectUri(window.location.href);
    setRestore(stored);
  }, [router]);

  const finish = useCallback(() => {
    clearLinkRestore();
    router.replace("/");
  }, [router]);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      try {
        if (restore?.mode === "link") {
          await exchangeNewLink(publicToken, metadata.institution);
        }
        // mode "update" / re-auth: nothing to exchange, just finish.
      } catch (err) {
        console.error("Failed to complete OAuth link:", err);
      } finally {
        finish();
      }
    },
    [restore, finish]
  );

  const { open, ready } = usePlaidLink({
    token: restore?.token ?? null,
    receivedRedirectUri: receivedRedirectUri ?? undefined,
    onSuccess,
    onExit: finish,
  });

  // Auto-open Link once it is ready and we have a token to resume.
  useEffect(() => {
    if (restore && ready) {
      open();
    }
  }, [restore, ready, open]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-[var(--muted-foreground,#6b7280)]">
        Finishing connection…
      </p>
    </main>
  );
}
