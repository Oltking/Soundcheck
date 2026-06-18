"use client";

// The Mic — a voiced walkthrough of the run. When the set is over, click the
// mic and the band re-performs in words: each agent SPEAKS its own part, in the
// exact order it was called and responded (Stage Manager → Bandleader → the
// specialists → back to the Bandleader → Reviewer → …). It's not the raw chat
// read aloud — each turn is a short first-person summary built deterministically
// from the timeline + ledger, so it always works and spends no model tokens.
// Audio uses the browser's Web Speech API (a distinct voice per agent); if
// speech isn't available it still steps through visually with captions.
//
// The backbone is the TEXT messages — the real handoffs ("@Bandleader analysis
// complete…"). The task-floods (raw evidence) are skipped; the post-audit
// Customer-Service Q&A is treated as epilogue and left off the walkthrough.

import { useEffect, useRef, useState } from "react";
import { INSTRUMENTS, Icon } from "@/components/glyphs";
import type { FindingEntry, LedgerEntry, TimelineItem } from "@/lib/types";

type InstKey = keyof typeof INSTRUMENTS;
type Part = "stage" | "bandleader" | "scout" | "scanner" | "secrets" | "mapper" | "fixer" | "reviewer";

export interface WalkPlayer { name: string; inst: InstKey; role: string }
export interface Turn {
  name: string; inst: InstKey; part: Part; role: string; line: string; playerIndex: number;
}

// ---- building the walkthrough from the Band timeline ---------------------

const norm = (s?: string | null) => (s || "").trim();
const eqName = (a: string | null | undefined, b: string) =>
  norm(a).toLowerCase() === b.toLowerCase();
const isCS = (n: string) => /customer|service/i.test(n);
const FILE_RE = /Files:\s*([^\n,]+)/;

// The narration "part" is derived from the agent NAME, independent of which
// instrument glyph it borrows (e.g. Secrets Sentinel draws the fixer glyph but
// narrates as a scanner, not as the Fixer).
function partOf(name: string): Part {
  const n = name.toLowerCase();
  if (n.includes("stage")) return "stage";
  if (n.includes("bandleader")) return "bandleader";
  if (n.includes("reviewer")) return "reviewer";
  if (n.includes("fixer")) return "fixer";
  if (n.includes("secret")) return "secrets";
  if (n.includes("complian") || n.includes("mapper")) return "mapper";
  if (n.includes("scout")) return "scout";
  return "scanner"; // code scanner, dependency auditor, any other specialist
}

function nameList(ns: string[]): string {
  if (ns.length === 0) return "";
  if (ns.length === 1) return ns[0];
  return ns.slice(0, -1).join(", ") + " and " + ns[ns.length - 1];
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

// A task event's headline — drop the "Evidence: file:line (redacted)" tail and
// any "Task completed:" prefix so the agent speaks the gist, not the raw log.
function cleanTask(s: string): string {
  let t = norm(s)
    .replace(/\s*Evidence:.*$/is, "")
    .replace(/\(redacted\)/gi, "")
    .replace(/^Task completed:\s*/i, "")
    .replace(/\s+/g, " ").trim()
    .replace(/[.,;:]+$/, "");
  if (t.length > 60) {
    t = t.slice(0, 60);
    const sp = t.lastIndexOf(" ");
    if (sp > 20) t = t.slice(0, sp);
    t += "…";
  }
  return t;
}

// A thought, tidied and capped at a sentence-ish length for speaking aloud.
function cleanThought(s: string): string {
  let t = norm(s).replace(/\(redacted\)/gi, "").replace(/\s+/g, " ").trim();
  if (t.length > 150) { t = t.slice(0, 150); t = t.slice(0, t.lastIndexOf(" ")) + "…"; }
  return t.replace(/[.,;:\s]+$/, "");
}

// The most substantive thought in a turn (skip terse "Starting…" filler).
function pickThought(thoughts: string[]): string {
  const good = thoughts
    .map(norm)
    .filter((t) => t.length >= 30 && !/^starting\b/i.test(t))
    .sort((a, b) => b.length - a.length);
  return good.length ? cleanThought(good[0]) : "";
}

function frameworkOf(t: string): string {
  const s = norm(t);
  if (/^iso/i.test(s)) return "ISO 27001";
  if (/^soc\s*2|^soc2/i.test(s)) return "SOC 2";
  if (/^owasp/i.test(s)) return "OWASP";
  if (/^nist/i.test(s)) return "NIST";
  return "";
}

// What the agent did beyond the handoff — a short digest of its task events,
// shaped to the part (stages for the Bandleader, frameworks for the Mapper,
// finding/headline gist for everyone else).
function taskDigest(part: Part, tasks: string[]): string {
  if (!tasks.length) return "";
  if (part === "bandleader") {
    const stages = uniq(tasks.map((t) => t.match(/Audit stage:\s*([A-Z][A-Z ]{1,})/)?.[1]?.trim() || ""));
    if (stages.length) return `I moved us through the ${nameList(stages)} stage${stages.length > 1 ? "s" : ""}.`;
  }
  if (part === "mapper") {
    const fw = uniq(tasks.map(frameworkOf));
    if (fw.length) return `I tagged controls across ${nameList(fw)}.`;
  }
  const items = uniq(tasks.map(cleanTask).filter((s) => s.length > 3)).slice(0, 3);
  return items.length ? `Along the way: ${nameList(items)}.` : "";
}

function enrich(part: Part, tasks: string[], thoughts: string[]): string {
  const out: string[] = [];
  const td = taskDigest(part, tasks);
  if (td) out.push(td);
  const th = pickThought(thoughts);
  if (th) out.push(`My read: ${th}.`);
  return out.join(" ");
}

interface Arts { findings: number; controls: number; file: string; verdict: string }

function compose(
  part: Part, name: string, role: string, occ: number,
  handoff: string, arts: Arts, isLastTurn: boolean, hasApproval: boolean,
): string {
  const to = handoff || "the Bandleader";
  switch (part) {
    case "stage": // the Stage Manager
      if (occ === 0)
        return `I'm the Stage Manager. I set the stage and brought in ${handoff || "the Bandleader"} to lead the work.`;
      if (isLastTurn && hasApproval)
        return `Stage Manager again — once you signed off, I recorded the approval and opened the pull request.`;
      return `Stage Manager here — I kept the room in order${handoff ? ` and looped in ${handoff}` : ""}.`;
    case "bandleader":
      if (occ === 0)
        return `Bandleader here. I broke the audit into stages and sent ${handoff || "the band"} in to work.`;
      if (isLastTurn && !handoff)
        return `And that's the set — I pulled every finding into the final report and handed it back to you.`;
      return `Back to me, the Bandleader — I gathered what came back${handoff ? ` and brought in ${handoff} next` : " and lined up the next move"}.`;
    case "reviewer":
      if (arts.verdict === "pass")
        return `Reviewer. I checked the patch against a second model — it passed, so it was ready for your sign-off.`;
      if (arts.verdict === "revise")
        return `Reviewer. I checked the patch against a second model and sent it back to the Fixer for changes.`;
      return `Reviewer. I reviewed the work and reported my verdict${handoff ? ` to ${handoff}` : ""}.`;
    case "fixer":
      return `Fixer. I wrote a patch${arts.file ? ` for ${arts.file}` : ""} and handed it to the Reviewer.`;
    case "mapper":
      if (arts.controls > 0)
        return `I'm ${name}. I mapped ${arts.controls} finding${arts.controls === 1 ? "" : "s"} to compliance controls and reported back${handoff ? ` to ${handoff}` : ""}.`;
      return `I'm ${name}, on control mapping. I tied the findings to compliance controls and reported back.`;
    case "secrets":
      if (arts.findings > 0)
        return `I'm ${name}. I swept the code for committed secrets, flagged ${arts.findings}, and handed ${arts.findings === 1 ? "it" : "them"} back to ${to}.`;
      return `I'm ${name}. I swept the code for committed secrets and reported back to ${to}.`;
    case "scout":
      return `I'm ${name}, on reconnaissance. I ingested the repo and built the context, then handed it back to ${to}.`;
    default: // scanner — code / dependencies / any specialist
      if (arts.findings > 0)
        return `I'm ${name}, on ${role}. I flagged ${arts.findings} issue${arts.findings === 1 ? "" : "s"} and handed ${arts.findings === 1 ? "it" : "them"} back to ${to}.`;
      return `I'm ${name}, on ${role}. I went over my area and reported back to ${to}.`;
  }
}

export function buildWalkthrough(
  timeline: TimelineItem[],
  players: WalkPlayer[],
  findings: FindingEntry[],
  ledger: Record<string, LedgerEntry[]>,
): Turn[] {
  const index = new Map(players.map((p, i) => [p.name, i] as const));
  const byPlayer = new Map(players.map((p) => [p.name, p] as const));

  // per-sender artifacts (assigned to that sender's FIRST turn).
  const patches = ledger.PatchProposal || [];
  const reviews = ledger.ReviewResult || [];
  const controls = ledger.ControlMapping || [];
  const hasApproval = (ledger.Approval || []).length > 0;
  const verdictOf = (r: LedgerEntry) =>
    (r.tags.find((t) => t.startsWith("verdict:")) || "verdict:").split(":")[1] || "";
  const artsFor = (name: string): Arts => {
    const myPatch = patches.find((p) => eqName(p.sender, name));
    const myReview = reviews.find((x) => eqName(x.sender, name));
    return {
      findings: findings.filter((f) => eqName(f.sender, name)).length,
      controls: controls.filter((c) => eqName(c.sender, name)).length,
      file: myPatch ? (myPatch.content || "").match(FILE_RE)?.[1]?.trim() || "" : "",
      verdict: myReview ? verdictOf(myReview) : "",
    };
  };

  // backbone: the TEXT messages, in order, grouped into contiguous same-speaker
  // turns — these are the actual handoffs, not the raw evidence tasks.
  const texts = timeline.filter((m) =>
    m.sender_type !== "User" && m.mtype === "text" &&
    norm(m.sender) && norm(m.sender) !== "?" && index.has(norm(m.sender)));
  const groups: { name: string; items: TimelineItem[] }[] = [];
  for (const m of texts) {
    const name = norm(m.sender);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(m);
    else groups.push({ name, items: [m] });
  }

  // truncate the epilogue: the front-of-house Q&A (Customer Service) isn't part
  // of the audit performance — cut at the first turn that is CS or hands to CS.
  let cut = groups.length;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const handsToCS = g.items.some((it) => (it.mentions || []).some((mn) => isCS(norm(mn))));
    if (isCS(g.name) || handsToCS) { cut = i; break; }
  }
  const perf = groups.slice(0, cut);
  const cutTime = cut < groups.length ? norm(groups[cut].items[0].created_at) || "9999" : "9999";

  // every player's THOUGHT and TASK events, before the cut — used both to enrich
  // the spoken turns AND to surface agents that worked but never sent a chat.
  const acts = timeline.filter((m) =>
    m.sender_type !== "User" && (m.mtype === "task" || m.mtype === "thought") &&
    norm(m.sender) && index.has(norm(m.sender)) &&
    !isCS(norm(m.sender)) && norm(m.created_at) <= cutTime);

  // turn specs: the speaking turns (with handoffs), PLUS a turn for every player
  // who worked but never spoke — so no one on stage is left silent. Ordered by
  // when each turn began (first text, or first activity for the silent ones).
  interface Spec { name: string; items: TimelineItem[]; sort: string; close: string }
  const specs: Spec[] = perf.map((g) => ({
    name: g.name, items: g.items,
    sort: norm(g.items[0].created_at),
    close: norm(g.items[g.items.length - 1].created_at),
  }));
  const speaking = new Set(perf.map((g) => g.name));
  for (const name of uniq(acts.map((a) => norm(a.sender))).filter((n) => !speaking.has(n))) {
    const ts = acts.filter((a) => eqName(a.sender, name)).map((a) => norm(a.created_at)).sort();
    specs.push({ name, items: [], sort: ts[0], close: ts[ts.length - 1] || "9999" });
  }
  specs.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));

  // closing time per turn + the turn indices per agent (ascending)
  const turnTime = specs.map((s) => s.close);
  const turnsOf = new Map<string, number[]>();
  specs.forEach((s, i) => { const a = turnsOf.get(s.name) || []; a.push(i); turnsOf.set(s.name, a); });

  // bucket each event into the agent's turn whose work it belongs to (its next
  // report — work happens, then the agent reports), so a turn can also speak
  // what it did and was reasoning about, not just the handoff.
  const buckets = new Map<number, { task: string[]; thought: string[] }>();
  for (const m of acts) {
    const idxs = turnsOf.get(norm(m.sender))!;
    const t = norm(m.created_at);
    let target = idxs[idxs.length - 1];
    for (const ti of idxs) { if (t <= turnTime[ti]) { target = ti; break; } }
    const b = buckets.get(target) || { task: [], thought: [] };
    (m.mtype === "task" ? b.task : b.thought).push(norm(m.content));
    buckets.set(target, b);
  }

  const lastPos = new Map<string, number>();
  specs.forEach((s, i) => lastPos.set(s.name, i));

  const occ = new Map<string, number>();
  const artsDone = new Set<string>();
  return specs.map((s, gi) => {
    const p = byPlayer.get(s.name)!;
    const part = partOf(s.name);
    const n = occ.get(s.name) || 0;
    occ.set(s.name, n + 1);

    // who this turn hands to — mentions across the turn, minus self and the human
    const ment = new Set<string>();
    for (const it of s.items) for (const mn of it.mentions || []) {
      const nm = norm(mn);
      if (nm && !eqName(nm, s.name) && nm.toUpperCase() !== "YOU") ment.add(nm);
    }
    const handoff = nameList([...ment].slice(0, 3));

    const base = artsFor(s.name);
    const arts: Arts = artsDone.has(s.name)
      ? { findings: 0, controls: 0, file: "", verdict: base.verdict }
      : base;
    artsDone.add(s.name);

    const summary = compose(part, s.name, p.role, n, handoff, arts, lastPos.get(s.name) === gi, hasApproval);
    const b = buckets.get(gi) || { task: [], thought: [] };
    const line = [summary, enrich(part, b.task, b.thought)].filter(Boolean).join(" ");
    return { name: s.name, inst: p.inst, part, role: p.role, line, playerIndex: index.get(s.name)! };
  });
}

// ---- the mic control + sequential playback -------------------------------

// A bit of vocal character per part; the actual voice is chosen per agent NAME
// (stable hash over the system's installed voices) so each player sounds distinct.
const VOICE_CHAR: Record<Part, { pitch: number; rate: number }> = {
  stage: { pitch: 1.0, rate: 0.99 },
  bandleader: { pitch: 0.82, rate: 0.97 },
  scout: { pitch: 1.18, rate: 1.06 },
  scanner: { pitch: 1.0, rate: 1.04 },
  secrets: { pitch: 0.95, rate: 1.02 },
  mapper: { pitch: 1.12, rate: 1.0 },
  fixer: { pitch: 0.9, rate: 1.0 },
  reviewer: { pitch: 1.06, rate: 0.98 },
};

function hashIndex(s: string, n: number): number {
  if (!n) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

export function StageMic({ turns, onFocus }: {
  turns: Turn[]; onFocus: (i: number | null) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(-1);
  const playingRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      playingRef.current = false;
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  function voiceFor(name: string): SpeechSynthesisVoice | undefined {
    const all = voicesRef.current;
    const pool = all.filter((v) => /^en/i.test(v.lang));
    const use = pool.length ? pool : all;
    if (!use.length) return undefined;
    return use[hashIndex(name, use.length)];
  }

  function speak(t: Turn, done: () => void) {
    if (!supported) { // visual-only fallback: dwell ~ line length
      const ms = Math.min(6500, 1400 + t.line.length * 42);
      window.setTimeout(done, ms);
      return;
    }
    const u = new SpeechSynthesisUtterance(t.line);
    const ch = VOICE_CHAR[t.part] || { pitch: 1, rate: 1 };
    u.pitch = ch.pitch; u.rate = ch.rate;
    const v = voiceFor(t.name);
    if (v) u.voice = v;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  function playFrom(i: number) {
    if (!playingRef.current) return;
    if (i >= turns.length) { stop(); return; }
    setCur(i);
    onFocus(turns[i].playerIndex);
    speak(turns[i], () => { if (playingRef.current) playFrom(i + 1); });
  }

  function start() {
    if (!turns.length) return;
    if (supported) window.speechSynthesis.cancel();
    playingRef.current = true;
    setPlaying(true);
    playFrom(0);
  }

  function stop() {
    playingRef.current = false;
    setPlaying(false);
    setCur(-1);
    if (supported) window.speechSynthesis.cancel();
    onFocus(null);
  }

  if (!turns.length) return null;
  const t = cur >= 0 ? turns[cur] : null;
  const Inst = t ? INSTRUMENTS[t.inst] : null;

  return (
    <div className={"stage-mic" + (playing ? " on" : "")}>
      <button className="mic-btn" onClick={playing ? stop : start}
        title={playing ? "Stop the walkthrough" : "Hear the run — each agent tells their part, in order"}>
        <Icon name={playing ? "stop" : "mic"} />
        <span>{playing ? "Stop the walkthrough" : "Hear the run"}</span>
      </button>
      {t && Inst && (
        <div className="mic-cap" aria-live="polite">
          <span className="mc-ico">{Inst()}</span>
          <span className="mc-body">
            <b className="mc-name">{t.name}</b>
            <span className="mc-line">{t.line}</span>
          </span>
          <span className="mc-eq"><i /><i /><i /><i /></span>
        </div>
      )}
      {!supported && playing && (
        <span className="mic-note mono">Audio isn&apos;t available in this browser — showing the walkthrough.</span>
      )}
    </div>
  );
}
