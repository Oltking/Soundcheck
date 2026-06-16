"use client";

// HeroStage — the marketing centerpiece. The band is placed on a TRUE arc:
// 7 nodes, even angular spacing (half-span 72°, 24° per step) on an ellipse
// centred on the podium, so the distances between consecutive players are equal
// and symmetric, sweeping down to the conductor on the floor. A "thread of light"
// draws slowly from the speaker to the next player. Pure SVG/CSS, no data — SVG
// and HTML share one 0–100 coordinate space so the thread meets each icon exactly.

import { useEffect, useState } from "react";
import { INSTRUMENTS } from "@/components/glyphs";

type Node = { k: keyof typeof INSTRUMENTS; n: string; x: number; y: number };

// Computed from: x = 50 + cos(θ)·42.1, y = 87.3 − sin(θ)·75.3,
// θ = 162° → 18° in 24° steps (see table in the component docs).
const NODES: Node[] = [
  { k: "scout", n: "Scout", x: 10, y: 64 },
  { k: "scanner", n: "Code Scanner", x: 19, y: 37 },
  { k: "mapper", n: "Compliance Mapper", x: 33, y: 18.5 },
  { k: "bandleader", n: "Bandleader", x: 50, y: 12 },
  { k: "fixer", n: "Fixer", x: 67, y: 18.5 },
  { k: "reviewer", n: "Reviewer", x: 81, y: 37 },
  { k: "fixer", n: "Secrets Sentinel", x: 90, y: 64 },
];

const SAY: Record<string, string> = {
  Scout: "ingesting repo → OrgContext",
  "Code Scanner": "static analysis · 3 issues",
  "Compliance Mapper": "→ SOC 2 CC6.1",
  Bandleader: "sequencing the band",
  Fixer: "patch on a branch",
  Reviewer: "cross-model: PASS",
  "Secrets Sentinel": "key redacted at file:line",
};

const CYCLE = 3800; // ms between handoffs — slow and readable

export function HeroStage() {
  const [active, setActive] = useState(3);
  const [thread, setThread] = useState<{ from: number; to: number; key: number }>({ from: 3, to: 4, key: 0 });

  useEffect(() => {
    let key = 0;
    const iv = setInterval(() => {
      setActive((prev) => {
        let to = Math.floor(Math.random() * NODES.length);
        if (to === prev) to = (to + 1) % NODES.length;
        key += 1;
        setThread({ from: prev, to, key });
        return to;
      });
    }, CYCLE);
    return () => clearInterval(iv);
  }, []);

  const a = NODES[thread.from];
  const b = NODES[thread.to];
  const mx = (a.x + b.x) / 2;
  const my = Math.min(a.y, b.y) - 16; // bow the thread upward between players

  return (
    <div className="hero-stage" aria-hidden="true">
      <svg className="hs-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <radialGradient id="hs-foot" cx="50%" cy="100%" r="75%">
            <stop offset="0%" stopColor="rgba(37,99,235,0.22)" />
            <stop offset="55%" stopColor="rgba(37,99,235,0.06)" />
            <stop offset="100%" stopColor="rgba(37,99,235,0)" />
          </radialGradient>
          <filter id="hs-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.7" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* footlight pooling up from the floor */}
        <rect x="0" y="58" width="100" height="42" fill="url(#hs-foot)" />
        {/* concentric stage rings on the ground */}
        <ellipse cx="50" cy="90" rx="44" ry="6.5" fill="none" stroke="rgba(22,32,46,0.06)" strokeWidth="0.18" />
        <ellipse cx="50" cy="89" rx="30" ry="4.6" fill="none" stroke="rgba(22,32,46,0.09)" strokeWidth="0.18" />
        <ellipse cx="50" cy="88" rx="16" ry="3.2" fill="none" stroke="rgba(37,99,235,0.22)" strokeWidth="0.22" />

        {/* faint guide showing the route the light will take */}
        <path key={`g${thread.key}`} className="hs-guide"
          d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
          fill="none" stroke="var(--line-strong)" strokeWidth="0.35"
          strokeDasharray="0.5 2.4" strokeLinecap="round" />
        {/* the bright thread draws slowly from speaker → next player */}
        <path key={`t${thread.key}`} className="hs-thread" pathLength={100}
          d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
          fill="none" stroke="var(--live-bright)" strokeWidth="0.7"
          strokeLinecap="round" filter="url(#hs-glow)" />
        <circle key={`o${thread.key}`} className="hs-pip" cx={a.x} cy={a.y} r="0.9" fill="var(--live)" />
        <circle key={`r${thread.key}`} className="hs-ripple" cx={b.x} cy={b.y} r="1" fill="none" stroke="var(--live-bright)" strokeWidth="0.4" />
      </svg>

      {NODES.map((node, i) => (
        <div
          key={node.n}
          className={`hs-node ${i === active ? "on" : ""}`}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <span className="hs-ico">{INSTRUMENTS[node.k]()}</span>
          <span className="hs-label">
            <b>{node.n}</b>
            {i === active && <i className="say">{SAY[node.n]}</i>}
          </span>
        </div>
      ))}

      <div className="hs-podium">
        <span className="hs-pod-ico">{INSTRUMENTS.conductor()}</span>
        <span className="hs-pod-label"><b>You</b> · the conductor</span>
      </div>
    </div>
  );
}
