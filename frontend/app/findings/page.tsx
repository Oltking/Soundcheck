import { api } from "@/lib/api";
import { Icon, SevChip, sevKind } from "@/components/glyphs";
import type { FindingEntry, Run } from "@/lib/types";

export const dynamic = "force-dynamic";

function sevClass(sev: string): string {
  const k = sevKind(sev);
  return k === "critical" ? "crit" : k === "attention" ? "att" : "inf";
}

export default async function Findings({
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
  let findings: FindingEntry[] = [];
  if (roomId) {
    try {
      findings = (await api.findings(roomId)).findings;
    } catch {
      /* room not cached */
    }
  }

  findings.sort((a, b) => {
    const rank = (s: string) => (sevKind(s) === "critical" ? 0 : sevKind(s) === "attention" ? 1 : 2);
    return rank(a.severity) - rank(b.severity);
  });

  return (
    <main className="page">
      <div className="page-head">
        <h1>Findings</h1>
        <div className="sub">
          {roomId ? <>Run <span className="mono">{roomId.slice(0, 8)}</span> · {findings.length} findings, each with its reasoning, evidence, and control mapping.</> : "No run selected."}
        </div>
      </div>

      {findings.length === 0 && (
        <div className="empty"><Icon name="sparkle" /><p>No findings for this run.</p></div>
      )}

      {findings.map((f) => {
        const title = (f.content || "").split("\n")[0];
        const evidence = (f.content || "").split("\n").slice(1).join(" ");
        return (
          <div key={f.id} className={`finding-card ${sevClass(f.severity)}`}>
            <div className="fc-top">
              <div className="fc-title">{title}</div>
              <SevChip kind={sevKind(f.severity)} label={f.severity} />
            </div>
            {f.thought && <div className="fc-thought">{f.thought}</div>}
            <div className="fc-meta">
              {evidence && <span className="mono">{evidence}</span>}
              {f.controls.map((c) => (
                <span key={c.id} className="ctrl">{(c.content || "").replace("\n", " ")}</span>
              ))}
              {f.sender && <span className="by">@{f.sender}</span>}
            </div>
          </div>
        );
      })}
    </main>
  );
}
