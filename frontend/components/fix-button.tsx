"use client";

// Propose a fix for a finding — launches the remediation loop (Fixer → Reviewer →
// your approval → PR) in the run's room, no CLI. Spending model tokens, so it's a
// deliberate click with a clear note; afterwards it points you to the Conductor.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Icon } from "@/components/glyphs";

export function FixButton({ roomId, file, finding }: { roomId: string; file: string; finding: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "sent" | "error">("idle");

  async function propose() {
    if (!file) return;
    setState("starting");
    try {
      await api.remediate(roomId, file, finding);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <button className="fix-btn done" onClick={() => router.push(`/run/${roomId}/conductor`)}>
        <Icon name="check" /> Fix proposed — open the Conductor
      </button>
    );
  }
  return (
    <button className="fix-btn" onClick={propose} disabled={state === "starting" || !file}
      title={file ? `Remediate ${file}` : "No file location on this finding"}>
      <Icon name={state === "starting" ? "clock" : "handoff"} />
      {state === "starting" ? "Sending the Fixer…" : state === "error" ? "Retry — couldn’t start" : "Propose a fix"}
    </button>
  );
}
