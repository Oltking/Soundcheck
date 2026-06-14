import "../stage.css";
import { api } from "@/lib/api";
import { StageView } from "@/components/stage-view";
import type { FindingEntry, Run, TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Stage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; live?: string }>;
}) {
  const { run, live } = await searchParams;
  let runs: Run[] = [];
  try {
    runs = (await api.listRuns()).runs;
  } catch {
    return <main className="page"><div className="error-banner">Backend (BFF) unreachable on :8000.</div></main>;
  }
  const roomId = run || runs.find((r) => r.finding_count > 0)?.room_id || runs[0]?.room_id;

  if (!roomId) {
    return (
      <main className="page">
        <div className="page-head"><h1>The Stage</h1><div className="sub">No runs yet.</div></div>
      </main>
    );
  }

  // Fetch initial state server-side so the Stage renders instantly (then the
  // client polls only when ?live=1).
  let timeline: TimelineItem[] = [];
  let findings: FindingEntry[] = [];
  try {
    [timeline, findings] = await Promise.all([
      api.timeline(roomId).then((r) => r.timeline),
      api.findings(roomId).then((r) => r.findings),
    ]);
  } catch { /* not cached */ }

  return (
    <main className="page" style={{ maxWidth: 1320 }}>
      <StageView roomId={roomId} initialTimeline={timeline} initialFindings={findings} live={live === "1"} />
    </main>
  );
}
