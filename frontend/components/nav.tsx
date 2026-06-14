"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Global nav = cross-run views only. Per-run screens (Stage/Findings/Conductor/
// Tape) live under a run's own tab bar so your run context never gets lost.
const LINKS = [
  { href: "/", label: "Runs" },
  { href: "/posture", label: "Posture" },
  { href: "/roster", label: "Roster" },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/run") : path.startsWith(href);
  return (
    <nav className="nav">
      <Link href="/" className="brand">
        <span className="mark">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--live-deep)" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h2.2l1.6-6 2.6 13 2.4-9 1.8 5 1.6-3H21" />
          </svg>
        </span>
        <span className="wm">sound<b>check</b></span>
      </Link>
      <div className="links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={active(l.href) ? "on" : ""}>
            {l.label}
          </Link>
        ))}
      </div>
      <span className="spacer" />
      <span className="cond-chip">
        <span className="cond-av">YOU</span>
        the conductor
      </span>
    </nav>
  );
}
