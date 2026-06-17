"use client";

// Propose a fix for a finding — launches the remediation loop (Fixer → Reviewer →
// your approval → PR) in the run's room, no CLI. Spending model tokens, so it's a
// deliberate click with a clear note. Afterwards it takes you to the LIVE Stage so
// you watch the Reviewer review and the fix get done. When it's already used ON the
// Stage (onProposed given), it just flips that Stage live instead of navigating.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/glyphs";

export function FixButton({
  roomId, file, finding, compact = false, onProposed,
}: {
  roomId: string;
  file: string;
  finding: string;
  compact?: boolean;
  onProposed?: () => void; // when on the Stage: watch live in place, don't navigate
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "sent" | "error">("idle");

  async function propose() {
    if (!file) return;
    setState("starting");
    try {
      await api.remediate(roomId, file, finding);
      setState("sent");
      if (onProposed) onProposed();
      else router.push(`/run/${roomId}/stage?live=1`);
    } catch {
      setState("error");
    }
  }

  const cls = `fix-btn${compact ? " compact" : ""}`;

  if (state === "sent") {
    return (
      <button className={`${cls} done`} disabled>
        <Icon name="check" />
        {onProposed ? "Fix proposed — watch the band" : "Fix proposed — opening the Stage…"}
      </button>
    );
  }
  return (
    <button className={cls} onClick={propose} disabled={state === "starting" || !file}
      title={file ? `Remediate ${file}` : "No file location on this finding"}>
      <Icon name={state === "starting" ? "clock" : "handoff"} />
      {state === "starting" ? "Sending the Fixer…" : state === "error" ? "Retry — couldn’t start" : "Propose a fix"}
    </button>
  );
}
