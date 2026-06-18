"use client";

// The Stage — the concert-hall view, wired to LIVE Band data (timeline +
// findings via the BFF). The band sits small along an arc; whoever is performing
// now STEPS FORWARD into the spotlight at centre stage and grows large enough to
// read everything they're doing — task and all. Players take turns (auto-rotate
// + follow the latest live activity); click any seat to pin the spotlight on it.
// On narrow screens it switches to a mobile layout: a full-width performer card
// above a tappable rail of the seated band.

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { INSTRUMENTS, SevChip, SevGlyph, sevKind, Icon } from "@/components/glyphs";
import { MentionText } from "@/components/mention-text";
import { StageChat } from "@/components/stage-chat";
import { FixButton } from "@/components/fix-button";
import { ApproveAction } from "@/components/approve-action";
import { StageMic, buildWalkthrough } from "@/components/stage-mic";
import type { FindingEntry, LedgerEntry, TimelineItem } from "@/lib/types";

// Best-effort file location from a finding's content (e.g. "app.py:23" → app.py).
const FILE_RE = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})(?::\d+)?/;
function fileOf(content: string): string {
  const m = FILE_RE.exec(content || "");
  return m ? m[1] : "";
}

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
  roomId, initialTimeline = [], initialFindings = [], initialLedger = {}, live = false,
}: {
  roomId: string;
  initialTimeline?: TimelineItem[];
  initialFindings?: FindingEntry[];
  initialLedger?: Record<string, LedgerEntry[]>;
  live?: boolean;
}) {
  const [timeline, setTimeline] = useState<TimelineItem[]>(initialTimeline);
  const [findings, setFindings] = useState<FindingEntry[]>(initialFindings);
  const [ledger, setLedger] = useState<Record<string, LedgerEntry[]>>(initialLedger);
  // The Stage is the live operations console: proposing a fix from the Score rail
  // flips this Stage live so you watch the Fixer → Reviewer perform in place.
  const [liveOn, setLiveOn] = useState(live);
  // immediate feedback the moment a fix is requested — the Fixer takes ~30-60s to
  // clone + patch, so without this the Stage looks inert ("nothing happened").
  const [justProposed, setJustProposed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    if (!liveOn) return;
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
  }, [roomId, liveOn]);

  // Remediation/approval state (the ledger) — fetched once on mount and on every
  // live tick, so the approval gate can live on the Stage too.
  useEffect(() => {
    let alive = true;
    const load = () => api.runDetail(roomId)
      .then((d) => { if (alive) setLedger(d.ledger_by_kind); })
      .catch(() => {});
    load();
    if (!liveOn) return () => { alive = false; };
    const iv = setInterval(load, 6000);
    return () => { alive = false; clearInterval(iv); };
  }, [roomId, liveOn]);

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

  // Auto-rotate ONLY on a finished/replay run (to show each player in turn).
  // On a LIVE stage there is no timer — the spotlight follows real activity below.
  useEffect(() => {
    if (liveOn || pinned || players.length < 2) return;
    const iv = setInterval(() => setSpot((s) => (s + 1) % players.length), 3800);
    return () => clearInterval(iv);
  }, [liveOn, pinned, players.length]);

  // Live: the spotlight moves to whoever just performed, as they come in.
  useEffect(() => {
    if (liveOn && !pinned && latestIdx >= 0) setSpot(latestIdx);
  }, [liveOn, pinned, latestIdx]);

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

  // "audit complete" once findings exist and the band has gone quiet (or it's a
  // finished, non-live run) — a clear cue + next step instead of dead air.
  const lastTs = timeline.length ? new Date(timeline[timeline.length - 1].created_at || 0).getTime() : 0;
  const idle = lastTs > 0 && Date.now() - lastTs > 25000;
  const auditDone = findings.length > 0 && (!liveOn || idle);

  // The Mic — once the set is done, the band can re-perform in words. Build the
  // ordered, spoken walkthrough from the same live timeline + ledger.
  const walkthrough = useMemo(
    () => buildWalkthrough(timeline, players, findings, ledger),
    [timeline, players, findings, ledger]);
  const focusSeat = (i: number | null) => {
    if (i == null) setPinned(false);
    else { setSpot(i); setPinned(true); }
  };

  // remediation gate — the loop is now visible AND actionable on the Stage
  const patch = ledger.PatchProposal?.[0];
  const review = ledger.ReviewResult?.[0];
  const approval = ledger.Approval?.[0];
  const verdict = (review?.tags.find((t) => t.startsWith("verdict:")) || "verdict:—").split(":")[1];
  // for "send them back in": recover the file + finding the patch was for
  const patchFile = (patch?.content || "").match(/Files:\s*([^\n,]+)/)?.[1]?.trim() || "";
  const reFinding =
    findings.find((f) => (patch?.refs || []).includes(f.id)) ;
  const reFindingText = reFinding
    ? (reFinding.content || "").split("\n")[0]
    : (patch?.content || "").split("\n")[0];

  return (
    <>
    {approval ? (
      <div className="stage-remedy approved">
        <span className="sr-ico"><SevGlyph kind="approved" /></span>
        <span className="sr-text"><b>Approved.</b> You authorized the patch — the Stage Manager is opening the pull request.</span>
        <Link href={`/run/${roomId}/conductor`} className="sr-cta">Audit deliverable <Icon name="chevron" /></Link>
      </div>
    ) : review && verdict === "pass" ? (
      <div className="stage-remedy pending">
        <div className="sr-line">
          <span className="sr-ico"><Icon name="check" /></span>
          <span className="sr-text">
            <b>A fix is ready for your sign-off.</b> The Reviewer returned <span className={`verdict v-${verdict}`}>{verdict.toUpperCase()}</span> — nothing ships until you authorize.
          </span>
        </div>
        <ApproveAction roomId={roomId} />
      </div>
    ) : review ? (
      <div className="stage-remedy pending">
        <div className="sr-line">
          <span className="sr-ico"><Icon name="handoff" /></span>
          <span className="sr-text">
            <b>The Reviewer requested changes</b> <span className={`verdict v-${verdict}`}>{verdict?.toUpperCase()}</span> — the patch did not pass cross-model review, so no sign-off was requested. Send the band back in and the Fixer will revise it with the Reviewer&apos;s feedback.
          </span>
        </div>
        {patchFile && (
          <FixButton roomId={roomId} file={patchFile} finding={reFindingText}
            label="Send them back in" sentLabel="On it — the Fixer is revising"
            onProposed={() => { setLiveOn(true); setJustProposed(true); }} />
        )}
      </div>
    ) : patch ? (
      <div className="stage-remedy working">
        <span className="sr-ico"><Icon name="clock" /></span>
        <span className="sr-text"><b>Fix in progress.</b> The Fixer proposed a patch — the Reviewer is checking it now. Watch it unfold below.</span>
      </div>
    ) : justProposed ? (
      <div className="stage-remedy working">
        <span className="sr-ico"><span className="cl-orb"><i /><i /><i /></span></span>
        <span className="sr-text"><b>Sending the Fixer…</b> cloning the repo and preparing the patch. The band will perform it on the Stage in a moment.</span>
      </div>
    ) : auditDone ? (
      <Link href={`/run/${roomId}/encore`} className="stage-done">
        <span className="sd-ico"><SevGlyph kind="approved" /></span>
        <span className="sd-text"><b>That&apos;s a wrap.</b> {findings.length} findings flagged — propose a fix from the Score, or see the band take a bow.</span>
        <span className="sd-cta">The Encore <Icon name="chevron" /></span>
      </Link>
    ) : null}
    <div className="stage-region">
      <div className="stage-head">
        <div className="title">The Stage
          <span>{players.length} player{players.length === 1 ? "" : "s"} · {liveOn ? "live" : "replay"}</span>
        </div>
        {current && (
          <div className="stage-now" key={current.name}>
            <span className="sn-k mono">{liveOn ? "on the mic" : "in the spotlight"}</span>
            <span className="sn-inst">{INSTRUMENTS[current.inst]()}</span>
            <span className="sn-id">
              <span className="sn-name">{current.name}</span>
              <span className="sn-role mono">{current.role}</span>
            </span>
            <span className={`sn-stat ${current.status}`}>
              {current.status === "thinking"
                ? <span className="eq"><i /><i /><i /><i /></span>
                : <SevGlyph kind="approved" />}
            </span>
          </div>
        )}
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

      {auditDone && walkthrough.length > 0 && (
        <StageMic turns={walkthrough} onFocus={focusSeat} />
      )}

      <div className="stage-body" ref={bodyRef}>
        {narrow ? (
          players.length === 0 ? (
            <StageEmpty />
          ) : (
            <div className="stage-mobile">
              {current && (
                <div className="player spotlit m-spot">
                  <SpotlightInner player={current} pinned={pinned} names={mentionNames} live={liveOn} />
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
        ) : players.length === 0 ? (
          <div className="stage-wrap"><StageEmpty /></div>
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
                    live={liveOn}
                    onClick={() => pickSeat(i)}
                  />
                ))}
                <Podium podium={layout.podium} />
              </div>
            </div>
          </div>
        )}

        <ScoreRail findings={findings} roomId={roomId}
          onProposed={() => { setLiveOn(true); setJustProposed(true); }} />
      </div>
      <StageChat roomId={roomId} initialTimeline={timeline} />
    </div>
    </>
  );
}

// Live "being written" effect — reveals text word by word, keeping the column
// pinned to the bottom as it types (only used on a LIVE stage).
function Typewriter({ text, scrollRef }: { text: string; scrollRef: { current: HTMLDivElement | null } }) {
  const words = useMemo(() => text.split(/(\s+)/), [text]);
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (words.length === 0) return;
    const id = setInterval(() => setN((v) => (v >= words.length ? (clearInterval(id), v) : v + 1)), 85);
    return () => clearInterval(id);
  }, [words]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [n, scrollRef]);
  return <>{words.slice(0, n).join("")}{n < words.length && <span className="tw-caret" />}</>;
}

function SpotlightInner({ player, pinned, names, live }: {
  player: Player; pinned: boolean; names: string[]; live: boolean;
}) {
  const Inst = INSTRUMENTS[player.inst];
  const handle = "@" + player.name.toLowerCase().replace(/\s+/g, "-");
  const nowRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // chat-style: start scrolled to the BOTTOM (the newest), and stay there as
  // new says/events arrive — for both live and finished runs.
  useEffect(() => {
    if (nowRef.current) nowRef.current.scrollTop = nowRef.current.scrollHeight;
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [player.name, player.says.length, player.activity.length]);

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
        <div className="p-now" ref={nowRef}>
          <span className="now-k mono">say · the chat</span>
          {player.says.length === 0 ? (
            <div className="say-line">— standing by —</div>
          ) : (
            <div className="say-stream">
              {player.says.map((s, i) => {
                const latest = i === player.says.length - 1;
                return (
                  <div className={"say-line" + (latest ? " latest" : "")} key={i}>
                    {live && latest
                      ? <Typewriter text={s.text} scrollRef={nowRef} />
                      : <MentionText text={s.text} mentions={names} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* right column — the rest of the events (think, tasks, tools), newest at bottom */}
        <div className="p-log" ref={logRef}>
          <span className="now-k mono">events</span>
          {player.activity.length === 0 ? (
            <div className="logline">— no events yet —</div>
          ) : (
            player.activity.map((ln, i) => (
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
  player, seat, spot, spotlit, receded, pinned, names, live, onClick,
}: {
  player: Player; seat: Seat; spot: Layout["spot"];
  spotlit: boolean; receded: boolean; pinned: boolean; names: string[]; live: boolean; onClick: () => void;
}) {
  const cls = `player ${player.status} ${spotlit ? "spotlit" : ""} ${receded ? "receded" : ""}`;
  const style = spotlit
    ? { left: spot.left, top: spot.top, width: SPOT_W }
    : { left: seat.left, top: seat.top, width: SEAT_W };
  return (
    <div className={cls} style={style} onClick={onClick}
      title={spotlit ? "Click to release the spotlight" : "Click to spotlight"}>
      {spotlit ? <SpotlightInner player={player} pinned={pinned} names={names} live={live} /> : <SeatInner player={player} />}
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

// First-run / no-activity state — fills the stage with what's about to happen,
// the flow, and a way back, instead of a bare "nothing here" note.
function StageEmpty() {
  const FLOW = ["Audit", "Map", "Fix", "Review", "Approve"];
  return (
    <div className="stage-empty">
      <div className="se-mark"><Icon name="play" /></div>
      <h3>The stage is set.</h3>
      <p>
        No one&apos;s performed yet. When the audit runs, the band takes their places here —
        Scout reads the repo, the scanners flag findings, the Mapper ties them to controls —
        and you watch every handoff live.
      </p>
      <div className="se-flow">
        {FLOW.map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <i className="se-arrow"><Icon name="chevron" /></i>}
            <span className="se-step">{s}</span>
          </Fragment>
        ))}
      </div>
      <Link href="/app" className="btn"><Icon name="chevron" /> Back to Runs</Link>
    </div>
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

function ScoreRail({ findings, roomId, onProposed }: {
  findings: FindingEntry[]; roomId: string; onProposed: () => void;
}) {
  return (
    <aside className="score-rail">
      <div className="score-head">
        <div className="row1">
          <h2>The Score</h2>
          <span className="count">{findings.length} {findings.length === 1 ? "entry" : "entries"}</span>
        </div>
        <div className="sub">evidence ledger · propose a fix and the band performs it live</div>
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
            const file = fileOf(f.content || "");
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
                <div className="f-foot">
                  <span className="f-by mono">@{(f.sender || "agent").toLowerCase().replace(/\s+/g, "-")}</span>
                  {file && <FixButton roomId={roomId} file={file} finding={title} compact onProposed={onProposed} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
