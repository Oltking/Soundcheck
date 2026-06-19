import { api } from "@/lib/api";
import { Icon, SevChip, SevGlyph, sevKind, type SevKind } from "@/components/glyphs";
import { FixButton } from "@/components/fix-button";
import type { FindingEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

function sevClass(sev: string): string {
  const k = sevKind(sev);
  return k === "critical" ? "crit" : k === "attention" ? "att" : "inf";
}

// Best-effort file location from a finding's content (e.g. "app.py:23" → app.py).
const FILE_RE = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})(?::\d+)?/;
function fileOf(f: FindingEntry): string {
  const m = FILE_RE.exec(f.content || "");
  return m ? m[1] : "";
}

// Severity groups, in the order they should be read.
const GROUPS: { kind: SevKind; heading: string; blurb: string }[] = [
  { kind: "critical", heading: "High severity", blurb: "fix first - exploitable or sensitive" },
  { kind: "attention", heading: "Needs review", blurb: "judgement call - confirm and triage" },
  { kind: "info", heading: "Informational", blurb: "hygiene and lower-risk notes" },
];

function FindingCard({ f, roomId }: { f: FindingEntry; roomId: string }) {
  const title = (f.content || "").split("\n")[0];
  const evidence = (f.content || "").split("\n").slice(1).join(" ");
  const file = fileOf(f);
  return (
    <div className={`finding-card ${sevClass(f.severity)}`}>
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
      <div className="fc-actions">
        {file && <span className="fc-file mono">{file}</span>}
        <FixButton roomId={roomId} file={file} finding={title} />
      </div>
    </div>
  );
}

export default async function RunFindings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let findings: FindingEntry[] = [];
  try {
    findings = (await api.findings(id)).findings;
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }

  if (findings.length === 0) {
    return (
      <div className="empty" style={{ marginTop: "var(--s5)" }}>
        <Icon name="sparkle" />
        <p>No findings for this run.<br />Nothing flagged - or the audit hasn&apos;t produced findings yet.</p>
      </div>
    );
  }

  // bucket by severity kind
  const buckets: Record<SevKind, FindingEntry[]> = {
    critical: [], attention: [], info: [], approved: [], archive: [], live: [],
  };
  for (const f of findings) buckets[sevKind(f.severity)].push(f);
  const controlsMapped = findings.reduce((n, f) => n + f.controls.length, 0);

  return (
    <div style={{ marginTop: "var(--s4)" }}>
      <div className="findings-summary">
        <div className="fs-total">
          <b className="tnum">{findings.length}</b>
          <span>findings · {controlsMapped} controls mapped</span>
        </div>
        <div className="fs-mix">
          {GROUPS.map((g) => buckets[g.kind].length > 0 && (
            <span key={g.kind} className={`sev sev-${g.kind}`}>
              <SevGlyph kind={g.kind} />{buckets[g.kind].length} {g.heading.toLowerCase()}
            </span>
          ))}
        </div>
      </div>

      {GROUPS.map((g) => buckets[g.kind].length > 0 && (
        <section key={g.kind} className="finding-group">
          <div className="fg-head">
            <span className={`fg-mark sev-ink-${g.kind}`}><SevGlyph kind={g.kind} /></span>
            <h3>{g.heading}</h3>
            <span className="fg-count tnum">{buckets[g.kind].length}</span>
            <span className="fg-blurb">{g.blurb}</span>
          </div>
          {buckets[g.kind].map((f) => <FindingCard key={f.id} f={f} roomId={id} />)}
        </section>
      ))}
    </div>
  );
}
