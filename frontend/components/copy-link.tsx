"use client";

// Copy a shareable link to the current record (the run's authority page).
// Read-only governance artifact - "the thing an auditor receives."

import { useState } from "react";
import { Icon } from "@/components/glyphs";

export function CopyLink({ label = "Copy link to this record" }: { label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* clipboard blocked - no-op */
    }
  }
  return (
    <button className="btn" onClick={copy} aria-label={label}>
      <Icon name={done ? "check" : "handoff"} />
      {done ? "Link copied" : label}
    </button>
  );
}
