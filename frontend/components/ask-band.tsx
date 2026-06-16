"use client";

// "Ask the band" — chat with Customer Service (the front desk, on the cheap
// DeepSeek lane) about a run. Your question is relayed into the Band room via the
// Stage Manager; Customer Service answers there (routing to a specialist if it
// needs to). We poll the room timeline and stream the answers back here.

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { INSTRUMENTS, Icon } from "@/components/glyphs";
import { MentionText } from "@/components/mention-text";
import type { TimelineItem } from "@/lib/types";

type Msg = { id: string; role: "you" | "agent"; sender: string; text: string; mentions: string[] };

const ASK_RE = /the Conductor asks:\s*/i;

// Reconstruct the Q&A history already in the room (so reopening keeps context).
function historyFrom(timeline: TimelineItem[]): Msg[] {
  const out: Msg[] = [];
  for (const m of timeline) {
    const text = (m.content || "").trim();
    if (m.mtype !== "text" || !text) continue;
    if (ASK_RE.test(text)) {
      out.push({ id: m.id, role: "you", sender: "You", text: text.replace(ASK_RE, "").replace(/^@\S+\s*/, ""), mentions: [] });
    } else if (m.sender === "Customer Service") {
      out.push({ id: m.id, role: "agent", sender: "Customer Service", text, mentions: m.mentions || [] });
    }
  }
  return out;
}

function instrumentFor(name: string): keyof typeof INSTRUMENTS {
  const n = name.toLowerCase();
  if (n.includes("bandleader")) return "bandleader";
  if (n.includes("scout")) return "scout";
  if (n.includes("scanner") || n.includes("depend")) return "scanner";
  if (n.includes("secret")) return "fixer";
  if (n.includes("complian") || n.includes("mapper")) return "mapper";
  if (n.includes("fixer")) return "fixer";
  if (n.includes("review")) return "reviewer";
  return "conductor";
}

export function AskBand({ roomId, initialTimeline }: { roomId: string; initialTimeline: TimelineItem[] }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => historyFrom(initialTimeline));
  const [input, setInput] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [note, setNote] = useState("");
  const seen = useRef<Set<string>>(new Set(historyFrom(initialTimeline).map((m) => m.id)));
  const scroller = useRef<HTMLDivElement>(null);

  // poll the room for new Customer Service answers while waiting (and lightly always)
  useEffect(() => {
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
          setMsgs((prev) => [...prev, ...fresh.map((m) => ({
            id: m.id, role: "agent" as const, sender: "Customer Service",
            text: (m.content || "").replace(/^@\S+\s*/, "").trim(), mentions: m.mentions || [],
          }))]);
          setWaiting(false);
          setNote("");
        }
      } catch { /* ignore */ }
    }
    const iv = setInterval(pull, waiting ? 3000 : 8000);
    return () => { alive = false; clearInterval(iv); };
  }, [roomId, waiting]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, waiting]);

  async function send() {
    const q = input.trim();
    if (!q || waiting) return;
    setInput("");
    setMsgs((prev) => [...prev, { id: `local-${Date.now()}`, role: "you", sender: "You", text: q, mentions: [] }]);
    setWaiting(true);
    try {
      const r = await api.ask(roomId, q);
      setNote(r.cold_start ? "Customer Service is joining the room…" : "Customer Service is looking into it…");
    } catch {
      setWaiting(false);
      setNote("Couldn’t reach Customer Service. Try again.");
    }
  }

  const empty = useMemo(() => msgs.length === 0, [msgs]);

  return (
    <div className="ask">
      <div className="ask-head">
        <span className="ask-ico">{INSTRUMENTS.reviewer()}</span>
        <div>
          <div className="ask-title">Ask the band</div>
          <div className="ask-sub mono">Customer Service answers from the run — and routes to a specialist if needed</div>
        </div>
      </div>

      <div className="ask-stream" ref={scroller}>
        {empty && (
          <div className="ask-empty">
            <p>Ask anything about this run — “why is the eval() finding high severity?”, “which controls are affected?”, “is the secret still exposed?”</p>
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={`ask-msg ${m.role}`}>
            {m.role === "agent" && (
              <span className="ask-av">{INSTRUMENTS[instrumentFor(m.sender)]()}</span>
            )}
            <div className="ask-bubble">
              {m.role === "agent" && <div className="ask-from">{m.sender}</div>}
              <div className="ask-text"><MentionText text={m.text} mentions={m.mentions} /></div>
            </div>
          </div>
        ))}
        {waiting && (
          <div className="ask-msg agent">
            <span className="ask-av">{INSTRUMENTS.reviewer()}</span>
            <div className="ask-bubble"><div className="ask-typing"><i /><i /><i /></div></div>
          </div>
        )}
      </div>

      {note && <div className="ask-note mono">{note}</div>}
      <div className="ask-input">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask Customer Service about this run…" disabled={waiting} />
        <button className="btn btn-primary" onClick={send} disabled={waiting || !input.trim()}>
          <Icon name="handoff" /> Ask
        </button>
      </div>
      <div className="ask-foot mono">Answers come from the band, through Band · uses the cheap model</div>
    </div>
  );
}
