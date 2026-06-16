import Link from "next/link";
import { api } from "@/lib/api";
import { Connect } from "@/components/connect";
import { Icon } from "@/components/glyphs";
import { runName, runShortId, runStatus } from "@/lib/run-name";
import type { Run } from "@/lib/types";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Runs" };

export default async function AppHome() {
  let runs: Run[] = [];
  let error: string | null = null;
  try {
    runs = (await api.listRuns()).runs;
  } catch (e) {
    error = `Could not reach the backend (BFF) on :8000. (${(e as Error).message})`;
  }

  return (
    <main className="page">
      <section className="launch">
        <div className="launch-kicker mono">the conductor’s desk</div>
        <h1>Start an audit, or open a run.</h1>
        <p>Connect a repository and the band performs — audit, control-mapping, fix, cross-model review — all through Band, all replayable. You approve every change.</p>
        <Connect knownRoomIds={runs.map((r) => r.room_id)} />
      </section>

      <div className="runs-head">
        <h2>Runs</h2>
        <span className="sub">each audit is one Band room — the system of record</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!error && runs.length === 0 && (
        <div className="empty"><Icon name="tape" /><p>No runs yet. Connect a repository above to start your first audit.</p></div>
      )}

      <div className="run-grid">
        {runs.map((r) => {
          const status = runStatus(r);
          return (
            <Link key={r.room_id} href={`/run/${r.room_id}/stage`} className="run-card">
              <div className="rc-row">
                <span className="rc-name">{runName(r.room_id)}</span>
                <span className={`sev sev-${status.kind} rc-status`}>{status.label}</span>
              </div>
              <div className="rc-idrow">
                <span className="rc-id">{runShortId(r.room_id)}</span>
                <span className="rc-when">{when(r.created_at)}</span>
              </div>
              <div className="rc-stats">
                <span className="stat"><b className="tnum">{r.finding_count}</b><span>findings</span></span>
                <span className="stat"><b className="tnum">{r.control_count}</b><span>controls</span></span>
                <span className="stat"><b className="tnum">{r.patch_count}</b><span>patches</span></span>
                <span className="stat"><b className="tnum">{r.approval_count}</b><span>approvals</span></span>
                <span className="stat"><b className="tnum">{r.task_count}</b><span>tasks</span></span>
                <span className="stat"><b className="tnum">{r.message_count}</b><span>chats</span></span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
