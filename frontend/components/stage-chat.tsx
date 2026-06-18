"use client";

// A small chat dock in the corner of the Stage — the Stage IS the room, so you
// ask here and Customer Service's answers appear right on the stage. Questions are
// relayed into the Band room (via the Stage Manager); we poll the room for replies.

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { INSTRUMENTS, Icon } from "@/components/glyphs";
import { MentionText } from "@/components/mention-text";
import type { TimelineItem } from "@/lib/types";

type Msg = { id: string; role: "you" | "agent"; text: string; mentions: string[] };

const ASK_RE = /the Conductor asks:\s*/i;

function historyFrom(timeline: TimelineItem[]): Msg[] {
  const out: Msg[] = [];
  for (const m of timeline) {
    const text = (m.content || "").replace(/\[Run facts you may use:[\s\S]*$/i, "").trim();
    if (m.mtype !== "text" || !text) continue;
    if (ASK_RE.test(text)) {
      out.push({ id: m.id, role: "you", text: text.replace(ASK_RE, "").replace(/^@\S+\s*/, ""), mentions: [] });
    } else if (m.sender === "Customer Service") {
      out.push({ id: m.id, role: "agent", text, mentions: m.mentions || [] });
    }
  }
  return out;
}

export function StageChat({ roomId, initialTimeline }: { roomId: string; initialTimeline: TimelineItem[] }) {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [msgs, setMsgs] = useState<Msg[]>(() => historyFrom(initialTimeline));
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState("");
  const seen = useRef<Set<string>>(new Set(historyFrom(initialTimeline).map((m) => m.id)));
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function pull() {
      try {
        await api.refreshOne(roomId);
        const { timeline } = await api.timeline(roomId);
        if (!alive) return;
        const fresh = timeline.filter(
          (m) => m.mtype === "text" && m.sender === "Customer Service" && !seen.current.has(m.id));
        if (fresh.length) {
          fresh.forEach((m) => seen.current.add(m.id));
          setMsgs((p) => [...p, ...fresh.map((m) => ({
            id: m.id, role: "agent" as const,
            text: (m.content || "").replace(/^@\S+\s*/, "").trim(), mentions: m.mentions || [],
          }))]);
          setWaiting(false);
          setNote("");
        }
      } catch { /* ignore */ }
    }
    pull();
    const iv = setInterval(pull, waiting ? 3000 : 9000);
    return () => { alive = false; clearInterval(iv); };
  }, [open, roomId, waiting]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, waiting, open]);

  async function send() {
    const q = input.trim();
    if (!q || waiting) return;
    setInput("");
    setMsgs((p) => [...p, { id: `local-${Date.now()}`, role: "you", text: q, mentions: [] }]);
    setWaiting(true);
    try {
      const r = await api.ask(roomId, q);
      setNote(r.cold_start ? "Customer Service is joining the room…" : "");
    } catch {
      setWaiting(false);
      setNote("Couldn’t reach Customer Service.");
    }
  }

  if (!open) {
    return (
      <div className="sc-dock">
        <button className="sc-fab" onClick={() => { setOpen(true); setShowHint(false); }} aria-label="Ask the band">
          <span className="sc-fab-ico">{INSTRUMENTS.reviewer()}</span>
          Ask the band
          <span className="sc-fab-ping" aria-hidden />
        </button>
        {showHint && (
          <div className="sc-hint" role="note">
            <span className="sc-hint-t">Curious about this run? <b>Ask the band.</b></span>
            <span className="sc-hint-eg mono">“most serious finding?” · “which controls are hit?”</span>
            <button className="sc-hint-x" onClick={() => setShowHint(false)} aria-label="Dismiss">
              <Icon name="chevron" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stage-chat open">
      <div className="sc-head">
        <span className="sc-ico">{INSTRUMENTS.reviewer()}</span>
        <div className="sc-h-t">Ask the band<span>Customer Service · in the room</span></div>
        <button className="sc-x" onClick={() => setOpen(false)} aria-label="Close chat"><Icon name="chevron" /></button>
      </div>
      <div className="sc-stream" ref={scroller}>
        {msgs.length === 0 && <div className="sc-empty">Ask anything about this run — “most serious finding?”, “which controls are hit?”</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`sc-msg ${m.role}`}>
            <div className="sc-bubble"><MentionText text={m.text} mentions={m.mentions} /></div>
          </div>
        ))}
        {waiting && <div className="sc-msg agent"><div className="sc-bubble"><span className="sc-typing"><i /><i /><i /></span></div></div>}
      </div>
      {note && <div className="sc-note mono">{note}</div>}
      <div className="sc-input">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the band…" disabled={waiting} />
        <button onClick={send} disabled={waiting || !input.trim()} aria-label="Send"><Icon name="handoff" /></button>
      </div>
    </div>
  );
}
