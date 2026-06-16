"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { seg: "stage", label: "The Stage" },
  { seg: "findings", label: "Findings" },
  { seg: "conductor", label: "The Conductor" },
  { seg: "ask", label: "Ask the band" },
  { seg: "tape", label: "Master Tape" },
];

export function RunTabs({ roomId }: { roomId: string }) {
  const path = usePathname();
  return (
    <div className="run-tabs">
      {TABS.map((t) => {
        const href = `/run/${roomId}/${t.seg}`;
        const on = path === href || path.startsWith(href);
        return (
          <Link key={t.seg} href={href} className={on ? "on" : ""}>{t.label}</Link>
        );
      })}
    </div>
  );
}
