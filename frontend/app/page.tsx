import Link from "next/link";
import { api } from "@/lib/api";
import { Connect } from "@/components/connect";
import { Icon } from "@/components/glyphs";
import type { Run } from "@/lib/types";

function when(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const dynamic = "force-dynamic";

export default async function Home() {
  let runs: Run[] = [];
  let error: string | null = null;
  try {
    runs = (await api.listRuns()).runs;
  } catch (e) {
    error = `Could not reach the backend (BFF) on :8000. (${(e as Error).message})`;
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>A workforce that audits, fixes, and proves it.</h1>
        <p>
          Connect a repository and a band of specialist agents audits it, maps findings to
          compliance controls, proposes safe fixes, reviews them across models, and opens a PR —
          and <b>you approve every change</b>. Every step is recorded through Band and replayable.
        </p>
        <Connect knownRoomIds={runs.map((r) => r.room_id)} />
      </section>

      <div className="runs-head">
        <h2>Runs</h2>
        <span className="sub">each audit is one Band room — the system of record</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!error && runs.length === 0 && (
        <div className="empty"><Icon name="tape" /><p>No runs yet. Start one above.</p></div>
      )}

      <div className="run-grid">
        {runs.map((r) => (
          <Link key={r.room_id} href={`/run/${r.room_id}/stage`} className="run-card">
            <div className="rc-row">
              <span className="rc-id">{r.room_id.slice(0, 8)}</span>
              <span className="rc-when">{when(r.created_at)}</span>
            </div>
            <div className="rc-stats">
              <span className="stat"><b className="tnum">{r.finding_count}</b><span>findings</span></span>
              <span className="stat"><b className="tnum">{r.control_count}</b><span>controls</span></span>
              <span className="stat"><b className="tnum">{r.patch_count}</b><span>patches</span></span>
              <span className="stat"><b className="tnum">{r.approval_count}</b><span>approvals</span></span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
