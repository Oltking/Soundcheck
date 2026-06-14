import { api } from "@/lib/api";
import { StageView } from "@/components/stage-view";
import type { FindingEntry, TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunStage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ live?: string }>;
}) {
  const { id } = await params;
  const { live } = await searchParams;
  let timeline: TimelineItem[] = [];
  let findings: FindingEntry[] = [];
  try {
    [timeline, findings] = await Promise.all([
      api.timeline(id).then((r) => r.timeline),
      api.findings(id).then((r) => r.findings),
    ]);
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }
  return <StageView roomId={id} initialTimeline={timeline} initialFindings={findings} live={live === "1"} />;
}
