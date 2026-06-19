import Link from "next/link";
import { api } from "@/lib/api";
import { auth } from "@/auth";
import { ownedRoomIds } from "@/lib/owner";
import { SevGlyph, sevKind } from "@/components/glyphs";
import { runName, runShortId } from "@/lib/run-name";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Posture" };

export default async function Posture() {
  const session = await auth();
  let runs: Run[] = [];
  try {
    runs = (await api.listRuns()).runs;
    if (session?.user?.id) {
      const owned = await ownedRoomIds(session.user.id);
      runs = runs.filter((r) => owned.has(r.room_id));
    }
  } catch {
    return <main className="page"><div className="error-banner">Backend (BFF) unreachable on :8000.</div></main>;
  }

  const totals = runs.reduce(
    (a, r) => ({
      findings: a.findings + r.finding_count,
      controls: a.controls + r.control_count,
      patches: a.patches + r.patch_count,
      approvals: a.approvals + r.approval_count,
    }),
    { findings: 0, controls: 0, patches: 0, approvals: 0 },
  );

  // severity + framework mix from the runs that produced findings
  const withFindings = runs.filter((r) => r.finding_count > 0);
  const sev = { critical: 0, attention: 0, info: 0 };
  const frameworks: Record<string, number> = {};
  for (const r of withFindings) {
    try {
      const { findings } = await api.findings(r.room_id);
      for (const f of findings) {
        const k = sevKind(f.severity);
        sev[k === "critical" ? "critical" : k === "attention" ? "attention" : "info"]++;
        for (const c of f.controls) {
          const fw = (c.content || "").split(" ")[0];
          if (fw) frameworks[fw] = (frameworks[fw] || 0) + 1;
        }
      }
    } catch { /* */ }
  }
  const sevTotal = sev.critical + sev.attention + sev.info || 1;

  return (
    <main className="page">
      <div className="page-head">
        <h1>Posture</h1>
        <div className="sub">Longitudinal view across {runs.length} runs - open findings, controls mapped, remediation shipped.</div>
      </div>

      <div className="posture-stats">
        {[
          ["findings", totals.findings, "findings flagged"],
          ["controls", totals.controls, "controls mapped"],
          ["patches", totals.patches, "patches proposed"],
          ["approvals", totals.approvals, "human approvals"],
        ].map(([k, v, label]) => (
          <div key={k as string} className="pstat">
            <b className="tnum">{v as number}</b>
            <span>{label as string}</span>
          </div>
        ))}
      </div>

      <div className="posture-grid">
        <section className="gov-card">
          <h3>Severity mix</h3>
          <div className="sevbar">
            <i className="s-crit" style={{ width: `${(sev.critical / sevTotal) * 100}%` }} />
            <i className="s-att" style={{ width: `${(sev.attention / sevTotal) * 100}%` }} />
            <i className="s-inf" style={{ width: `${(sev.info / sevTotal) * 100}%` }} />
          </div>
          <div className="sevlegend">
            <span style={{ color: "var(--severe)" }}><SevGlyph kind="critical" /> {sev.critical} high</span>
            <span style={{ color: "var(--attention)" }}><SevGlyph kind="attention" /> {sev.attention} review</span>
            <span style={{ color: "var(--info)" }}><SevGlyph kind="info" /> {sev.info} info</span>
          </div>
        </section>

        <section className="gov-card">
          <h3>By framework</h3>
          {Object.keys(frameworks).length === 0 ? <div className="sub">No control mappings yet.</div> : (
            <div className="fwlist">
              {Object.entries(frameworks).sort((a, b) => b[1] - a[1]).map(([fw, n]) => (
                <div key={fw} className="fwrow"><span className="mono">{fw}</span><b className="tnum">{n}</b></div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="gov-card">
        <h3>Run history</h3>
        <div className="runhist">
          {runs.map((r) => (
            <Link key={r.room_id} href={`/run/${r.room_id}/stage`} className="rh-row">
              <span className="rh-name">{runName(r.room_id)} <span className="mono rh-id">{runShortId(r.room_id)}</span></span>
              <span className="rh-when">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}</span>
              <span className="rh-bar"><i style={{ width: `${Math.min(100, r.finding_count * 1.5)}%` }} /></span>
              <span className="tnum rh-n">{r.finding_count} findings</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
