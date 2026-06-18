"use client";

// The Encore — the post-session curtain call. When the set is over, the band
// takes a bow: a deterministic retrospective computed entirely from the Band
// projection (timeline + findings + ledger), so it always works and is fully
// replayable. This is the foundation the "continue the work" and the agent-voiced
// narration build on next. No model tokens spent here.

import { useMemo, useState } from "react";
import Link from "next/link";
import { INSTRUMENTS, Icon, SevGlyph, sevKind } from "@/components/glyphs";
import { FixButton } from "@/components/fix-button";
import { api } from "@/lib/api";
import type { FindingEntry, LedgerEntry, TimelineItem } from "@/lib/types";

const FILE_RE = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})(?::\d+)?/;
const PR_RE = /https?:\/\/github\.com\/[^\s)]+\/pull\/\d+/i;

function roleOf(name: string): { inst: keyof typeof INSTRUMENTS; role: string } {
  const n = name.toLowerCase();
  if (n.includes("bandleader")) return { inst: "bandleader", role: "orchestrator" };
  if (n.includes("scout")) return { inst: "scout", role: "reconnaissance" };
  if (n.includes("code")) return { inst: "scanner", role: "static analysis" };
  if (n.includes("depend")) return { inst: "scanner", role: "dependency audit" };
  if (n.includes("secret")) return { inst: "fixer", role: "secrets & config" };
  if (n.includes("complian") || n.includes("mapper")) return { inst: "mapper", role: "control mapping" };
  if (n.includes("fixer")) return { inst: "fixer", role: "remediation" };
  if (n.includes("review")) return { inst: "reviewer", role: "verification" };
  if (n.includes("stage")) return { inst: "conductor", role: "production" };
  if (n.includes("customer") || n.includes("service")) return { inst: "scout", role: "front of house" };
  return { inst: "scanner", role: "specialist" };
}

interface Bow {
  name: string;
  inst: keyof typeof INSTRUMENTS;
  role: string;
  line: string;       // the one-line "what I did"
  first: string;      // first-seen timestamp (entrance order)
}

export function Encore({
  roomId, timeline, findings, ledger,
}: {
  roomId: string;
  timeline: TimelineItem[];
  findings: FindingEntry[];
  ledger: Record<string, LedgerEntry[]>;
}) {
  const debrief = useMemo(() => {
    const patches = ledger.PatchProposal || [];
    const reviews = ledger.ReviewResult || [];
    const approvals = ledger.Approval || [];
    const controls = ledger.ControlMapping || [];

    const verdictOf = (r: LedgerEntry) =>
      (r.tags.find((t) => t.startsWith("verdict:")) || "verdict:—").split(":")[1];
    const passed = reviews.filter((r) => verdictOf(r) === "pass").length;
    const revised = reviews.filter((r) => verdictOf(r) === "revise").length;

    // severity mix
    const sev = { critical: 0, attention: 0, info: 0 };
    for (const f of findings) {
      const k = sevKind(f.severity);
      if (k === "critical") sev.critical++; else if (k === "attention") sev.attention++; else sev.info++;
    }
    const fixable = findings.filter((f) => FILE_RE.test(f.content || "")).length;

    // PRs mentioned anywhere in the conversation
    const prs = Array.from(new Set(
      timeline.map((m) => (m.content || "").match(PR_RE)?.[0]).filter(Boolean) as string[]
    ));

    // ---- the bows: every player who appeared, with a contribution line ----
    const norm = (s: string | null | undefined) => (s || "").trim();
    const eq = (a: string | null | undefined, b: string) => norm(a).toLowerCase() === b.toLowerCase();
    const byName = new Map<string, { first: string; msgs: number; tasks: number }>();
    for (const m of timeline) {
      if (m.sender_type === "User") continue;
      const name = norm(m.sender);
      if (!name || name === "?") continue;
      const cur = byName.get(name) || { first: m.created_at || "", msgs: 0, tasks: 0 };
      if (m.mtype === "text") cur.msgs++;
      if (m.mtype === "task") cur.tasks++;
      if ((m.created_at || "") < cur.first || !cur.first) cur.first = m.created_at || cur.first;
      byName.set(name, cur);
    }
    // make sure ledger authors are represented even if they never posted text
    for (const e of [...findings, ...patches, ...reviews, ...approvals, ...controls]) {
      const name = norm(e.sender);
      if (name && !byName.has(name)) byName.set(name, { first: e.created_at || "", msgs: 0, tasks: 0 });
    }

    const bows: Bow[] = [...byName.entries()].map(([name, c]) => {
      const { inst, role } = roleOf(name);
      const fBy = findings.filter((f) => eq(f.sender, name)).length;
      const cBy = controls.filter((e) => eq(e.sender, name)).length;
      const pBy = patches.filter((e) => eq(e.sender, name)).length;
      const rPass = reviews.filter((e) => eq(e.sender, name) && verdictOf(e) === "pass").length;
      const rRev = reviews.filter((e) => eq(e.sender, name) && verdictOf(e) === "revise").length;
      const aBy = approvals.filter((e) => eq(e.sender, name)).length;

      const bits: string[] = [];
      if (fBy) bits.push(`flagged ${fBy} finding${fBy === 1 ? "" : "s"}`);
      if (cBy) bits.push(`mapped ${cBy} control${cBy === 1 ? "" : "s"}`);
      if (pBy) bits.push(`proposed ${pBy} patch${pBy === 1 ? "" : "es"}`);
      if (rPass || rRev) bits.push(`reviewed ${rPass + rRev} — ${rPass} passed, ${rRev} sent back`);
      if (aBy) bits.push("recorded the approval");
      if (!bits.length) bits.push(`${c.msgs} message${c.msgs === 1 ? "" : "s"}, ${c.tasks} task${c.tasks === 1 ? "" : "s"}`);
      return { name, inst, role, line: bits.join(" · "), first: c.first };
    }).sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : 0));

    // ---- unfinished business ----
    const pendingApproval = Math.max(0, patches.length - approvals.length - revised);
    const open: { label: string; n: number }[] = [];
    if (revised) open.push({ label: "patches sent back for rework", n: revised });
    if (pendingApproval) open.push({ label: "patches awaiting your sign-off", n: pendingApproval });
    const unaddressed = Math.max(0, fixable - patches.length);
    if (unaddressed) open.push({ label: "fixable findings not yet patched", n: unaddressed });

    // continue-the-work target: the most recent sent-back patch, recovered so the
    // Fixer can be sent back in (review.refs -> patch.id; patch.refs -> finding id).
    let continueTarget: { file: string; finding: string } | null = null;
    const revisedReviews = reviews.filter((r) => verdictOf(r) === "revise");
    if (revisedReviews.length) {
      const rev = revisedReviews[revisedReviews.length - 1];
      const p = patches.find((pp) => (rev.refs || []).includes(pp.id)) || patches[patches.length - 1];
      const file = p ? (p.content || "").match(/Files:\s*([^\n,]+)/)?.[1]?.trim() || "" : "";
      if (p && file) {
        const fnd = findings.find((f) => (p.refs || []).includes(f.id));
        const findingText = fnd ? (fnd.content || "").split("\n")[0] : (p.content || "").split("\n")[0];
        continueTarget = { file, finding: findingText };
      }
    }

    return {
      findings: findings.length, sev, controls: controls.length, fixable,
      patches: patches.length, passed, revised, approvals: approvals.length, prs,
      bows, open, continueTarget,
    };
  }, [timeline, findings, ledger]);

  const d = debrief;
  const summary =
    `${d.findings} finding${d.findings === 1 ? "" : "s"}` +
    (d.controls ? `, ${d.controls} mapped to controls` : "") +
    `. ${d.patches} fix${d.patches === 1 ? "" : "es"} proposed` +
    (d.passed || d.revised ? ` (${d.passed} passed, ${d.revised} sent back)` : "") +
    `, ${d.approvals} approved` +
    (d.prs.length ? `, ${d.prs.length} PR${d.prs.length === 1 ? "" : "s"} opened` : "") + ".";

  return (
    <div className="encore">
      <div className="encore-curtain" aria-hidden />
      <header className="encore-head">
        <span className="encore-kicker mono">the encore</span>
        <h1>That&apos;s a wrap.</h1>
        <p>{summary}</p>
      </header>

      <div className="encore-score">
        {([
          ["findings", d.findings],
          ["controls", d.controls],
          ["patches", d.patches],
          ["passed review", d.passed],
          ["sent back", d.revised],
          ["approved", d.approvals],
          ["PRs", d.prs.length],
        ] as const).map(([label, n]) => (
          <div key={label} className="es-tile">
            <b className="tnum">{n}</b><span>{label}</span>
          </div>
        ))}
      </div>

      {(d.sev.critical + d.sev.attention + d.sev.info) > 0 && (
        <div className="encore-mix">
          <span style={{ color: "var(--severe)" }}><SevGlyph kind="critical" /> {d.sev.critical} high</span>
          <span style={{ color: "var(--attention)" }}><SevGlyph kind="attention" /> {d.sev.attention} review</span>
          <span style={{ color: "var(--info)" }}><SevGlyph kind="info" /> {d.sev.info} info</span>
        </div>
      )}

      <section className="encore-bows">
        <h2>The band takes a bow</h2>
        <div className="bow-grid">
          {d.bows.map((b, i) => {
            const Inst = INSTRUMENTS[b.inst];
            return (
              <div key={b.name} className="bow" style={{ animationDelay: `${i * 110}ms` }}>
                <div className="bow-inst">{Inst()}</div>
                <div className="bow-id">
                  <div className="bow-name">{b.name}</div>
                  <div className="bow-role mono">{b.role}</div>
                </div>
                <div className="bow-line">{b.line}</div>
              </div>
            );
          })}
        </div>
      </section>

      {d.open.length > 0 ? (
        <section className="encore-open">
          <h2><Icon name="clock" /> Unfinished business</h2>
          <ul>
            {d.open.map((o) => (
              <li key={o.label}><b className="tnum">{o.n}</b> {o.label}</li>
            ))}
          </ul>
          <div className="encore-open-actions">
            {d.continueTarget && (
              <FixButton roomId={roomId} file={d.continueTarget.file} finding={d.continueTarget.finding}
                label="Send them back in" sentLabel="On it — opening the Stage…" />
            )}
            <Link href={`/run/${roomId}/stage`} className="btn">
              <Icon name="play" /> Back to the Stage
            </Link>
          </div>
        </section>
      ) : (
        <section className="encore-clear">
          <span className="ec-ico"><SevGlyph kind="approved" /></span>
          <div><b>Nothing left on the setlist.</b> Every proposed fix was reviewed and resolved.</div>
        </section>
      )}

      <PolishPanel
        roomId={roomId}
        initial={ledger.PolishNote || []}
        hasPatch={(ledger.PatchProposal || []).length > 0}
      />

      <footer className="encore-foot">
        {d.prs.map((u) => (
          <a key={u} className="btn" href={u} target="_blank" rel="noreferrer">
            <Icon name="arrowUpRight" /> View the pull request
          </a>
        ))}
        <Link href={`/run/${roomId}/findings`} className="btn"><Icon name="tape" /> Findings</Link>
        <Link href={`/run/${roomId}/conductor`} className="btn"><Icon name="check" /> Audit deliverable</Link>
        <Link href={`/run/${roomId}/tape`} className="btn"><Icon name="tape" /> Master Tape</Link>
      </footer>
    </div>
  );
}

// The Producer's notes — shows existing PolishNotes, or offers to generate them
// (OSS lane, written to Band) and polls for them to land.
function PolishPanel({ roomId, initial, hasPatch }: {
  roomId: string; initial: LedgerEntry[]; hasPatch: boolean;
}) {
  const [notes, setNotes] = useState<LedgerEntry[]>(initial);
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function ask() {
    setState("working");
    try {
      await api.polish(roomId);
      // poll for the notes to be written + projected (Producer takes ~10-30s)
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const d = await api.runDetail(roomId);
          const pn = d.ledger_by_kind.PolishNote || [];
          if (pn.length) { setNotes(pn); setState("idle"); return; }
        } catch { /* keep polling */ }
      }
      setState("idle");
    } catch {
      setState("error");
    }
  }

  if (notes.length) {
    return (
      <section className="encore-polish">
        <h2><Icon name="sparkle" /> The Producer&apos;s notes</h2>
        <p className="ep-sub">How the patched code could be polished further — suggestions only, nothing applied.</p>
        <div className="polish-list">
          {notes.map((n, i) => (
            <div key={n.id || i} className="polish-note">
              <span className="pn-mark"><Icon name="sparkle" /></span>
              <div className="pn-body">
                <div className="pn-title">{(n.content || "").split("\n")[0]}</div>
                {n.thought && <div className="pn-why">{n.thought}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!hasPatch) return null;
  return (
    <section className="encore-polish ask">
      <h2><Icon name="sparkle" /> The Producer&apos;s notes</h2>
      <p className="ep-sub">Ask the band how the patched code could be polished further — a few concrete, defensive-only next steps.</p>
      <button className="btn btn-primary" onClick={ask} disabled={state === "working"}>
        <Icon name={state === "working" ? "clock" : "sparkle"} />
        {state === "working" ? "The Producer is drafting…" : state === "error" ? "Retry" : "Ask for polish notes"}
      </button>
    </section>
  );
}
