"use client";

// The Stage — the concert-hall view, wired to LIVE Band data (timeline +
// findings via the BFF). The band sits small along an arc; whoever is performing
// now STEPS FORWARD into the spotlight at centre stage and grows large enough to
// read everything they're doing — task and all. Players take turns (auto-rotate
// + follow the latest live activity); click any seat to pin the spotlight on it.
// On narrow screens it switches to a mobile layout: a full-width performer card
// above a tappable rail of the seated band.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { INSTRUMENTS, SevChip, SevGlyph, sevKind, Icon } from "@/components/glyphs";
import { MentionText } from "@/components/mention-text";
import type { FindingEntry, TimelineItem } from "@/lib/types";

const SEAT_W = 152, SEAT_H = 92;   // compact seated card (layout footprint)
const SPOT_W = 740;                // the spotlight (centre-stage) card — wide & short

interface Seat { cx: number; cy: number; left: number; top: number }
interface Layout {
  W: number; H: number;
  seats: Seat[];
  spot: { left: number; top: number; cx: number; cy: number };
  podium: { x: number; y: number };
}

// Three bands: the band seated along an arc (top), the spotlight (middle), the
// conductor's podium (bottom). Sized to the player count so seats never overlap.
function computeLayout(n: number): Layout {
  // tighter spread + flatter arc → smaller native floor, so the fit-scale is
  // higher and the band/spotlight render larger (a landscape, "screen" stage)
  const pitch = SEAT_W + 18;
  const margin = 44;
  const W = Math.max(1040, margin * 2 + Math.max(0, n - 1) * pitch + SEAT_W);
  const topMax = 56, amplitude = 38;
  const seats: Seat[] = Array.from({ length: n }, (_, i) => {
    const f = n === 1 ? 0.5 : i / (n - 1);
    const cx = margin + SEAT_W / 2 + f * (Math.max(0, n - 1) * pitch);
    const dip = 1 - Math.pow((f - 0.5) * 2, 2);
    const top = topMax - dip * amplitude;
    return { cx, cy: top + SEAT_H / 2, left: cx - SEAT_W / 2, top };
  });
  const seatFloor = topMax + SEAT_H;
  const spotTop = seatFloor + 24;
  const spot = { left: W / 2 - SPOT_W / 2, top: spotTop, cx: W / 2, cy: spotTop + 112 };
  const podium = { x: W / 2, y: spotTop + 334 }; // +15% taller spotlight rectangle
  const H = podium.y + 84;
  return { W, H, seats, spot, podium };
}

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

interface Player {
  name: string;
  inst: keyof typeof INSTRUMENTS;
  role: string;
  says: { text: string; mentions: string[] }[]; // the chat — text messages, oldest → newest
  activity: [string, string][];                 // the rest — [verb, detail] non-text events
  handoff: string[];                            // who the latest say addresses
  seatLine: string;                             // one-line summary for the seated card
  status: "idle" | "thinking" | "done";
}

function verbOf(e: TimelineItem): string {
  return e.mtype === "thought" ? "think"
    : e.mtype === "task" ? "task"
    : e.mtype === "tool_call" ? "tool"
    : e.mtype === "tool_result" ? "result"
    : e.mtype;
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
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  const [narrow, setNarrow] = useState(false);

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

  const { players, layout, latestIdx, mentionNames } = useMemo(() => {
    const bySender = new Map<string, TimelineItem[]>();
    for (const m of timeline) {
      if (m.sender_type === "User") continue;
      const s = m.sender || "?";
      if (!bySender.has(s)) bySender.set(s, []);
      bySender.get(s)!.push(m);
    }
    let names = [...bySender.keys()];
    names = names.filter((n) => !n.toLowerCase().includes("bandleader"));
    const bl = [...bySender.keys()].find((n) => n.toLowerCase().includes("bandleader"));
    const mid = Math.floor(names.length / 2);
    if (bl) names.splice(mid, 0, bl);

    const players: Player[] = names.map((name) => {
      const evs = bySender.get(name)!;
      const last = evs.at(-1)?.created_at || "";
      const recent = Date.now() - new Date(last).getTime() < 20000;
      const { inst, role } = instrumentFor(name);
      const texts = evs.filter((e) => e.mtype === "text");
      const says = texts.slice(-6).map((e) => ({ text: (e.content || "").trim(), mentions: e.mentions || [] }));
      const activity = evs.filter((e) => e.mtype !== "text").slice(-8).map((e) =>
        [verbOf(e), (e.content || "").replace(/@\[\[[^\]]+\]\]/g, "").trim().slice(0, 200)] as [string, string]);
      const handoff = texts.length ? (texts[texts.length - 1].mentions || []) : [];
      const seatLine = (evs.at(-1)?.content || "").trim().slice(0, 90);
      return { name, inst, role, says, activity, handoff, seatLine, status: recent ? "thinking" : "done" };
    });
    const layout = computeLayout(players.length);

    let latestIdx = -1; let latestT = "";
    players.forEach((p, i) => {
      const t = bySender.get(p.name)!.at(-1)?.created_at || "";
      if (t > latestT) { latestT = t; latestIdx = i; }
    });

    // names we highlight as @mentions anywhere on the stage
    const mentionSet = new Set<string>();
    for (const m of timeline) (m.mentions || []).forEach((n) => mentionSet.add(n));
    players.forEach((p) => mentionSet.add(p.name));

    return { players, layout, latestIdx, mentionNames: [...mentionSet] };
  }, [timeline]);

  // ---- the spotlight ----------------------------------------------------
  const [spot, setSpot] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    setSpot((s) => (players.length ? Math.min(s, players.length - 1) : 0));
  }, [players.length]);

  useEffect(() => {
    if (pinned || players.length < 2) return;
    const iv = setInterval(() => setSpot((s) => (s + 1) % players.length), 3800);
    return () => clearInterval(iv);
  }, [pinned, players.length]);

  useEffect(() => {
    if (live && !pinned && latestIdx >= 0) setSpot(latestIdx);
  }, [live, pinned, latestIdx]);

  function pickSeat(i: number) {
    if (i === spot) { setPinned((p) => !p); return; }
    setSpot(i); setPinned(true);
  }

  const tallies = useMemo(() => {
    const t = { critical: 0, attention: 0, info: 0 };
    for (const f of findings) {
      const k = sevKind(f.severity);
      if (k === "critical") t.critical++; else if (k === "attention") t.attention++; else t.info++;
    }
    return t;
  }, [findings]);

  // is the stage region narrow enough to switch to the mobile layout?
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setNarrow(el.clientWidth < 720);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // fit the (desktop) floor into its wrapper
  useEffect(() => {
    if (narrow) return;
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 40, h = el.clientHeight - 24;
      if (w > 0 && h > 0) setScale(Math.max(0.4, Math.min(1, w / layout.W, h / layout.H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.W, layout.H, narrow]);

  const current = players[spot];

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
      <div className="stage-legend">
        <span><i className="lg-card" /> the band is seated along the arc</span>
        <span><i className="lg-thread" /> whoever’s performing steps into the spotlight</span>
        <span><i className="lg-podium" /> you preside — nothing ships without sign-off</span>
      </div>

      <div className="stage-body" ref={bodyRef}>
        {narrow ? (
          players.length === 0 ? (
            <div className="stage-empty-note rel">No activity yet for this run.</div>
          ) : (
            <div className="stage-mobile">
              {current && (
                <div className="player spotlit m-spot">
                  <SpotlightInner player={current} pinned={pinned} names={mentionNames} />
                </div>
              )}
              <div className="m-rail">
                {players.map((p, i) => (
                  <button key={p.name} className={`m-seat ${i === spot ? "on" : ""}`} onClick={() => pickSeat(i)}>
                    <span className="m-seat-ico">{INSTRUMENTS[p.inst]()}</span>
                    <span className="m-seat-name">{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="m-podium mono"><b>You</b> · the conductor — nothing ships without sign-off</div>
            </div>
          )
        ) : (
          <div className="stage-wrap" ref={wrapRef}>
            <div className="stage-scale" style={{ transform: `scale(${scale})` }}>
              <div className="stage-floor" style={{ width: layout.W, height: layout.H }}>
                <FloorBg W={layout.W} H={layout.H} podium={layout.podium} spot={layout.spot} />
                {players.map((p, i) => (
                  <PlayerCard
                    key={p.name}
                    player={p}
                    seat={layout.seats[i]}
                    spot={layout.spot}
                    spotlit={i === spot}
                    receded={players.length > 1 && i !== spot}
                    pinned={pinned && i === spot}
                    names={mentionNames}
                    onClick={() => pickSeat(i)}
                  />
                ))}
                <Podium podium={layout.podium} />
              </div>
            </div>
            {players.length === 0 && (
              <div className="stage-empty-note">No activity yet for this run.</div>
            )}
          </div>
        )}

        <ScoreRail findings={findings} />
      </div>
    </div>
  );
}

function SpotlightInner({ player, pinned, names }: { player: Player; pinned: boolean; names: string[] }) {
  const Inst = INSTRUMENTS[player.inst];
  const handle = "@" + player.name.toLowerCase().replace(/\s+/g, "-");
  return (
    <>
      <div className="p-top">
        <div className="inst big">{Inst()}</div>
        <div className="p-id">
          <div className="p-name">{player.name}</div>
          <div className="p-handle mono">{handle}</div>
        </div>
        <span className="p-stat perform">
          <span className="eq"><i /><i /><i /><i /></span>{pinned ? "pinned" : "on the mic"}
        </span>
      </div>
      <div className="p-roleline">
        <span className="p-role">{player.role}</span>
        {player.handoff.length > 0 && (
          <span className="p-handoff"><Icon name="handoff" />
            {player.handoff.map((n) => <span key={n} className="mention">@{n}</span>)}
          </span>
        )}
      </div>
      <div className="p-body">
        {/* left column — the SAY (the chat) */}
        <div className="p-now">
          <span className="now-k mono">say · the chat</span>
          {player.says.length === 0 ? (
            <div className="say-line">— standing by —</div>
          ) : (
            <div className="say-stream">
              {player.says.map((s, i) => (
                <div className={"say-line" + (i === player.says.length - 1 ? " latest" : "")} key={i}>
                  <MentionText text={s.text} mentions={names} />
                </div>
              ))}
            </div>
          )}
        </div>
        {/* right column — the rest of the events (think, tasks, tools) */}
        <div className="p-log">
          <span className="now-k mono">events</span>
          {player.activity.length === 0 ? (
            <div className="logline">— no events yet —</div>
          ) : (
            player.activity.slice().reverse().map((ln, i) => (
              <div className="logline" key={i}><span className="k">{ln[0]}</span> {ln[1]}</div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function SeatInner({ player }: { player: Player }) {
  const Inst = INSTRUMENTS[player.inst];
  return (
    <>
      <div className="p-top">
        <div className="inst">{Inst()}</div>
        <div className="p-id">
          <div className="p-name">{player.name}</div>
          <div className="p-handle mono">{player.role}</div>
        </div>
        <span className={`p-stat ${player.status}`}>
          {player.status === "thinking"
            ? <span className="eq"><i /><i /><i /><i /></span>
            : <SevGlyph kind="approved" />}
        </span>
      </div>
      <div className="p-seatline mono">{player.seatLine || "standing by"}</div>
    </>
  );
}

function PlayerCard({
  player, seat, spot, spotlit, receded, pinned, names, onClick,
}: {
  player: Player; seat: Seat; spot: Layout["spot"];
  spotlit: boolean; receded: boolean; pinned: boolean; names: string[]; onClick: () => void;
}) {
  const cls = `player ${player.status} ${spotlit ? "spotlit" : ""} ${receded ? "receded" : ""}`;
  const style = spotlit
    ? { left: spot.left, top: spot.top, width: SPOT_W }
    : { left: seat.left, top: seat.top, width: SEAT_W };
  return (
    <div className={cls} style={style} onClick={onClick}
      title={spotlit ? "Click to release the spotlight" : "Click to spotlight"}>
      {spotlit ? <SpotlightInner player={player} pinned={pinned} names={names} /> : <SeatInner player={player} />}
    </div>
  );
}

function FloorBg({ W, H, podium, spot }: {
  W: number; H: number; podium: { x: number; y: number }; spot: { cx: number; cy: number };
}) {
  return (
    <svg className="floor-bg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <radialGradient id="footlight" cx="50%" cy="50%" r="58%">
          <stop offset="0%" stopColor="rgba(37,99,235,0.16)" />
          <stop offset="55%" stopColor="rgba(37,99,235,0.06)" />
          <stop offset="100%" stopColor="rgba(37,99,235,0)" />
        </radialGradient>
      </defs>
      <ellipse cx={spot.cx} cy={spot.cy + 30} rx={W * 0.34} ry="160" fill="url(#footlight)" />
      <ellipse cx={W / 2} cy={podium.y + 30} rx={W * 0.44} ry="70" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.5" />
      <ellipse cx={W / 2} cy={podium.y + 26} rx={W * 0.30} ry="50" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.65" />
      <ellipse cx={W / 2} cy={podium.y + 22} rx={W * 0.17} ry="32" fill="none" stroke="var(--line-strong)" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}

function Podium({ podium }: { podium: { x: number; y: number } }) {
  return (
    <div className="podium" style={{ left: podium.x, top: podium.y }}>
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
