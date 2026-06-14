import Link from "next/link";
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

  // Default to the newest run that actually has findings (the newest run may be
  // a remediation room with patches but zero findings).
  const roomId = run || runs.find((r) => r.finding_count > 0)?.room_id || runs[0]?.room_id;
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
        {runs.filter((r) => r.finding_count > 0).length > 1 && (
          <div className="run-switch">
            {runs.filter((r) => r.finding_count > 0).map((r) => (
              <Link key={r.room_id} href={`/findings?run=${r.room_id}`}
                    className={r.room_id === roomId ? "on" : ""}>
                {r.room_id.slice(0, 8)} · {r.finding_count}
              </Link>
            ))}
          </div>
        )}
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
