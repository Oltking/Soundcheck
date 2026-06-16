import { api, BFF_BASE } from "@/lib/api";
import { Icon, SevGlyph } from "@/components/glyphs";
import { CopyLink } from "@/components/copy-link";
import { ApproveAction } from "@/components/approve-action";
import type { ProvenanceNode } from "@/lib/types";

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

export default async function RunConductor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail;
  try {
    detail = await api.runDetail(id);
  } catch {
    return <div className="error-banner">Backend (BFF) unreachable on :8000.</div>;
  }
  const lk = detail.ledger_by_kind;
  const patch = first(lk.PatchProposal);
  const review = first(lk.ReviewResult);
  const approval = first(lk.Approval);
  const approved = !!approval;

  if (!patch && !review && !approval) {
    return (
      <div className="empty" style={{ marginTop: "var(--s5)" }}>
        <Icon name="check" />
        <p>No remediation on this run yet.<br />The authority record appears once a Fixer proposes a patch.</p>
      </div>
    );
  }

  let chain: ProvenanceNode | null = null;
  const chainRoot = approval || review || patch;
  if (chainRoot) {
    try { chain = (await api.chain(id, chainRoot.id)).chain; } catch { /* */ }
  }
  const verdict = (review?.tags.find((t) => t.startsWith("verdict:")) || "verdict:—").split(":")[1];

  return (
    <div style={{ marginTop: "var(--s4)" }}>
      <div className={`seal ${approved ? "approved" : "pending"}`}>
        <div className="seal-mark">{approved ? <SevGlyph kind="approved" /> : <Icon name="clock" />}</div>
        <div className="seal-body">
          <div className="seal-state">{approved ? "Approved" : "Awaiting your approval"}</div>
          <div className="seal-meta mono">
            {approved
              ? <>{(approval!.tags.find((t) => t.startsWith("approver:")) || "approver:you").split(":")[1]} · {fmt(approval!.created_at)}</>
              : <>you hold the baton — nothing ships until you authorize</>}
          </div>
        </div>
      </div>

      {!approved && (patch || review) && <ApproveAction roomId={id} />}

      {patch && (
        <section className="gov-card">
          <h3><Icon name="handoff" /> Proposed patch</h3>
          <div className="gc-title">{(patch.content || "").split("\n")[0]}</div>
          <pre className="gc-pre">{(patch.content || "").split("\n").slice(1).join("\n")}</pre>
          <div className="gc-thought"><span>Fixer&apos;s rationale</span>{patch.thought}</div>
          <div className="gc-by mono">@{(patch.sender || "fixer").toLowerCase().replace(/\s+/g, "-")}</div>
        </section>
      )}

      {review && (
        <section className="gov-card">
          <h3><Icon name="check" /> Review <span className={`verdict v-${verdict}`}>{verdict?.toUpperCase()}</span></h3>
          <div className="gc-thought"><span>Reviewer&apos;s reasoning (a different model than the Fixer)</span>{review.thought}</div>
          <div className="gc-by mono">@{(review.sender || "reviewer").toLowerCase().replace(/\s+/g, "-")}</div>
        </section>
      )}

      {chain && (
        <section className="gov-card">
          <h3><Icon name="tape" /> Provenance chain</h3>
          <div className="sub" style={{ marginBottom: "var(--s3)" }}>Reconstructed from the Band ledger — the auditor&apos;s deliverable.</div>
          <div className="chain"><ChainView node={chain} /></div>
        </section>
      )}

      <section className="deliverable">
        <div className="dl-body">
          <h3><Icon name="tape" /> Audit deliverable</h3>
          <p>
            A self-contained, provenance-complete record — the seal, the patch, the cross-model
            review, and the full chain back to the Band ledger. The artifact an auditor receives.
          </p>
        </div>
        <div className="dl-actions">
          <a className="btn btn-primary" href={`${BFF_BASE}/runs/${id}/audit-package`} target="_blank" rel="noreferrer">
            <Icon name="arrowUpRight" /> Export package (JSON)
          </a>
          <CopyLink />
        </div>
      </section>
    </div>
  );
}
