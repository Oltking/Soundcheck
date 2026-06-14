import Link from "next/link";
import { api } from "@/lib/api";
import { Icon } from "@/components/glyphs";
import { TapeView } from "@/components/tape-view";
import type { Run, TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Tape({
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
  const roomId = run || runs.find((r) => r.finding_count > 0)?.room_id || runs[0]?.room_id;

  let timeline: TimelineItem[] = [];
  if (roomId) {
    try { timeline = (await api.timeline(roomId)).timeline; } catch { /* */ }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>The Master Tape</h1>
        <div className="sub">
          {roomId ? <>Scrubbable replay of run <span className="mono">{roomId.slice(0, 8)}</span> — {timeline.length} moments, the whole session on the tape.</> : "No runs."}
        </div>
        {runs.length > 1 && (
          <div className="run-switch">
            {runs.filter((r) => r.finding_count > 0 || r.patch_count > 0).map((r) => (
              <Link key={r.room_id} href={`/tape?run=${r.room_id}`} className={r.room_id === roomId ? "on" : ""}>
                {r.room_id.slice(0, 8)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {timeline.length === 0 ? (
        <div className="empty"><Icon name="tape" /><p>Nothing recorded for this run.</p></div>
      ) : (
        <TapeView timeline={timeline} />
      )}
    </main>
  );
}
