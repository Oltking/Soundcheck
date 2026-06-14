import { api } from "@/lib/api";
import { Icon, SevChip, sevKind } from "@/components/glyphs";
import type { FindingEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

function sevClass(sev: string): string {
  const k = sevKind(sev);
  return k === "critical" ? "crit" : k === "attention" ? "att" : "inf";
}

export default async function RunFindings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let findings: FindingEntry[] = [];
  try {
    findings = (await api.findings(id)).findings;
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }

  findings.sort((a, b) => {
    const rank = (s: string) => (sevKind(s) === "critical" ? 0 : sevKind(s) === "attention" ? 1 : 2);
    return rank(a.severity) - rank(b.severity);
  });

  if (findings.length === 0) {
    return <div className="empty"><Icon name="sparkle" /><p>No findings for this run.</p></div>;
  }

  return (
    <div style={{ marginTop: "var(--s4)" }}>
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
    </div>
  );
}
