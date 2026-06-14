"use client";

// The Stage — the concert-hall view, ported from design/stage/app.jsx and wired
// to LIVE Band data (timeline + findings via the BFF). Players are positioned in
// an arc with the Bandleader centred; each card streams that agent's real events;
// the Score rail fills with real findings; the latest @mention handoff draws a
// thread of light. Polls the BFF so an in-progress run animates.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { INSTRUMENTS, SevChip, SevGlyph, sevKind, Icon } from "@/components/glyphs";
import type { FindingEntry, TimelineItem } from "@/lib/types";

const STAGE_W = 1100, STAGE_H = 496, CARD_W = 176, CARD_H = 132;

// Map an agent display name to an instrument glyph + short role.
function instrumentFor(name: string): { inst: keyof typeof INSTRUMENTS; role: string } {
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
  return { inst: "scanner", role: "specialist" };
}

// Arc geometry for N players (Bandleader centred + highest).
function arcPositions(n: number) {
  const pos: { cx: number; cy: number; left: number; top: number }[] = [];
  const margin = 110;
  const span = STAGE_W - margin * 2;
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const cx = margin + f * span;
    // parabola: highest (smallest y) in the middle
    const dip = 1 - Math.pow((f - 0.5) * 2, 2); // 0 at edges, 1 centre
    const top = 196 - dip * 178;
    pos.push({ cx, cy: top + CARD_H / 2, left: cx - CARD_W / 2, top });
  }
  return pos;
}

const PODIUM = { x: STAGE_W / 2, y: 392 };

interface Player {
  name: string;
  inst: keyof typeof INSTRUMENTS;
  role: string;
  stream: [string, string][]; // [verb, detail]
  status: "idle" | "thinking" | "done";
}

function streamFromEvents(events: TimelineItem[]): [string, string][] {
  return events.slice(-4).map((e) => {
    const verb = e.mtype === "text" ? "say"
      : e.mtype === "thought" ? "think"
      : e.mtype === "task" ? "task"
      : e.mtype;
    const detail = (e.content || "").replace(/@\[\[[^\]]+\]\]/g, "").trim().slice(0, 60);
    return [verb, detail] as [string, string];
  });
}

export function StageView({
  roomId, initialTimeline = [], initialFindings = [], live = false,
}: {
  roomId: string;
  initialTimeline?: TimelineItem[];
  initialFindings?: FindingEntry[];
  live?: boolean;
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>(initialTimeline);
  const [findings, setFindings] = useState<FindingEntry[]>(initialFindings);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);

  // Poll the BFF (re-project + read) only for a live/in-progress run, so a
  // completed run doesn't keep re-projecting and spending nothing-changes work.
  useEffect(() => {
    if (!live) return;
    let alive = true;
    async function pull() {
      try {
        await api.refreshOne(roomId);
        const [t, f] = await Promise.all([api.timeline(roomId), api.findings(roomId)]);
        if (alive) { setTimeline(t.timeline); setFindings(f.findings); }
      } catch { /* ignore */ }
    }
    pull();
    const iv = setInterval(pull, 6000);
    return () => { alive = false; clearInterval(iv); };
  }, [roomId, live]);

  // fit the fixed canvas into the wrapper
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 40, h = el.clientHeight - 28;
      if (w > 0 && h > 0) setScale(Math.max(0.42, Math.min(1, w / STAGE_W, h / STAGE_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { players, positions, thread } = useMemo(() => {
    // group events by sender (agents only)
    const bySender = new Map<string, TimelineItem[]>();
    for (const m of timeline) {
      const s = m.sender || "?";
      if (m.sender_type === "User") continue;
      if (!bySender.has(s)) bySender.set(s, []);
      bySender.get(s)!.push(m);
    }
    let names = [...bySender.keys()];
    // order: put Bandleader in the centre of the arc
    names = names.filter((n) => !n.toLowerCase().includes("bandleader"));
    const bl = [...bySender.keys()].find((n) => n.toLowerCase().includes("bandleader"));
    const mid = Math.floor(names.length / 2);
    if (bl) names.splice(mid, 0, bl);

    const lastSenderAt = (s: string) => bySender.get(s)!.at(-1)?.created_at || "";
    const players: Player[] = names.map((name) => {
      const evs = bySender.get(name)!;
      const last = evs.at(-1)?.created_at || "";
      const recent = Date.now() - new Date(last).getTime() < 20000;
      const { inst, role } = instrumentFor(name);
      return { name, inst, role, stream: streamFromEvents(evs),
        status: recent ? "thinking" : "done" };
    });
    const positions = arcPositions(players.length);

    // latest handoff thread: last text message from an agent to the next agent
    const texts = timeline.filter((m) => m.mtype === "text" && m.sender_type !== "User");
    let thread: { from: number; to: number } | null = null;
    if (texts.length) {
      const lastText = texts.at(-1)!;
      const fromIdx = players.findIndex((p) => p.name === lastText.sender);
      // best-effort target: the most-recently-active OTHER player
      const others = players.map((p, i) => ({ i, t: lastSenderAt(p.name) }))
        .filter((x) => x.i !== fromIdx).sort((a, b) => (a.t < b.t ? 1 : -1));
      if (fromIdx >= 0 && others.length) thread = { from: fromIdx, to: others[0].i };
    }
    return { players, positions, thread };
  }, [timeline]);

  const tallies = useMemo(() => {
    const t = { critical: 0, attention: 0, info: 0 };
    for (const f of findings) {
      const k = sevKind(f.severity);
      if (k === "critical") t.critical++; else if (k === "attention") t.attention++; else t.info++;
    }
    return t;
  }, [findings]);

  return (
    <div className="stage-region">
      <div className="stage-head">
        <div className="title">The Stage<span>the live workforce · {players.length} players</span></div>
        <span className="tallies">
          <span style={{ color: "var(--severe)" }}><SevGlyph kind="critical" /> {tallies.critical}</span>
          <span style={{ color: "var(--attention)" }}><SevGlyph kind="attention" /> {tallies.attention}</span>
          <span style={{ color: "var(--info)" }}><SevGlyph kind="info" /> {tallies.info}</span>
        </span>
      </div>

      <div className="stage-body">
        <div className="stage-wrap" ref={wrapRef}>
          <div className="stage-scale" style={{ transform: `scale(${scale})` }}>
            <div className="stage-floor" style={{ width: STAGE_W, height: STAGE_H }}>
              <FloorBg />
              {thread && positions[thread.from] && positions[thread.to] && (
                <Threads a={positions[thread.from]} b={positions[thread.to]} />
              )}
              {players.map((p, i) => (
                <PlayerCard key={p.name} player={p} pos={positions[i]} />
              ))}
              <Podium />
            </div>
          </div>
          {players.length === 0 && (
            <div className="stage-empty-note">No activity yet for this run.</div>
          )}
        </div>

        <ScoreRail findings={findings} />
      </div>
    </div>
  );
}

function PlayerCard({ player, pos }: { player: Player; pos: { left: number; top: number } }) {
  const Inst = INSTRUMENTS[player.inst];
  return (
    <div className={`player ${player.status}`} style={{ left: pos.left, top: pos.top }}>
      <div className="p-top">
        <div className="inst">{Inst()}</div>
        <div className="p-id">
          <div className="p-name">{player.name}</div>
          <div className="p-handle mono">@{player.name.toLowerCase().replace(/\s+/g, "-")}</div>
        </div>
        <span className={`p-stat ${player.status}`}>
          {player.status === "thinking" ? <><span className="eq"><i /><i /><i /><i /></span>thinking</>
            : <><SevGlyph kind="approved" />done</>}
        </span>
      </div>
      <div className="p-role">{player.role}</div>
      <div className="p-stream">
        {player.stream.length === 0
          ? <div className="sline idle-line">— standing by —</div>
          : player.stream.map((ln, i) => (
            <div className={"sline" + (i === player.stream.length - 1 ? " new" : "")} key={i}>
              <span className="k">{ln[0]}</span> {ln[1]}
            </div>
          ))}
      </div>
    </div>
  );
}

function Threads({ a, b }: { a: { cx: number; cy: number }; b: { cx: number; cy: number } }) {
  const mx = (a.cx + b.cx) / 2, my = Math.min(a.cy, b.cy) - 54;
  const d = `M ${a.cx} ${a.cy} Q ${mx} ${my} ${b.cx} ${b.cy}`;
  return (
    <svg className="thread-svg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
      <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1.4" strokeDasharray="2 6" opacity="0.7" />
      <path className="travel" d={d} fill="none" stroke="var(--live)" strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />
      <circle cx={a.cx} cy={a.cy} r="3.5" fill="var(--live)" />
      <circle className="arrival" cx={b.cx} cy={b.cy} r="4" fill="none" stroke="var(--live)" strokeWidth="2" />
      <circle cx={b.cx} cy={b.cy} r="3.5" fill="var(--live-bright)" />
    </svg>
  );
}

function FloorBg() {
  return (
    <svg className="floor-bg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} preserveAspectRatio="none">
      <defs>
        <radialGradient id="footlight" cx="50%" cy="100%" r="62%">
          <stop offset="0%" stopColor="rgba(31,138,122,0.10)" />
          <stop offset="55%" stopColor="rgba(31,138,122,0.04)" />
          <stop offset="100%" stopColor="rgba(31,138,122,0)" />
        </radialGradient>
      </defs>
      <rect x="0" y={STAGE_H - 230} width={STAGE_W} height="230" fill="url(#footlight)" />
      <ellipse cx={STAGE_W / 2} cy={PODIUM.y + 36} rx="500" ry="78" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.55" />
      <ellipse cx={STAGE_W / 2} cy={PODIUM.y + 30} rx="350" ry="56" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.7" />
      <ellipse cx={STAGE_W / 2} cy={PODIUM.y + 24} rx="200" ry="36" fill="none" stroke="var(--line-strong)" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}

function Podium() {
  return (
    <div className="podium" style={{ left: PODIUM.x, top: PODIUM.y }}>
      <div className="stand">{INSTRUMENTS.conductor()}</div>
      <div className="plabel"><b>You</b> · the conductor</div>
      <div className="sub">final authority · nothing ships without sign-off</div>
    </div>
  );
}

function ScoreRail({ findings }: { findings: FindingEntry[] }) {
  return (
    <aside className="score-rail">
      <div className="score-head">
        <div className="row1">
          <h2>The Score</h2>
          <span className="count">{findings.length} {findings.length === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="sub">evidence ledger · every finding, written down &amp; auditable</div>
      </div>
      {findings.length === 0 ? (
        <div className="score-empty">
          <Icon name="tape" />
          <p>No findings yet.<br />The Score fills as the band performs.</p>
        </div>
      ) : (
        <div className="score-list">
          {findings.map((f) => {
            const title = (f.content || "").split("\n")[0];
            const evidence = (f.content || "").split("\n").slice(1).join(" ");
            return (
              <div key={f.id} className={`finding ${sevKind(f.severity)}`}>
                <div className="f-top">
                  <div className="f-title">{title}</div>
                  <SevChip kind={sevKind(f.severity)} label={f.severity} />
                </div>
                <div className="f-meta">
                  {evidence && <span className="mono">{evidence.slice(0, 70)}</span>}
                  {f.controls[0] && <><br /><span className="ctrl">{(f.controls[0].content || "").replace("\n", " ")}</span></>}
                </div>
                <div className="f-foot"><span className="f-by mono">@{(f.sender || "agent").toLowerCase().replace(/\s+/g, "-")}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
