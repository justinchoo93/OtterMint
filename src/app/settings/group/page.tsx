"use client";

import { useState, useEffect, useCallback } from "react";
import { SettingsLayout } from "@/components/settings/SettingsLayout";

interface GroupInfo {
  id: string;
  name: string;
  role: string;
  memberCount: number;
}

interface Member {
  id: number;
  userId: string;
  role: string;
  displayName: string;
  email: string;
  joinedAt: string;
}

interface Invitation {
  id: string;
  token: string;
  invitedEmail: string | null;
  acceptedAt: string | null;
  expiresAt: string;
}

export default function GroupSettingsPage() {
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteLink, setInviteLink] = useState<string>("");
  const [activeInviteToken, setActiveInviteToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const fetchGroup = useCallback(async () => {
    try {
      const [groupRes, meRes] = await Promise.all([
        fetch("/api/groups"),
        fetch("/api/auth/me"),
      ]);
      const groupData = await groupRes.json();
      const meData = await meRes.json();

      if (meData.user) setCurrentUserId(meData.user.id);

      if (groupData.groups?.length > 0) {
        const g = groupData.groups[0];
        setGroup(g);
        await fetchMembers(g.id);
        if (g.role === "owner") {
          await fetchOrCreateInvite(g.id);
        } else {
          setInviteLink("");
        }
      }
    } catch (err) {
      console.error("Failed to fetch group:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  async function fetchMembers(groupId: string) {
    const res = await fetch(`/api/groups/${groupId}/members`);
    const data = await res.json();
    setMembers(data.members ?? []);
  }

  async function fetchOrCreateInvite(groupId: string) {
    // Get existing invitations
    const res = await fetch(`/api/groups/${groupId}/invitations`);
    const data = await res.json();

    // Find an active, unaccepted invitation
    const activeInvite = data.invitations?.find(
      (inv: Invitation) =>
        !inv.acceptedAt && new Date(inv.expiresAt) > new Date()
    );

    if (activeInvite) {
      setActiveInviteToken(activeInvite.token);
      setInviteLink(
        `${window.location.origin}/invite/${activeInvite.token}`
      );
    }
  }

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  async function handleCreateGroup() {
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchGroup();
      }
    } catch (err) {
      console.error("Failed to create group:", err);
    }
  }

  async function handleGenerateInvite() {
    if (!group) return;
    try {
      const res = await fetch(`/api/groups/${group.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.invitation) {
        setActiveInviteToken(data.invitation.token);
        setInviteLink(
          `${window.location.origin}/invite/${data.invitation.token}`
        );
      }
    } catch (err) {
      console.error("Failed to generate invite:", err);
    }
  }

  async function handleRevokeInvite() {
    if (!group || !activeInviteToken) return;
    if (
      !confirm(
        "Revoke this invite link? Anyone who has it will no longer be able to join."
      )
    ) {
      return;
    }
    try {
      await fetch(
        `/api/groups/${group.id}/invitations?token=${encodeURIComponent(
          activeInviteToken
        )}`,
        { method: "DELETE" }
      );
      setInviteLink("");
      setActiveInviteToken("");
    } catch (err) {
      console.error("Failed to revoke invite:", err);
    }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRemoveMember(userId: string) {
    if (!group) return;
    if (
      !confirm("Remove this member from the group? They will lose access to the household view.")
    ) {
      return;
    }

    try {
      await fetch(`/api/groups/${group.id}/members?userId=${userId}`, {
        method: "DELETE",
      });
      await fetchMembers(group.id);
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  }

  async function handleLeaveGroup() {
    if (!group) return;

    const isOwner = group.role === "owner";
    const message = isOwner
      ? "This will permanently delete the group and remove all members. This cannot be undone."
      : "You'll lose access to the household view, and your accounts will no longer be visible to group members.";

    if (!confirm(message)) {
      return;
    }

    try {
      if (isOwner) {
        await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
      } else {
        await fetch(
          `/api/groups/${group.id}/members?userId=${currentUserId}`,
          { method: "DELETE" }
        );
      }
      setGroup(null);
      setMembers([]);
      setInviteLink("");
      setActiveInviteToken("");
    } catch (err) {
      console.error("Failed to leave group:", err);
    }
  }

  if (loading) {
    return (
      <SettingsLayout title="Group & Sharing">
        <div className="h-40 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] animate-pulse-subtle" />
      </SettingsLayout>
    );
  }

  // No group yet
  if (!group) {
    return (
      <SettingsLayout title="Group & Sharing">
        <p className="text-sm text-[var(--text-secondary)]">
          See your household&apos;s full financial picture in one place. Invite a
          partner, family member, or anyone you share finances with.
        </p>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            Create a group
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            You&apos;ll be the owner. Invite others to join.
          </p>
          <button
            onClick={handleCreateGroup}
            className="mt-4 rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Create group
          </button>
        </div>
      </SettingsLayout>
    );
  }

  // Has group
  const isOwner = group.role === "owner";

  return (
    <SettingsLayout title="Group & Sharing">
      {/* Members */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Members
        </h2>
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)] px-3 py-2"
            >
              <div>
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {member.displayName}
                </span>
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {member.email}
                </span>
                <span className="ml-2 rounded bg-[var(--bg-hover)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--text-muted)]">
                  {member.role}
                </span>
              </div>
              {isOwner && member.userId !== currentUserId && (
                <button
                  onClick={() => handleRemoveMember(member.userId)}
                  className="text-xs text-[var(--accent-red)] hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isOwner ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Invite
          </h2>

          {inviteLink ? (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Share this link (expires in 7 days):
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-secondary)] outline-none"
                />
                <button
                  onClick={handleCopyLink}
                  className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={handleGenerateInvite}
                className="text-xs text-[var(--accent-blue)] hover:underline"
              >
                Generate new link
              </button>
              <button
                onClick={handleRevokeInvite}
                className="ml-3 text-xs text-[var(--accent-red)] hover:underline"
              >
                Revoke link
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateInvite}
              className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              Generate invite link
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
            Invitations
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Only the group owner can create or view invitation links.
          </p>
        </div>
      )}

      {/* Shared Data Info */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Shared Data
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Joining this group means all of your accounts and transactions are
          visible to other members.
        </p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Per-account controls are coming in a future update.
        </p>
      </div>

      {/* Leave / Disband */}
      <div className="rounded-xl border border-[var(--accent-red-dim)] bg-[var(--bg-secondary)] p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--accent-red)]">
          Danger Zone
        </h2>
        <button
          onClick={handleLeaveGroup}
          className="text-sm text-[var(--accent-red)] hover:underline"
        >
          {isOwner ? "Disband group" : "Leave group"}
        </button>
      </div>
    </SettingsLayout>
  );
}
