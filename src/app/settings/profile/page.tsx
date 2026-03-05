"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SettingsLayout } from "@/components/settings/SettingsLayout";

interface UserInfo {
  id: string;
  email: string;
  displayName: string;
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

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

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
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
    </SettingsLayout>
  );
}
