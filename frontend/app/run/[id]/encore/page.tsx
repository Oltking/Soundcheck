import { api } from "@/lib/api";
import { Encore } from "@/components/encore";
import { Icon } from "@/components/glyphs";
import type { FindingEntry, LedgerEntry, TimelineItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RunEncore({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let timeline: TimelineItem[] = [];
  let findings: FindingEntry[] = [];
  let ledger: Record<string, LedgerEntry[]> = {};
  try {
    const [t, f, d] = await Promise.all([
      api.timeline(id).then((r) => r.timeline),
      api.findings(id).then((r) => r.findings),
      api.runDetail(id).then((r) => r.ledger_by_kind).catch(() => ({})),
    ]);
    timeline = t; findings = f; ledger = d;
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }

  if (timeline.length === 0 && findings.length === 0) {
    return (
      <div className="empty" style={{ marginTop: "var(--s5)" }}>
        <Icon name="sparkle" />
        <p>No set to recap yet.<br />The Encore appears once the band has performed.</p>
      </div>
    );
  }

  return <Encore roomId={id} timeline={timeline} findings={findings} ledger={ledger} />;
}
