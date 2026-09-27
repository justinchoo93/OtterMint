"use client";

import { useCallback, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { exchangeNewLink, persistLinkRestore } from "./plaid-restore";
import { Button } from "@/components/ui";

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
      persistLinkRestore(data.link_token, "link");
    } catch (err) {
      console.error("Failed to get link token:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (publicToken, metadata) => {
      setLinkToken(null);
      try {
        await exchangeNewLink(publicToken, metadata.institution);
        onSuccess?.();
      } catch (err) {
        console.error("Failed to exchange token:", err);
      }
    },
    onExit: () => {
      setLinkToken(null);
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
    <Button variant="primary" onClick={handleClick} disabled={loading}>
      {loading ? "..." : <><span className="sm:hidden">+ Connect</span><span className="hidden sm:inline">+ Connect Account</span></>}
    </Button>
  );
}
