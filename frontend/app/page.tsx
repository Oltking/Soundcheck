import Link from "next/link";
import { api } from "@/lib/api";
import { Icon } from "@/components/glyphs";
import type { Run } from "@/lib/types";

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const dynamic = "force-dynamic";

export default async function Home() {
  let runs: Run[] = [];
  let error: string | null = null;
  try {
    runs = (await api.listRuns()).runs;
  } catch (e) {
    error = `Could not reach the backend (BFF). Is it running on :8000? (${(e as Error).message})`;
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Runs</h1>
        <div className="sub">
          Every audit is one Band room — the system of record. Postgres-free read cache; refresh to pull the latest from Band.
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!error && runs.length === 0 && (
        <div className="empty">
          <Icon name="tape" />
          <p>No runs projected yet.<br />Start an audit, then refresh to see it here.</p>
        </div>
      )}

      <div className="run-grid">
        {runs.map((r) => (
          <Link key={r.room_id} href={`/stage?run=${r.room_id}`} className="run-card">
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
