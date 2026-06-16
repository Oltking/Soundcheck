"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Global app nav = cross-run views only. It does NOT render on the marketing
// site ("/") — that page has its own header. Per-run screens live under a run's
// own tab bar so run context never gets lost.
const LINKS = [
  { href: "/app", label: "Runs" },
  { href: "/posture", label: "Posture" },
  { href: "/roster", label: "Roster" },
];

export function Nav() {
  const path = usePathname();
  if (path === "/") return null; // marketing site owns its own chrome

  const active = (href: string) =>
    href === "/app" ? path === "/app" || path.startsWith("/run") : path.startsWith(href);

  return (
    <nav className="nav">
      <Link href="/" className="brand" aria-label="Soundcheck home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-logo" src="/logo.png" alt="Soundcheck" width={30} height={30} />
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
