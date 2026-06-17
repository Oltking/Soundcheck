"use client";

// Connect — the entry point: start a real audit. Starting spends model tokens,
// so it's a deliberate action with a clear note. After kickoff it polls for the
// new Band room and drops you onto its live Stage. The wait can be long, so we
// rotate through what the band is actually doing.

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/glyphs";

// What's happening backstage while we wait for the room to appear.
const PHASES = [
  "Sending the band in",
  "Cloning the repository",
  "Reading the codebase",
  "Building OrgContext",
  "Recruiting the players",
  "Aligning the agents",
  "Tuning the instruments",
  "Cueing the Bandleader",
  "Warming up the scanners",
  "Setting the stage",
  "Raising the lights",
  "Almost on stage",
];

export function Connect({ knownRoomIds }: { knownRoomIds: string[] }) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [state, setState] = useState<"idle" | "starting" | "waiting" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [phase, setPhase] = useState(0);

  const busy = state === "starting" || state === "waiting";

  // rotate the backstage phrases while we wait
  useEffect(() => {
    if (!busy) { setPhase(0); return; }
    const iv = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 2200);
    return () => clearInterval(iv);
  }, [busy]);

  async function start() {
    setState("starting");
    try {
      await api.startRun(target.trim() || undefined);
      setState("waiting");
      const known = new Set(knownRoomIds);
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        await api.refreshAll().catch(() => {});
        const { runs } = await api.listRuns();
        const fresh = runs.find((r) => !known.has(r.room_id));
        if (fresh) {
          router.push(`/run/${fresh.room_id}/stage?live=1`);
          return;
        }
      }
      setState("error");
      setMsg("The run started but no room appeared yet — check Runs below in a moment.");
    } catch (e) {
      setState("error");
      setMsg(`Could not start a run: ${(e as Error).message}`);
    }
  }

  return (
    <div className="connect">
      <div className="connect-row">
        <input
          className="connect-input"
          placeholder="Repository to audit — a GitHub URL, or leave blank for the bundled test repo"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={busy}
        />
        <button className="btn btn-primary" onClick={start} disabled={busy}>
          <Icon name={busy ? "clock" : "play"} />
          {busy ? "Performing…" : "Start an audit"}
        </button>
      </div>
      <div className="connect-note">
        {busy ? (
          <span className="connect-live">
            <span className="cl-orb"><i /><i /><i /></span>
            <span key={phase} className="cl-phase">{PHASES[phase]}…</span>
          </span>
        ) : (
          msg || "A live run: the workforce audits the repo through Band. It uses model credits — start one deliberately."
        )}
      </div>
    </div>
  );
}
