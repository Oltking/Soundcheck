import { api } from "@/lib/api";
import type { Run, TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

// Placeholder Stage — the full animated concert-hall Stage is built next.
// For now it proves the live timeline pipe (messages + events from Band).
export default async function Stage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;
  let runs: Run[] = [];
  try {
    runs = (await api.listRuns()).runs;
  } catch {
    return <main className="page"><div className="error-banner">Backend (BFF) unreachable on :8000.</div></main>;
  }
  const roomId = run || runs[0]?.room_id;
  let timeline: TimelineItem[] = [];
  if (roomId) {
    try { timeline = (await api.timeline(roomId)).timeline; } catch { /* not cached */ }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>The Stage</h1>
        <div className="sub">
          {roomId ? <>Live conversation for run <span className="mono">{roomId.slice(0, 8)}</span> — {timeline.length} messages & events through Band. (Animated stage view coming next.)</> : "No run."}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
        {timeline.map((m) => (
          <div key={m.id} style={{
            background: "var(--surface-2)", border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)", padding: "var(--s3)", fontSize: "var(--t-sm)",
          }}>
            <span className="mono" style={{ color: "var(--ink-3)", fontSize: "var(--t-xs)" }}>
              [{m.mtype}] {m.sender}
            </span>
            <div>{(m.content || "").slice(0, 200)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
