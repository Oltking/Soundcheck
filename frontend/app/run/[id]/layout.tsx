import "../../stage.css";
import Link from "next/link";
import { api } from "@/lib/api";
import { RunTabs } from "@/components/run-tabs";
import { Icon } from "@/components/glyphs";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";

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

  return (
    <main className="page" style={{ maxWidth: 1460 }}>
      <div className="run-bar">
        <div className="run-bar-left">
          <Link href="/" className="run-back"><Icon name="chevron" /> Runs</Link>
          <span className="run-id mono">{id.slice(0, 8)}</span>
          {run && (
            <span className="run-counts mono">
              {run.finding_count} findings · {run.control_count} controls · {run.patch_count} patches · {run.approval_count} approvals
            </span>
          )}
        </div>
        <RunTabs roomId={id} />
      </div>
      {children}
    </main>
  );
}
