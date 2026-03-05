"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface AvatarMenuProps {
  displayName: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AvatarMenu({ displayName }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        aria-label="User menu"
      >
        {getInitials(displayName)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-1 shadow-lg">
          <div className="border-b border-[var(--border)] px-3 py-2">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {displayName}
            </p>
          </div>
          <Link
            href="/settings/profile"
            className="block px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            onClick={() => setOpen(false)}
          >
            Profile & Settings
          </Link>
          <Link
            href="/settings/group"
            className="block px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            onClick={() => setOpen(false)}
          >
            Group & Sharing
          </Link>
          <Link
            href="/settings/sharing"
            className="block px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            onClick={() => setOpen(false)}
          >
            Share Links
          </Link>
          <button
            onClick={handleSignOut}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
