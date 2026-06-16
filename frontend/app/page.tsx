import "./marketing.css";
import Link from "next/link";
import { Icon, INSTRUMENTS, SevGlyph } from "@/components/glyphs";
import { HeroStage } from "@/components/hero-stage";

export const metadata = {
  title: "Soundcheck — a workforce that audits, fixes, and proves it",
};

const STEPS = [
  { inst: "scout", n: "01", title: "Audit", body: "Scanners read the repo — static analysis, dependency CVEs, committed secrets." },
  { inst: "mapper", n: "02", title: "Map", body: "Every finding is mapped to SOC 2 / ISO 27001 controls — evidence, not noise." },
  { inst: "fixer", n: "03", title: "Fix", body: "The Fixer proposes a safe patch on an isolated branch. Main is never touched." },
  { inst: "reviewer", n: "04", title: "Review", body: "A different model reviews the diff — cross-model, never self-grading." },
  { inst: "conductor", n: "05", title: "Approve", body: "You authorize the change. No autonomous merges, ever." },
  { inst: "bandleader", n: "06", title: "Ship", body: "A pull request opens against the repo — opened for you, never merged." },
] as const;

const BAND = [
  { k: "scout", n: "Scout", role: "reconnaissance", lane: "open-source" },
  { k: "bandleader", n: "Bandleader", role: "orchestrator", lane: "frontier" },
  { k: "scanner", n: "Code Scanner", role: "static analysis", lane: "open-source" },
  { k: "scanner", n: "Dependency Auditor", role: "dependency CVEs", lane: "open-source" },
  { k: "fixer", n: "Secrets Sentinel", role: "committed secrets", lane: "open-source" },
  { k: "mapper", n: "Compliance Mapper", role: "control mapping", lane: "open-source" },
  { k: "fixer", n: "Fixer", role: "writes the patch", lane: "frontier" },
  { k: "reviewer", n: "Reviewer", role: "cross-model review", lane: "frontier" },
] as const;

export default function Marketing() {
  return (
    <div className="mk">
      {/* ---- header ---- */}
      <header className="mk-head">
        <Link href="/" className="mk-brand" aria-label="Soundcheck home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="mk-logo" src="/logo.png" alt="Soundcheck" width={36} height={36} />
          <span className="mk-wm">sound<b>check</b></span>
        </Link>
        <nav className="mk-nav">
          <a href="#how">How it works</a>
          <a href="#band">The band</a>
          <a href="#trust">Governance</a>
        </nav>
        <Link href="/app" className="mk-btn mk-btn-primary">Enter the app <Icon name="handoff" /></Link>
      </header>

      {/* ---- hero ---- */}
      <section className="mk-hero">
        <div className="mk-hero-glowbg" />
        <div className="mk-hero-inner">
          <div className="mk-eyebrow"><span className="dot" /> Built on Band · Band of Agents</div>
          <h1 className="mk-h1">
            Audit. Fix.<br /><span className="ital">Live on&nbsp;stage.</span>
          </h1>
          <p className="mk-sub">
            Soundcheck is a governed, replayable autonomous workforce for security &amp; compliance.
            A band of specialist agents audits your repo, maps findings to controls, proposes fixes,
            and reviews them across models — and <b>you approve every change</b>.
          </p>
          <div className="mk-cta-row">
            <Link href="/app" className="mk-btn mk-btn-primary lg">Start an audit <Icon name="handoff" /></Link>
            <a href="#how" className="mk-btn mk-btn-ghost lg">See how it works</a>
          </div>
          <ul className="mk-trust">
            <li><Icon name="check" /> You approve every change</li>
            <li><Icon name="check" /> Every step replayable</li>
            <li><Icon name="check" /> Defensive-only</li>
          </ul>
        </div>
        <div className="mk-hero-stage">
          <HeroStage />
          <div className="mk-hero-caption mono">live workforce · the thread of light is a real handoff</div>
        </div>
      </section>

      {/* ---- marquee strip ---- */}
      <section className="mk-strip">
        <div className="mk-strip-label mono">coordinated entirely through Band — no side channels</div>
        <div className="mk-chips">
          {["Band", "LangGraph", "SOC 2", "ISO 27001", "GitHub", "Provenance ledger", "Cross-model review"].map((c) => (
            <span key={c} className="mk-chip">{c}</span>
          ))}
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section id="how" className="mk-section">
        <div className="mk-sec-head">
          <div className="mk-kicker mono">how the set runs</div>
          <h2>Six moves, one Band room.</h2>
          <p>The same trail the agents perform is the trail you replay later. Nothing happens off the record.</p>
        </div>
        <ol className="mk-steps">
          {STEPS.map((s) => {
            const Inst = INSTRUMENTS[s.inst];
            return (
              <li key={s.title} className="mk-step">
                <div className="mk-step-ico">{Inst()}</div>
                <div className="mk-step-n mono">{s.n}</div>
                <div className="mk-step-title">{s.title}</div>
                <div className="mk-step-body">{s.body}</div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---- the band ---- */}
      <section id="band" className="mk-section mk-band">
        <div className="mk-sec-head">
          <div className="mk-kicker mono">the lineup</div>
          <h2>Eight specialists. Two providers. One room.</h2>
          <p>Genuinely heterogeneous agents — frontier and open-source models, across frameworks — coordinating only through Band.</p>
        </div>
        <div className="mk-band-grid">
          {BAND.map((p) => {
            const Inst = INSTRUMENTS[p.k];
            return (
              <div key={p.n} className="mk-player">
                <div className="mk-player-ico">{Inst()}</div>
                <div className="mk-player-id">
                  <b>{p.n}</b>
                  <span>{p.role}</span>
                </div>
                <span className={`mk-lane ${p.lane === "frontier" ? "f" : "o"}`}>{p.lane}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- governance / proof ---- */}
      <section id="trust" className="mk-section mk-split">
        <div className="mk-split-copy">
          <div className="mk-kicker mono">governance, by design</div>
          <h2>Human authority before anything ships.</h2>
          <p>No autonomous merges. The Fixer proposes; a second model reviews; <b>you sign off</b>. Approval is a real message in the room, captured forever as part of the record.</p>
          <ul className="mk-points">
            <li><span className="mk-pt-ico"><SevGlyph kind="approved" /></span><div><b>You hold the baton.</b> Every patch waits for your sign-off — captured as an Approval.</div></li>
            <li><span className="mk-pt-ico"><SevGlyph kind="archive" /></span><div><b>Fully replayable.</b> Scrub the whole run on the Master Tape — every event, in order.</div></li>
            <li><span className="mk-pt-ico"><SevGlyph kind="live" /></span><div><b>Provenance to the source.</b> Each finding chains back through the Band ledger — the auditor’s deliverable.</div></li>
          </ul>
        </div>
        <div className="mk-split-visual">
          <div className="mk-seal">
            <div className="mk-seal-mark"><SevGlyph kind="approved" /></div>
            <div>
              <div className="mk-seal-state">Approved</div>
              <div className="mk-seal-meta mono">you · cross-model review PASS</div>
            </div>
          </div>
          <div className="mk-chain">
            {["Finding · hardcoded secret", "Control · SOC 2 CC6.1", "Patch · on a branch", "Review · PASS (gpt-4o-mini)", "Approval · you"].map((c, i) => (
              <div key={c} className="mk-chain-node" style={{ marginLeft: i * 14 }}>
                <span className="mk-chain-k mono">{c}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- stat band ---- */}
      <section className="mk-stats">
        {[
          ["8", "specialist agents"],
          ["2", "model providers"],
          ["0", "autonomous merges"],
          ["100%", "replayable"],
        ].map(([v, l]) => (
          <div key={l} className="mk-stat">
            <b className="tnum">{v}</b>
            <span>{l}</span>
          </div>
        ))}
      </section>

      {/* ---- final CTA ---- */}
      <section className="mk-final">
        <div className="mk-final-glow" />
        <h2>Run your first audit.</h2>
        <p>Connect a repository and watch the band perform — live, on the Stage.</p>
        <Link href="/app" className="mk-btn mk-btn-primary lg">Enter the app <Icon name="handoff" /></Link>
      </section>

      {/* ---- footer ---- */}
      <footer className="mk-foot">
        <div className="mk-foot-brand">
          <span className="mk-foot-wm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mk-logo sm" src="/logo.png" alt="" width={26} height={26} />
            <span className="mk-wm">sound<b>check</b></span>
          </span>
          <span className="mk-foot-tag">a governed, replayable agent workforce — built on Band</span>
        </div>
        <div className="mk-foot-meta mono">
          <span>Built for the Band of Agents Hackathon</span>
          <span>·</span>
          <span>Defensive security only</span>
        </div>
      </footer>
    </div>
  );
}
