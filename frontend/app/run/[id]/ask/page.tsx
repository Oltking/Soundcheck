import { api } from "@/lib/api";
import { AskBand } from "@/components/ask-band";
import type { TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunAsk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let timeline: TimelineItem[] = [];
  try {
    timeline = (await api.timeline(id)).timeline;
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }
  return <div style={{ marginTop: "var(--s4)" }}><AskBand roomId={id} initialTimeline={timeline} /></div>;
}
