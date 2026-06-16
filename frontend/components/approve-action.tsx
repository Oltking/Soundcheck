"use client";

// In-site approval. The patch only ships when YOU authorize it — and the
// authorization is a real message in the Band room (the agents read it via the
// token-free Stage Manager). Band's Human API is Enterprise-gated, so we can't
// post as you from here; instead this makes it one click: it copies the exact
// approval message and opens the room so you just paste & send. (True one-click
// in-site approval needs the Band Human API.)

import { useState } from "react";
import { Icon } from "@/components/glyphs";

const APPROVE_MSG = "@Stage Manager APPROVE";
// Overridable if Band's web room route differs.
const BAND_APP = process.env.NEXT_PUBLIC_BAND_APP_URL || "https://app.band.ai";

export function ApproveAction({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(APPROVE_MSG);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* clipboard blocked */ }
  }

  const roomUrl = `${BAND_APP}/chats/${roomId}`;

  return (
    <div className="approve">
      <div className="approve-steps">
        <span className="approve-step"><b>1</b> Copy the approval</span>
        <span className="approve-step"><b>2</b> Open the room</span>
        <span className="approve-step"><b>3</b> Paste &amp; send</span>
      </div>
      <div className="approve-actions">
        <button className="btn btn-primary" onClick={copy}>
          <Icon name={copied ? "check" : "handoff"} />
          {copied ? "Copied — now paste in the room" : "Copy approval message"}
        </button>
        <a className="btn" href={roomUrl} target="_blank" rel="noreferrer" onClick={copy}>
          <Icon name="arrowUpRight" /> Approve in the Band room
        </a>
        <code className="approve-msg mono">{APPROVE_MSG}</code>
      </div>
      <div className="approve-note">
        No PR is opened without this. Anything other than <b>APPROVE</b> — or no reply — declines.
      </div>
    </div>
  );
}
