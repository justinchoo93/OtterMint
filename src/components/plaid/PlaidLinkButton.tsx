"use client";

import { useCallback, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

interface PlaidLinkButtonProps {
  onSuccess?: () => void;
}

export function PlaidLinkButton({ onSuccess }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLinkToken = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
      });
      const data = await res.json();
      setLinkToken(data.link_token);
    } catch (err) {
      console.error("Failed to get link token:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      try {
        await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_token: publicToken,
            institution: metadata.institution,
          }),
        });
        onSuccess?.();
      } catch (err) {
        console.error("Failed to exchange token:", err);
      }
    },
  });

  const handleClick = async () => {
    if (!linkToken) {
      await fetchLinkToken();
    }
  };

  // Open Plaid Link once token is ready
  if (linkToken && ready) {
    open();
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
    >
      {loading ? "..." : <><span className="sm:hidden">+ Connect</span><span className="hidden sm:inline">+ Connect Account</span></>}
    </button>
  );
}
