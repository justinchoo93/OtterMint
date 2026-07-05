"use client";

import { useCallback, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { clearLinkRestore, persistLinkRestore } from "./plaid-restore";

interface PlaidReauthButtonProps {
  itemId: number;
  onSuccess?: () => void;
}

export function PlaidReauthButton({
  itemId,
  onSuccess,
}: PlaidReauthButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUpdateToken = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plaid/create-update-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      setLinkToken(data.link_token);
      persistLinkRestore(data.link_token, "update", itemId);
    } catch (err) {
      console.error("Failed to get update link token:", err);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: () => {
      setLinkToken(null);
      clearLinkRestore();
      onSuccess?.();
    },
    onExit: () => {
      setLinkToken(null);
      clearLinkRestore();
    },
  });

  const handleClick = async () => {
    if (!linkToken) {
      await fetchUpdateToken();
    }
  };

  if (linkToken && ready) {
    open();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded bg-[var(--accent-red)] px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
    >
      {loading ? "..." : "Re-authenticate"}
    </button>
  );
}
