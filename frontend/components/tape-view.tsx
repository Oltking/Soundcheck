"use client";

// The Master Tape - scrubbable replay of a whole run. The playhead reveals the
// timeline up to a point; play advances it; filter by player. Reads the run's
// full message/event timeline (already projected from the Band trail).

import { useEffect, useMemo, useRef, useState } from "react";
import { INSTRUMENTS, Icon, SevGlyph } from "@/components/glyphs";
import { MentionText } from "@/components/mention-text";
import type { TimelineItem } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  text: "message", thought: "thought", task: "task",
  tool_call: "tool", tool_result: "result", error: "error",
};

export function TapeView({ timeline }: { timeline: TimelineItem[] }) {
  const players = useMemo(() => {
    const s = new Set<string>();
    timeline.forEach((m) => m.sender && s.add(m.sender));
    return [...s];
  }, [timeline]);

  const [filter, setFilter] = useState<string | null>(null);
  const items = useMemo(
    () => (filter ? timeline.filter((m) => m.sender === filter) : timeline),
    [timeline, filter],
  );

  const [head, setHead] = useState(items.length);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // reset head when the filter changes
  useEffect(() => { setHead(items.length); setPlaying(false); }, [items.length]);

  useEffect(() => {
    if (!playing) { if (timer.current) clearInterval(timer.current); return; }
    timer.current = setInterval(() => {
      setHead((h) => {
        if (h >= items.length) { setPlaying(false); return h; }
        return h + 1;
      });
    }, 320);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, items.length]);

  const shown = items.slice(0, head);
  const pct = items.length ? Math.round((head / items.length) * 100) : 0;

  function restart() { setHead(0); setPlaying(true); }

  return (
    <div className="tape">
      <div className="tape-transport">
        <button className="btn btn-icon-only" aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => (head >= items.length ? restart() : setPlaying((p) => !p))}>
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <div className="scrub">
          <input type="range" min={0} max={items.length} value={head} aria-label="Replay position"
            onChange={(e) => { setPlaying(false); setHead(Number(e.target.value)); }} />
          <div className="scrub-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="tape-pos mono tnum">{head}/{items.length}</span>
      </div>

      <div className="tape-filters">
        <button className={filter === null ? "on" : ""} onClick={() => setFilter(null)}>all players</button>
        {players.map((p) => (
          <button key={p} className={filter === p ? "on" : ""} onClick={() => setFilter(p)}>{p}</button>
        ))}
      </div>

      <div className="tape-track">
        {shown.length === 0 && <div className="empty"><Icon name="tape" /><p>Scrub or play to replay the session.</p></div>}
        {shown.map((m, i) => {
          const inst = instrumentFor(m.sender || "");
          const Inst = INSTRUMENTS[inst];
          const isHead = i === shown.length - 1 && head < items.length;
          return (
            <div key={m.id} className={`tape-row ${m.mtype} ${isHead ? "head" : ""}`}>
              <div className="tr-inst">{Inst ? Inst() : <SevGlyph kind="info" />}</div>
              <div className="tr-body">
                <div className="tr-meta mono">
                  <b>{m.sender}</b>
                  {m.mentions && m.mentions.length > 0 && (
                    <span className="tr-handoff">
                      <Icon name="handoff" />
                      {m.mentions.map((name) => <span key={name} className="mention">@{name}</span>)}
                    </span>
                  )}
                  <span className={`tr-type t-${m.mtype}`}>{TYPE_LABEL[m.mtype] || m.mtype}</span>
                  <span className="tr-time">{m.created_at ? new Date(m.created_at).toLocaleTimeString() : ""}</span>
                </div>
                <div className="tr-content">
                  <MentionText text={(m.content || "").trim()} mentions={m.mentions} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function instrumentFor(name: string): keyof typeof INSTRUMENTS {
  const n = name.toLowerCase();
  if (n.includes("bandleader")) return "bandleader";
  if (n.includes("scout")) return "scout";
  if (n.includes("code")) return "scanner";
  if (n.includes("depend")) return "scanner";
  if (n.includes("secret")) return "fixer";
  if (n.includes("complian") || n.includes("mapper")) return "mapper";
  if (n.includes("fixer")) return "fixer";
  if (n.includes("review")) return "reviewer";
  return "conductor";
}
