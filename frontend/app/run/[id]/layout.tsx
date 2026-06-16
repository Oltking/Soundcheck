import "../../stage.css";
import Link from "next/link";
import { api } from "@/lib/api";
import { RunTabs } from "@/components/run-tabs";
import { Icon, SevGlyph } from "@/components/glyphs";
import { runName, runShortId, runStatus } from "@/lib/run-name";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: runName(id) };
}

export default async function RunLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let run: Run | null = null;
  try {
    run = (await api.listRuns()).runs.find((r) => r.room_id === id) || null;
    if (!run) { await api.refreshOne(id); run = (await api.listRuns()).runs.find((r) => r.room_id === id) || null; }
  } catch { /* BFF down — children will surface it */ }

  const status = run ? runStatus(run) : null;

  // the lifecycle, derived from the ledger — so the next action is always obvious
  const steps = run ? [
    { label: "Audit", done: run.finding_count > 0, seg: "stage" },
    { label: "Map", done: run.control_count > 0, seg: "findings" },
    { label: "Fix", done: run.patch_count > 0, seg: "conductor" },
    { label: "Approve", done: run.approval_count > 0, seg: "conductor" },
    { label: "PR", done: run.approval_count > 0, seg: "conductor" },
  ] : [];
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <main className="page" style={{ maxWidth: 1640 }}>
      <div className="run-bar">
        <div className="run-bar-left">
          <Link href="/app" className="run-back"><Icon name="chevron" /> Runs</Link>
          <span className="run-id">{runName(id)}</span>
          <span className="run-id-chip mono">{runShortId(id)}</span>
          {status && (
            <span className={`sev sev-${status.kind} run-status`}>
              <SevGlyph kind={status.kind} />{status.label}
            </span>
          )}
        </div>
        <RunTabs roomId={id} />
      </div>
      {run && (
        <div className="run-counts-row">
          {([
            ["findings", run.finding_count],
            ["controls", run.control_count],
            ["patches", run.patch_count],
            ["approvals", run.approval_count],
            ["tasks", run.task_count],
            ["chats", run.message_count],
          ] as const).map(([label, n]) => (
            <span key={label} className="rcount"><b className="tnum">{n}</b>{label}</span>
          ))}
        </div>
      )}
      {run && (
        <div className="run-progress">
          {steps.map((s, i) => (
            <Link key={s.label + i} href={`/run/${id}/${s.seg}`}
              className={`rp-step ${s.done ? "done" : i === currentIdx ? "current" : "todo"}`}>
              <span className="rp-dot">{s.done ? <Icon name="check" /> : i + 1}</span>
              <span className="rp-label">{s.label}</span>
            </Link>
          ))}
        </div>
      )}
      {children}
    </main>
  );
}
