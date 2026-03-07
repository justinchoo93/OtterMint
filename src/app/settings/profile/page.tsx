"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SettingsLayout } from "@/components/settings/SettingsLayout";

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
  mfaEnabled?: boolean;
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  // MFA
  const [mfaSetupData, setMfaSetupData] = useState<{
    qrCodeUrl: string;
    secret: string;
    recoveryCodes: string[];
  } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMessage, setMfaMessage] = useState("");
  const [mfaIsError, setMfaIsError] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [showDisableMfa, setShowDisableMfa] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
          setDisplayName(data.user.displayName);
        }
      });
  }, []);

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      if (res.ok) {
        setMessage("Name updated");
        setTimeout(() => setMessage(""), 2000);
      } else {
        const data = await res.json();
        setMessage(data.error || "Failed to update");
      }
    } catch {
      setMessage("Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage("");

    if (newPassword.length < 8) {
      setPasswordMessage("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        setPasswordMessage("Password updated");
        setShowPasswordForm(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        setTimeout(() => setPasswordMessage(""), 2000);
      } else {
        const data = await res.json();
        setPasswordMessage(data.error || "Failed to update password");
      }
    } catch {
      setPasswordMessage("Failed to update password");
    } finally {
      setSaving(false);
    }
  }

  async function handleMfaSetup() {
    setMfaLoading(true);
    setMfaMessage("");
    try {
      const res = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMfaSetupData(data);
      } else {
        setMfaIsError(true);
        setMfaMessage(data.error || "Failed to set up MFA");
      }
    } catch {
      setMfaIsError(true);
      setMfaMessage("Failed to set up MFA");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleMfaVerifySetup(e: FormEvent) {
    e.preventDefault();
    setMfaLoading(true);
    setMfaMessage("");
    try {
      const res = await fetch("/api/auth/mfa/verify-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, mfaEnabled: true } : prev));
        setMfaSetupData(null);
        setMfaCode("");
        setMfaIsError(false);
        setMfaMessage("Two-factor authentication enabled");
        setTimeout(() => setMfaMessage(""), 3000);
      } else {
        setMfaIsError(true);
        setMfaMessage(data.error || "Invalid code");
      }
    } catch {
      setMfaIsError(true);
      setMfaMessage("Verification failed");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleMfaDisable(e: FormEvent) {
    e.preventDefault();
    setMfaLoading(true);
    setMfaMessage("");
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((prev) => (prev ? { ...prev, mfaEnabled: false } : prev));
        setShowDisableMfa(false);
        setDisableCode("");
        setMfaIsError(false);
        setMfaMessage("Two-factor authentication disabled");
        setTimeout(() => setMfaMessage(""), 3000);
      } else {
        setMfaIsError(true);
        setMfaMessage(data.error || "Invalid code");
      }
    } catch {
      setMfaIsError(true);
      setMfaMessage("Failed to disable MFA");
    } finally {
      setMfaLoading(false);
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE" });
      if (res.ok) {
        router.push("/login");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete account");
      }
    } catch {
      alert("Failed to delete account");
    } finally {
      setDeleting(false);
    }
  }

  if (!user) {
    return (
      <SettingsLayout title="Profile & Settings">
        <div className="h-40 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] animate-pulse-subtle" />
      </SettingsLayout>
    );
  }

  return (
    <SettingsLayout title="Profile & Settings">
      {/* Identity */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Identity
        </h2>
        <form onSubmit={handleSaveName} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Email
            </label>
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-muted)] outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save changes
            </button>
            {message && (
              <span className="text-xs text-[var(--accent-green)]">
                {message}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Security */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Security
        </h2>

        {!showPasswordForm ? (
          <button
            onClick={() => setShowPasswordForm(true)}
            className="text-sm text-[var(--accent-blue)] hover:underline"
          >
            Change password
          </button>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Current password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                New password (min 8 chars)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)]"
              />
            </div>
            {passwordMessage && (
              <p className="text-xs text-[var(--accent-red)]">
                {passwordMessage}
              </p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasswordForm(false);
                  setPasswordMessage("");
                }}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* MFA */}
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <h3 className="mb-3 text-xs font-medium text-[var(--text-secondary)]">
            Two-factor authentication
          </h3>

          {mfaMessage && (
            <p className={`mb-3 text-xs ${mfaIsError ? "text-[var(--accent-red)]" : "text-[var(--accent-green)]"}`}>
              {mfaMessage}
            </p>
          )}

          {user.mfaEnabled ? (
            // MFA is enabled
            !showDisableMfa ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--accent-green)]">Enabled</span>
                <button
                  onClick={() => setShowDisableMfa(true)}
                  className="text-sm text-[var(--accent-red)] hover:underline"
                >
                  Disable
                </button>
              </div>
            ) : (
              <form onSubmit={handleMfaDisable} className="space-y-3">
                <p className="text-xs text-[var(--text-muted)]">
                  Enter a code from your authenticator app to disable MFA.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)] font-mono tracking-widest"
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={mfaLoading}
                    className="rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Disable MFA
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDisableMfa(false);
                      setDisableCode("");
                      setMfaMessage("");
                    }}
                    className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )
          ) : mfaSetupData ? (
            // Setup in progress
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs text-[var(--text-secondary)]">
                  Scan this QR code with your authenticator app:
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mfaSetupData.qrCodeUrl}
                  alt="TOTP QR Code"
                  className="mx-auto rounded-lg"
                  width={200}
                  height={200}
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">
                  Or enter this code manually:
                </p>
                <code className="block rounded bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] break-all select-all">
                  {mfaSetupData.secret}
                </code>
              </div>
              <div className="rounded-lg border border-[var(--accent-yellow)]/30 bg-[var(--accent-yellow)]/5 p-3">
                <p className="mb-2 text-xs font-medium text-[var(--text-primary)]">
                  Recovery codes - save these now
                </p>
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  These codes can be used to access your account if you lose your
                  authenticator. Each code can only be used once.
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {mfaSetupData.recoveryCodes.map((code) => (
                    <code
                      key={code}
                      className="rounded bg-[var(--bg-tertiary)] px-2 py-1 text-xs font-mono text-[var(--text-primary)] select-all"
                    >
                      {code}
                    </code>
                  ))}
                </div>
              </div>
              <form onSubmit={handleMfaVerifySetup} className="space-y-3">
                <p className="text-xs text-[var(--text-secondary)]">
                  Enter the 6-digit code from your authenticator to confirm setup:
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-blue)] font-mono tracking-widest"
                />
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={mfaLoading}
                    className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Verify and enable
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMfaSetupData(null);
                      setMfaCode("");
                      setMfaMessage("");
                    }}
                    className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : (
            // MFA not enabled, show setup button
            <button
              onClick={handleMfaSetup}
              disabled={mfaLoading}
              className="text-sm text-[var(--accent-blue)] hover:underline disabled:opacity-50"
            >
              {mfaLoading ? "Setting up..." : "Enable two-factor authentication"}
            </button>
          )}
        </div>
      </div>

      {/* Sessions */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Sessions
        </h2>
        <button
          onClick={handleSignOut}
          className="text-sm text-[var(--accent-red)] hover:underline"
        >
          Sign out
        </button>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-[var(--accent-red)]/30 bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--accent-red)]">
          Danger Zone
        </h2>
        {!showDeleteConfirm ? (
          <div>
            <p className="mb-3 text-sm text-[var(--text-secondary)]">
              Permanently delete your account and all associated data. This
              cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-[var(--accent-red)]/30 px-4 py-2 text-sm font-medium text-[var(--accent-red)] transition-colors hover:bg-[var(--accent-red)]/10"
            >
              Delete account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              This will permanently delete your account, all connected
              financial institutions, transactions, holdings, and snapshots.
              Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              className="w-full rounded-lg border border-[var(--accent-red)]/30 bg-[var(--bg-tertiary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-red)]"
            />
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deleting}
                className="rounded-lg bg-[var(--accent-red)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently delete account"}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </SettingsLayout>
  );
}
