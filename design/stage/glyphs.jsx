/* global React */
// Soundcheck — instrument glyphs (one per player) + severity glyphs + UI icons.
// Stroke glyphs on a 24x24 grid, sharing the same weight so the roster reads as a set.

const G = ({ children, sw = 1.7 }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
       strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

// ---- Instruments -------------------------------------------------------
// Scout — a tuning fork "tuning in" to the company, with a faint signal arc.
const InstScout = () => (<G>
  <path d="M9 3v6" /><path d="M15 3v6" />
  <path d="M9 9c0 1.9 1.3 3 3 3s3-1.1 3-3" />
  <path d="M12 12v9" />
  <path d="M17.2 5.4a3.4 3.4 0 0 1 0 4.2" opacity="0.55" />
</G>);

// Bandleader — the conductor's baton tracing a downbeat.
const InstBandleader = () => (<G>
  <path d="M4.5 19.5 14.5 9.5" /><circle cx="15.8" cy="8.2" r="1.5" />
  <path d="M5 11c2.2 2.4 4.4 2.4 6.6 0" opacity="0.55" />
  <path d="M17.5 13.5h2.2" opacity="0.55" /><path d="M16.5 16.4h2.6" opacity="0.55" />
</G>);

// Code Scanner — a magnifier reading a waveform of source.
const InstScanner = () => (<G>
  <circle cx="10" cy="10" r="6" />
  <path d="M14.5 14.5 20 20" />
  <path d="M7 10h1.3l1-2.2 1.6 4.2 1-2H13" sw={1.5} />
</G>);

// Compliance Mapper — a note on the staff, mapping findings to the score.
const InstMapper = () => (<G>
  <path d="M4 8h16" opacity="0.5" /><path d="M4 12h16" opacity="0.5" /><path d="M4 16h16" opacity="0.5" />
  <circle cx="8.4" cy="16" r="1.9" fill="currentColor" stroke="none" />
  <path d="M10.3 16V7l6-1.2" /><path d="M10.3 9.6 16.3 8.4" />
</G>);

// Fixer — a wrench: makes the safe repairs.
const InstFixer = () => (<G>
  <path d="M15 5.5a3.8 3.8 0 0 0-5 5L4.5 16 8 19.5l5.5-5.5a3.8 3.8 0 0 0 5-5l-2.4 2.4-2.3-.6-.6-2.3z" />
</G>);

// Reviewer — monitoring headphones: listens back before sign-off.
const InstReviewer = () => (<G>
  <path d="M5 13.5v-1.5a7 7 0 0 1 14 0v1.5" />
  <rect x="3.4" y="13" width="3.6" height="6.2" rx="1.6" />
  <rect x="17" y="13" width="3.6" height="6.2" rx="1.6" />
</G>);

// Conductor (you) — a music stand / lectern: final authority.
const InstConductor = () => (<G>
  <path d="M12 3v5" /><path d="M7.5 8h9l-2 6.5H9.5z" />
  <path d="M12 14.5V21" /><path d="M8.8 21h6.4" />
</G>);

const INSTRUMENTS = {
  scout: InstScout, bandleader: InstBandleader, scanner: InstScanner,
  mapper: InstMapper, fixer: InstFixer, reviewer: InstReviewer, conductor: InstConductor,
};

// ---- Severity glyphs (shape-first, color via parent) -------------------
const SevGlyph = ({ kind }) => {
  switch (kind) {
    case 'critical': return (<svg viewBox="0 0 12 12"><path d="M6 .8 11.2 6 6 11.2.8 6Z" fill="currentColor" /></svg>);
    case 'attention': return (<svg viewBox="0 0 12 12"><rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1.4" fill="currentColor" /></svg>);
    case 'approved': return (<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5.2" fill="currentColor" /><path d="M3.6 6.2 5.2 7.8 8.4 4.4" fill="none" stroke="var(--approved-tint)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>);
    case 'archive': return (<svg viewBox="0 0 12 12"><path d="M1.2 3 10.8 3 6 11Z" fill="currentColor" /></svg>);
    case 'live': return (<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="3" fill="currentColor" /><circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1" /></svg>);
    default: return (<svg viewBox="0 0 12 12"><rect x="1.4" y="5.2" width="9.2" height="1.6" rx="0.8" fill="currentColor" /></svg>);
  }
};

const SEV_LABEL = { critical: 'high', attention: 'review', approved: 'remediated', archive: 'on the tape', info: 'info', live: 'live' };

const SevChip = ({ kind, label }) => (
  <span className={`sev sev-${kind}`}><SevGlyph kind={kind} />{label ?? SEV_LABEL[kind]}</span>
);

// ---- Small UI icons ----------------------------------------------------
const Icon = ({ name, sw = 1.7 }) => {
  const p = {
    play: <path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none" />,
    pause: <g fill="currentColor" stroke="none"><rect x="6.5" y="5" width="3.6" height="14" rx="1.2" /><rect x="13.9" y="5" width="3.6" height="14" rx="1.2" /></g>,
    tape: <g><rect x="2.5" y="5.5" width="19" height="13" rx="3" /><circle cx="8" cy="12" r="2.4" /><circle cx="16" cy="12" r="2.4" /><path d="M10.4 12h3.2" /></g>,
    github: <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.66-.2.66-.46v-1.6c-2.7.6-3.27-1.3-3.27-1.3-.44-1.12-1.08-1.42-1.08-1.42-.88-.6.07-.6.07-.6 1 .07 1.5 1 1.5 1 .87 1.5 2.3 1.06 2.86.8.08-.63.34-1.06.62-1.3-2.16-.24-4.43-1.08-4.43-4.8 0-1.06.38-1.93 1-2.6-.1-.25-.44-1.24.1-2.58 0 0 .82-.26 2.7 1a9.4 9.4 0 0 1 4.9 0c1.87-1.26 2.7-1 2.7-1 .53 1.34.2 2.33.1 2.58.62.67 1 1.54 1 2.6 0 3.73-2.27 4.55-4.44 4.8.35.3.66.9.66 1.8v2.66c0 .26.16.57.67.46A9.5 9.5 0 0 0 12 2.5z" fill="currentColor" stroke="none" />,
    arrowUpRight: <g><path d="M7 17 17 7" /><path d="M8 7h9v9" /></g>,
    handoff: <g><path d="M4 12h13" /><path d="M13 7l5 5-5 5" /></g>,
    check: <path d="M5 12.5 10 17.5 19 7" />,
    sparkle: <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />,
    settings: <g><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></g>,
    clock: <g><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></g>,
    chevron: <path d="M9 6l6 6-6 6" />,
    dot: <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />,
  }[name];
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{p}</svg>);
};

Object.assign(window, { INSTRUMENTS, SevGlyph, SevChip, SEV_LABEL, Icon });
