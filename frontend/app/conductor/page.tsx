import Link from "next/link";
import { api, BFF_BASE } from "@/lib/api";
import { Icon, SevGlyph } from "@/components/glyphs";
import type { ProvenanceNode, Run } from "@/lib/types";

export const dynamic = "force-dynamic";

function first<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length ? arr[0] : undefined;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function ChainView({ node, depth = 0 }: { node: ProvenanceNode; depth?: number }) {
  return (
    <div className="node" style={{ marginLeft: depth ? 14 : 0 }}>
      <div className="nk">{node.kind}{node.status === "superseded" ? " · superseded (retake)" : ""}</div>
      <div className="nc">{(node.content || "").split("\n")[0]}</div>
      {node.thought && <div className="nt">{node.thought}</div>}
      {node.references.map((r) => <ChainView key={r.id} node={r} depth={depth + 1} />)}
    </div>
  );
}

export default async function Conductor({
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
  const remediations = runs.filter((r) => r.patch_count > 0);
  const roomId = run || remediations[0]?.room_id;

  if (!roomId) {
    return (
      <main className="page">
        <div className="page-head"><h1>The Conductor</h1>
          <div className="sub">No remediation runs yet. The approval record appears once a Fixer proposes a patch.</div></div>
        <div className="empty"><Icon name="check" /><p>Nothing awaiting authority.</p></div>
      </main>
    );
  }

  const detail = await api.runDetail(roomId);
  const lk = detail.ledger_by_kind;
  const patch = first(lk.PatchProposal);
  const review = first(lk.ReviewResult);
  const approval = first(lk.Approval);
  const approved = !!approval;

  let chain: ProvenanceNode | null = null;
  const chainRoot = approval || review || patch;
  if (chainRoot) {
    try { chain = (await api.chain(roomId, chainRoot.id)).chain; } catch { /* */ }
  }

  const verdict = (review?.tags.find((t) => t.startsWith("verdict:")) || "verdict:—").split(":")[1];

  return (
    <main className="page" style={{ maxWidth: 920 }}>
      <div className="page-head">
        <h1>The Conductor</h1>
        <div className="sub">
          Authority record for run <span className="mono">{roomId.slice(0, 8)}</span> — no PR ships without your sign-off.
        </div>
        {remediations.length > 1 && (
          <div className="run-switch">
            {remediations.map((r) => (
              <Link key={r.room_id} href={`/conductor?run=${r.room_id}`} className={r.room_id === roomId ? "on" : ""}>
                {r.room_id.slice(0, 8)}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* the authority seal */}
      <div className={`seal ${approved ? "approved" : "pending"}`}>
        <div className="seal-mark">
          {approved ? <SevGlyph kind="approved" /> : <Icon name="clock" />}
        </div>
        <div className="seal-body">
          <div className="seal-state">{approved ? "Approved" : "Awaiting the Conductor"}</div>
          <div className="seal-meta mono">
            {approved
              ? <>{(approval!.tags.find((t) => t.startsWith("approver:")) || "approver:you").split(":")[1]} · {fmt(approval!.created_at)}</>
              : <>reply <b>@Stage Manager APPROVE</b> in the Band room to authorize</>}
          </div>
        </div>
      </div>

      {/* the proposed patch */}
      {patch && (
        <section className="gov-card">
          <h3><Icon name="handoff" /> Proposed patch</h3>
          <div className="gc-title">{(patch.content || "").split("\n")[0]}</div>
          <pre className="gc-pre">{(patch.content || "").split("\n").slice(1).join("\n")}</pre>
          <div className="gc-thought"><span>Fixer&apos;s rationale</span>{patch.thought}</div>
          <div className="gc-by mono">@{(patch.sender || "fixer").toLowerCase().replace(/\s+/g, "-")}</div>
        </section>
      )}

      {/* the cross-model review */}
      {review && (
        <section className="gov-card">
          <h3><Icon name="check" /> Review <span className={`verdict v-${verdict}`}>{verdict?.toUpperCase()}</span></h3>
          <div className="gc-thought"><span>Reviewer&apos;s reasoning (a different model than the Fixer)</span>{review.thought}</div>
          <div className="gc-by mono">@{(review.sender || "reviewer").toLowerCase().replace(/\s+/g, "-")}</div>
        </section>
      )}

      {/* the provenance chain */}
      {chain && (
        <section className="gov-card">
          <h3><Icon name="tape" /> Provenance chain</h3>
          <div className="sub" style={{ marginBottom: "var(--s3)" }}>
            Reconstructed from the Band ledger — the auditor&apos;s deliverable.
          </div>
          <div className="chain"><ChainView node={chain} /></div>
        </section>
      )}

      <div className="gov-foot">
        <a className="btn" href={`${BFF_BASE}/runs/${roomId}/audit-package`} target="_blank" rel="noreferrer">
          <Icon name="arrowUpRight" /> Export audit package (JSON)
        </a>
      </div>
    </main>
  );
}
