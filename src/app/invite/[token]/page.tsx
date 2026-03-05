"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

type InviteState =
  | "loading"
  | "ready"
  | "already-in-group"
  | "not-logged-in"
  | "expired"
  | "accepted"
  | "error";

interface InviteInfo {
  groupName: string;
  inviterName: string;
  groupId: string;
}

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [state, setState] = useState<InviteState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkInvite() {
      try {
        // Check if user is logged in
        const meRes = await fetch("/api/auth/me");
        if (meRes.status === 401 || meRes.status === 500) {
          setState("not-logged-in");
          return;
        }

        // Validate the invite token
        const res = await fetch(`/api/invite/${token}`);
        const data = await res.json();

        if (!res.ok) {
          if (res.status === 410 || res.status === 404) {
            setState("expired");
          } else if (data.error?.includes("already in a group")) {
            setState("already-in-group");
          } else {
            setState("error");
            setError(data.error || "Something went wrong");
          }
          return;
        }

        setInviteInfo(data);
        setState("ready");
      } catch {
        setState("error");
        setError("Failed to validate invitation");
      }
    }

    checkInvite();
  }, [token]);

  async function handleAccept() {
    if (!inviteInfo) return;

    try {
      const res = await fetch(
        `/api/groups/${inviteInfo.groupId}/invitations/${token}/accept`,
        { method: "POST" }
      );

      if (res.ok) {
        setState("accepted");
        setTimeout(() => router.push("/"), 1500);
      } else {
        const data = await res.json();
        if (data.error?.includes("already in a group")) {
          setState("already-in-group");
        } else {
          setError(data.error || "Failed to accept invitation");
        }
      }
    } catch {
      setError("Failed to accept invitation");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 sm:p-8">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            otterfin
          </h1>

          {state === "loading" && (
            <div className="mt-6 h-20 rounded bg-[var(--bg-tertiary)] animate-pulse-subtle" />
          )}

          {state === "ready" && inviteInfo && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                {inviteInfo.inviterName} invited you to join their household
                group on OtterFin.
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                By joining, all of your connected accounts and transactions will
                be visible to group members. You can leave the group at any time
                from Settings.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleAccept}
                  className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Accept invitation
                </button>
                <Link
                  href="/"
                  className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  No thanks
                </Link>
              </div>
            </div>
          )}

          {state === "accepted" && (
            <p className="mt-6 text-sm text-[var(--accent-green)]">
              You&apos;ve joined the group! Redirecting...
            </p>
          )}

          {state === "already-in-group" && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                You&apos;re already in a group. Leave your current group first if
                you&apos;d like to join this one.
              </p>
              <div className="flex gap-3">
                <Link
                  href="/settings/group"
                  className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Go to Group Settings
                </Link>
                <Link
                  href="/"
                  className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  Cancel
                </Link>
              </div>
            </div>
          )}

          {state === "not-logged-in" && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Sign in or create an account to accept this invitation.
              </p>
              <div className="flex gap-3">
                <Link
                  href={`/login?redirect=/invite/${token}`}
                  className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                  Sign in
                </Link>
                <Link
                  href={`/register?invite=${token}`}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Create account
                </Link>
              </div>
            </div>
          )}

          {state === "expired" && (
            <p className="mt-6 text-sm text-[var(--text-secondary)]">
              This invite link has expired or is no longer valid. Contact the
              person who sent it for a new one.
            </p>
          )}

          {state === "error" && (
            <p className="mt-6 text-sm text-[var(--accent-red)]">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
