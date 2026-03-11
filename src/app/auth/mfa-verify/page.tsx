"use client";

import { Suspense, useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function MfaVerifyPage() {
  return (
    <Suspense>
      <MfaVerifyForm />
    </Suspense>
  );
}

function MfaVerifyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }

      const safeRedirect =
        redirect.startsWith("/") && !redirect.startsWith("//")
          ? redirect
          : "/";
      router.push(safeRedirect);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              Two-factor authentication
            </h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {useRecovery
                ? "Enter one of your recovery codes"
                : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="code"
                className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
              >
                {useRecovery ? "Recovery code" : "Authentication code"}
              </label>
              <input
                id="code"
                type="text"
                inputMode={useRecovery ? "text" : "numeric"}
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={useRecovery ? 8 : 6}
                placeholder={useRecovery ? "xxxxxxxx" : "000000"}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent-blue)] tracking-widest text-center font-mono"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--accent-red)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setCode("");
              setError("");
            }}
            className="mt-4 block w-full text-center text-xs text-[var(--accent-blue)] hover:underline"
          >
            {useRecovery
              ? "Use authenticator app instead"
              : "Use a recovery code"}
          </button>
        </div>
      </div>
    </div>
  );
}
