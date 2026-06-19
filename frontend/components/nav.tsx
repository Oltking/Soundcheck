"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

// Global app nav = cross-run views only. It does NOT render on the marketing
// site ("/") or the auth pages - those own their own chrome. Per-run screens
// live under a run's own tab bar so run context never gets lost.
const LINKS = [
  { href: "/app", label: "Runs" },
  { href: "/posture", label: "Posture" },
  { href: "/roster", label: "Roster" },
];

type NavUser = { name?: string | null; email?: string | null } | null;

function initials(s: string): string {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function Nav({ user }: { user: NavUser }) {
  const path = usePathname();
  if (path === "/" || path === "/login" || path === "/signup") return null;

  const active = (href: string) =>
    href === "/app" ? path === "/app" || path.startsWith("/run") : path.startsWith(href);

  const nick = user?.name || user?.email?.split("@")[0] || "you";

  return (
    <nav className="nav">
      <Link href="/" className="brand" aria-label="Soundcheck home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo.png" alt="Soundcheck" width={30} height={30} />
        <span className="wm">sound<b>check</b></span>
      </Link>
      {user && (
        <div className="links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={active(l.href) ? "on" : ""}>
              {l.label}
            </Link>
          ))}
        </div>
      )}
      <span className="spacer" />
      {user ? (
        <div className="nav-user">
          <span className="cond-chip" title={user?.email || nick}>
            <span className="cond-av">{initials(nick)}</span>
            {nick}
          </span>
          <button className="nav-signout" onClick={() => signOut({ callbackUrl: "/" })}>
            Sign out
          </button>
        </div>
      ) : (
        <Link href="/login" className="nav-signin">Sign in</Link>
      )}
    </nav>
  );
}
