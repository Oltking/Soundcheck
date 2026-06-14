import { api } from "@/lib/api";
import { Icon } from "@/components/glyphs";
import { TapeView } from "@/components/tape-view";
import type { TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunTape({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let timeline: TimelineItem[] = [];
  try {
    timeline = (await api.timeline(id)).timeline;
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }
  if (timeline.length === 0) {
    return <div className="empty" style={{ marginTop: "var(--s5)" }}><Icon name="tape" /><p>Nothing recorded for this run.</p></div>;
  }
  return <div style={{ marginTop: "var(--s4)" }}><TapeView timeline={timeline} /></div>;
}
