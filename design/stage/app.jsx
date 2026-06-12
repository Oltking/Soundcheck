/* global React, ReactDOM, PLAYERS, SET, FINDINGS, INSTRUMENTS, SevChip, SevGlyph, Icon,
   useTweaks, TweaksPanel, TweakSection, TweakSlider, TweakRadio, TweakSelect */
const { useState, useEffect, useRef, useCallback } = React;

/* ============================================================
   Layout — concert-hall arc (fixed canvas, scaled to fit)
   ============================================================ */
const STAGE_W = 1100, STAGE_H = 496, CARD_W = 176, CARD_H = 132;
const ARC_ORDER = ['scout', 'scanner', 'bandleader', 'mapper', 'fixer', 'reviewer'];
const CENTERS_X = [108, 290, 470, 630, 810, 992];
const TOPS_Y    = [196, 78, 18, 18, 78, 196];
const POS = {}; // id -> {left, top, cx, cy}
ARC_ORDER.forEach((id, i) => {
  POS[id] = { left: CENTERS_X[i] - CARD_W / 2, top: TOPS_Y[i], cx: CENTERS_X[i], cy: TOPS_Y[i] + CARD_H / 2 };
});
const PODIUM = { x: STAGE_W / 2, y: 392 };
const byId = (id) => PLAYERS.find(p => p.id === id);
const F = {}; FINDINGS.forEach(f => F[f.id] = f);

/* ============================================================
   Live engine — focus travels the workflow; findings land
   ============================================================ */
const ORDER = ['scout', 'bandleader', 'scanner', 'mapper', 'fixer', 'reviewer'];
const slen = (id) => byId(id).stream.length;
const LAND = {
  'scanner:2': 'f1', 'scanner:4': 'f2', 'scanner:6': 'f3',
  'mapper:2': 'f4', 'mapper:4': 'f5', 'mapper:5': 'f6',
};
const REMEDIATED = { sev: 'approved', title: 'Hard-coded AWS secret — remediated', remediated: true };

function landFinding(list, id) {
  if (list.some(x => x.id === id)) return list;
  return [...list, { ...F[id] }];
}

function initLive() {
  // start mid-performance: scout + bandleader done, scanner thinking, two findings up
  const status = { scout: 'done', bandleader: 'done', scanner: 'thinking', mapper: 'idle', fixer: 'idle', reviewer: 'idle' };
  const shown = { scout: slen('scout'), bandleader: slen('bandleader'), scanner: 4, mapper: 0, fixer: 0, reviewer: 0 };
  let findings = [];
  findings = landFinding(findings, 'f1');
  findings = landFinding(findings, 'f2');
  return { t: 1, focus: ORDER.indexOf('scanner'), shown, status, findings,
    thread: { from: 'bandleader', to: 'scanner', key: 'init' } };
}

function stepLive(s) {
  const t = s.t + 1;
  const pid = ORDER[s.focus];
  const len = slen(pid);
  let { focus, thread } = s;
  const shown = { ...s.shown };
  const status = { ...s.status };
  let findings = s.findings;

  if (shown[pid] < len) {
    shown[pid] += 1;
    status[pid] = 'thinking';
    const k = pid + ':' + shown[pid];
    if (LAND[k]) findings = landFinding(findings, LAND[k]);
    if (pid === 'reviewer' && shown[pid] >= 4) {
      findings = findings.map(f => f.id === 'f1' && !f.remediated ? { ...f, ...REMEDIATED } : f);
    }
  } else {
    status[pid] = 'done';
    if (focus < ORDER.length - 1) {
      const to = ORDER[focus + 1];
      status[to] = 'thinking';
      thread = { from: pid, to, key: t };
      focus += 1;
    } else {
      // continuous mode — re-scan; findings persist on the Score
      focus = 0;
      ORDER.forEach(id => { shown[id] = 0; status[id] = 'idle'; });
      status.scout = 'thinking';
      thread = null;
    }
  }
  return { t, focus, shown, status, findings, thread };
}

/* ============================================================
   Small pieces
   ============================================================ */
function Inst({ id }) { const C = INSTRUMENTS[id]; return <C />; }

function StatusTag({ status }) {
  if (status === 'thinking') return (
    <span className="p-stat thinking"><span className="eq"><i /><i /><i /><i /></span>thinking</span>);
  if (status === 'done') return (
    <span className="p-stat done"><SevGlyph kind="approved" />done</span>);
  return <span className="p-stat idle"><Icon name="dot" />idle</span>;
}

function StreamLines({ player, shown, thinking }) {
  if (shown === 0) return (
    <div className="p-stream"><div className="sline idle-line">— standing by —</div></div>);
  const start = Math.max(0, shown - 3);
  const lines = player.stream.slice(start, shown);
  return (
    <div className="p-stream">
      {lines.map((ln, i) => {
        const isNew = start + i === shown - 1;
        return (
          <div className={'sline' + (isNew ? ' new' : '')} key={start + i}>
            <span className="k">{ln[0]}</span> {ln[1]}
            {isNew && thinking ? <span className="caret" /> : null}
          </div>);
      })}
    </div>);
}

function PlayerCard({ player, status, shown, recipient }) {
  const p = POS[player.id];
  return (
    <div className={`player ${status}${recipient ? ' recipient' : ''}`}
         style={{ left: p.left, top: p.top }} data-screen-label={player.name}>
      <div className="p-top">
        <div className="inst"><Inst id={player.inst} /></div>
        <div className="p-id">
          <div className="p-name">{player.name}</div>
          <div className="p-handle">{player.handle}</div>
        </div>
        <StatusTag status={status} />
      </div>
      <div className="p-role">{player.role} · {player.model}</div>
      <StreamLines player={player} shown={shown} thinking={status === 'thinking'} />
    </div>);
}

function Threads({ thread, reduced }) {
  if (!thread) return null;
  const a = POS[thread.from], b = POS[thread.to];
  const mx = (a.cx + b.cx) / 2, my = Math.min(a.cy, b.cy) - 54;
  const d = `M ${a.cx} ${a.cy} Q ${mx} ${my} ${b.cx} ${b.cy}`;
  return (
    <svg className="thread-svg" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} key={thread.key}>
      <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1.4" strokeDasharray="2 6" opacity="0.7" />
      <path className={reduced ? '' : 'travel'} d={d} fill="none" stroke="var(--live)"
            strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />
      <circle cx={a.cx} cy={a.cy} r="3.5" fill="var(--live)" />
      <circle className={reduced ? '' : 'arrival'} cx={b.cx} cy={b.cy} r="4" fill="none"
              stroke="var(--live)" strokeWidth="2" />
      <circle cx={b.cx} cy={b.cy} r="3.5" fill="var(--live-bright)" />
    </svg>);
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
      {/* concentric stage rings — the band stands within them */}
      <ellipse cx={STAGE_W / 2} cy={PODIUM.y + 36} rx="500" ry="78" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.55" />
      <ellipse cx={STAGE_W / 2} cy={PODIUM.y + 30} rx="350" ry="56" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.7" />
      <ellipse cx={STAGE_W / 2} cy={PODIUM.y + 24} rx="200" ry="36" fill="none" stroke="var(--line-strong)" strokeWidth="1" opacity="0.7" />
      {/* back arc the players sit along */}
      <path d={`M90 ${TOPS_Y[0] + 40} Q${STAGE_W / 2} -54 ${STAGE_W - 90} ${TOPS_Y[0] + 40}`} fill="none" stroke="var(--line)" strokeWidth="1.2" strokeDasharray="2 7" opacity="0.6" />
      {/* sightlines from the inner players to the podium */}
      <path d={`M470 152 Q${STAGE_W / 2} 300 ${PODIUM.x} ${PODIUM.y}`} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 6" opacity="0.4" />
      <path d={`M630 152 Q${STAGE_W / 2} 300 ${PODIUM.x} ${PODIUM.y}`} fill="none" stroke="var(--line)" strokeWidth="1" strokeDasharray="2 6" opacity="0.4" />
    </svg>);
}

function Podium() {
  return (
    <div className="podium" style={{ left: PODIUM.x, top: PODIUM.y }}>
      <div className="stand"><INSTRUMENTS.conductor /></div>
      <div className="plabel"><b>You</b> · the conductor</div>
      <div className="sub">final authority · nothing ships without sign-off</div>
    </div>);
}

/* ============================================================
   The Score rail
   ============================================================ */
function ScoreFinding({ f }) {
  const conf = Math.round(f.confidence * 100);
  return (
    <div className={`finding ${f.sev}`}>
      <div className="f-top">
        <div className="f-title">{f.title}</div>
        <SevChip kind={f.sev} />
      </div>
      <div className="f-meta">
        <span>{f.evidence}{f.redacted ? ' · secret redacted' : ''}</span><br />
        <span className="ctrl">{f.control}</span>
      </div>
      <div className="f-foot">
        <span className="f-by">@acme/{f.by}</span>
        {f.remediated ? (
          <span className="conf"><SevGlyph kind="approved" />&nbsp;shipped · PR #1284</span>
        ) : f.sev === 'info' ? (
          <span className="f-by">context only</span>
        ) : (
          <button className="promote"><Icon name="handoff" />promote to fix</button>
        )}
      </div>
      {!f.remediated && f.sev !== 'info' ? (
        <div className="conf" style={{ marginTop: 8 }}>
          <span style={{ color: 'var(--ink-3)' }}>fix&nbsp;confidence</span>
          <span className="conf-bar"><i style={{ width: conf + '%' }} /></span>{conf}%
        </div>) : null}
    </div>);
}

function ScoreRail({ findings }) {
  const listRef = useRef(null);
  return (
    <aside className="score-rail">
      <div className="score-head">
        <div className="row1">
          <h2>The Score</h2>
          <span className="count">{findings.length} {findings.length === 1 ? 'entry' : 'entries'}</span>
        </div>
        <div className="sub">evidence ledger · every finding, written down &amp; auditable</div>
      </div>
      {findings.length === 0 ? (
        <div className="score-empty">
          <Icon name="tape" />
          <p>No findings yet.<br />The Score fills as the band performs.</p>
        </div>
      ) : (
        <div className="score-list" ref={listRef}>
          {findings.slice().reverse().map(f => <ScoreFinding key={f.id} f={f} />)}
        </div>
      )}
    </aside>);
}

/* ============================================================
   Top bar
   ============================================================ */
function TallyGlyph({ kind }) { return <SevGlyph kind={kind} />; }

function TopBar({ run, progress, tallies, timer, onToggle }) {
  const paused = run !== 'live';
  return (
    <header className="topbar">
      <div className="brand-min">
        <div className="mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="#1F8A7A" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h2.2l1.6-6 2.6 13 2.4-9 1.8 5 1.6-3H21" />
          </svg>
        </div>
        <div className="wm">sound<b>check</b></div>
        <div className="crumb">the stage</div>
      </div>

      <div className="set-block">
        <span className="set-id"><b>{SET.id}</b> · {SET.repo}</span>
        <div className="progress"><i style={{ width: progress + '%' }} /></div>
        <span className="pct">{progress}%</span>
        <span className="tallies">
          <span style={{ color: 'var(--severe)' }}><TallyGlyph kind="critical" />{tallies.critical}</span>
          <span style={{ color: 'var(--attention)' }}><TallyGlyph kind="attention" />{tallies.attention}</span>
          <span style={{ color: 'var(--approved)' }}><TallyGlyph kind="approved" />{tallies.approved}</span>
        </span>
      </div>

      <div className="chrome-right">
        <span className={'live-flag' + (paused ? ' paused' : '')}>
          <span className="breathe live-dot" />{paused ? 'paused' : 'live'}
        </span>
        <span className="timer">{timer}</span>
        <button className="btn btn-icon" title={paused ? 'Resume set' : 'Pause set'} onClick={onToggle}>
          <Icon name={paused ? 'play' : 'pause'} />
        </button>
        <button className="btn btn-ghost"><Icon name="tape" />Master Tape</button>
        <div className="conductor-chip">
          <span className="cond-av">AC</span>
          <span className="cond-name">Avery Cole<span>security lead</span></span>
        </div>
      </div>
    </header>);
}

/* ============================================================
   Snapshots for non-live states
   ============================================================ */
function emptySnap() {
  const status = {}, shown = {};
  ORDER.forEach(id => { status[id] = 'idle'; shown[id] = 0; });
  return { status, shown, findings: [], thread: null };
}
function tuningSnap(scoutShown) {
  const status = {}, shown = {};
  ORDER.forEach(id => { status[id] = 'idle'; shown[id] = 0; });
  status.scout = 'thinking'; shown.scout = scoutShown;
  return { status, shown, findings: [], thread: null };
}

/* ============================================================
   Tweaks side-effects (fonts, warmth)
   ============================================================ */
const FONTS = {
  inter:  { ui: "'Inter Tight', system-ui, sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace", href: null },
  geist:  { ui: "'Geist', system-ui, sans-serif", mono: "'Geist Mono', ui-monospace, monospace",
            href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap' },
  hanken: { ui: "'Hanken Grotesk', system-ui, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace",
            href: 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap' },
};
const WARMTH = {
  cooler: { '--paper': '#EDEAE0', '--paper-well': '#E5E1D4', '--surface': '#F4F1E8', '--surface-2': '#FAF8F1', '--inset': '#E2DDCF' },
  warm:   { '--paper': '#EFE8DA', '--paper-well': '#E8E0CE', '--surface': '#F4EFE3', '--surface-2': '#FAF6EC', '--inset': '#E3D9C5' },
  warmer: { '--paper': '#F1E6CF', '--paper-well': '#EADEC3', '--surface': '#F7EFDA', '--surface-2': '#FCF6E6', '--inset': '#E8D9BA' },
};
function applyFont(key) {
  const f = FONTS[key] || FONTS.inter;
  const root = document.documentElement;
  root.style.setProperty('--ui', f.ui);
  root.style.setProperty('--mono', f.mono);
  let link = document.getElementById('font-extra');
  if (f.href) {
    if (!link) { link = document.createElement('link'); link.id = 'font-extra'; link.rel = 'stylesheet'; document.head.appendChild(link); }
    if (link.href !== f.href) link.href = f.href;
  } else if (link) { link.remove(); }
}
function applyWarmth(key) {
  const w = WARMTH[key] || WARMTH.warm;
  const root = document.documentElement;
  Object.entries(w).forEach(([k, v]) => root.style.setProperty(k, v));
}

/* ============================================================
   App
   ============================================================ */
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "streamSpeed": 1,
  "font": "inter",
  "warmth": "warm"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [run, setRun] = useState('live');        // empty | tuning | live
  const [sim, setSim] = useState(initLive);
  const [scoutShown, setScoutShown] = useState(3);
  const [seconds, setSeconds] = useState(744);   // 12:24 — mid-set
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxProg = useRef(0);

  useEffect(() => { applyFont(t.font); }, [t.font]);
  useEffect(() => { applyWarmth(t.warmth); }, [t.warmth]);

  // live engine tick
  useEffect(() => {
    if (run !== 'live') return;
    const period = Math.max(380, 1500 / (t.streamSpeed || 1));
    const iv = setInterval(() => setSim(s => stepLive(s)), period);
    return () => clearInterval(iv);
  }, [run, t.streamSpeed]);

  // tuning: animate scout's stream for life
  useEffect(() => {
    if (run !== 'tuning') return;
    const iv = setInterval(() => setScoutShown(v => (v % slen('scout')) + 1), Math.max(500, 1400 / (t.streamSpeed || 1)));
    return () => clearInterval(iv);
  }, [run, t.streamSpeed]);

  // elapsed timer
  useEffect(() => {
    if (run !== 'live') return;
    const iv = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [run]);

  // resolve current scene
  let scene;
  if (run === 'empty') scene = emptySnap();
  else if (run === 'tuning') scene = tuningSnap(scoutShown);
  else scene = sim;

  // progress + tallies
  let progress = 0;
  if (run === 'live') {
    const pid = ORDER[sim.focus];
    const live = (sim.focus + (sim.shown[pid] || 0) / slen(pid)) / ORDER.length;
    maxProg.current = Math.max(maxProg.current, live);
    progress = Math.round(maxProg.current * 100);
  } else if (run === 'tuning') progress = 6;
  const tallies = { critical: 0, attention: 0, approved: 0 };
  scene.findings.forEach(f => { if (tallies[f.sev] != null) tallies[f.sev] += 1; });

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const recipient = scene.thread && scene.status[scene.thread.to] === 'thinking' ? scene.thread.to : null;

  const startSet = useCallback(() => { maxProg.current = 0; setSim(initLive()); setSeconds(744); setRun('live'); }, []);

  // scaling — measure the stage-wrap and fit the fixed canvas inside it
  const wrapRef = useRef(null);
  const [sc, setSc] = useState(0.5);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 40, h = el.clientHeight - 28;
      if (w <= 0 || h <= 0) return;
      setSc(Math.max(0.42, Math.min(1, w / STAGE_W, h / STAGE_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    const r1 = requestAnimationFrame(measure);
    const tmo = setTimeout(measure, 250);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); cancelAnimationFrame(r1); clearTimeout(tmo); };
  }, []);

  return (
    <div className="app">
      <TopBar run={run} progress={progress} tallies={tallies}
              timer={`${mm}:${ss}`} onToggle={() => setRun(r => r === 'live' ? 'empty' : 'live')} />
      <div className="body">
        <section className="stage-region">
          <div className="stage-head">
            <div className="title">The Stage<span>the live workforce · 6 players</span></div>
            <div className="statepick">
              {['empty', 'tuning', 'live'].map(s => (
                <button key={s} className={run === s ? 'on' : ''} onClick={() => s === 'live' ? startSet() : setRun(s)}>
                  {s === 'tuning' ? 'tuning in' : s}
                </button>))}
            </div>
          </div>

          <div className="stage-wrap" ref={wrapRef}>
            {run === 'tuning' ? (
              <div className="tuning-banner">
                <span className="breathe live-dot" />
                <span>Scout is tuning in…</span>
                <span className="mono">reading {SET.repo}</span>
              </div>) : null}

            <div className="stage-scale" style={{ transform: `scale(${sc})` }}>
              <div className="stage-floor" style={{ width: STAGE_W, height: STAGE_H }}>
                <FloorBg />
                <Threads thread={run === 'live' ? scene.thread : null} reduced={reduced} />
                {PLAYERS.map(p => (
                  <PlayerCard key={p.id} player={p}
                    status={scene.status[p.id]} shown={scene.shown[p.id]}
                    recipient={recipient === p.id} />))}
                <Podium />
              </div>
            </div>

            {run === 'empty' ? (
              <div className="stage-empty">
                <div className="mark" style={{ width: 52, height: 52, borderRadius: 14 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#1F8A7A" strokeWidth="2" strokeLinecap="round" style={{ width: 30, height: 30 }}>
                    <path d="M3 12h2.2l1.6-6 2.6 13 2.4-9 1.8 5 1.6-3H21" />
                  </svg>
                </div>
                <div className="lead">
                  <h3>The stage is dark</h3>
                  <p>Six players are tuned and waiting. Start the set to send Scout in and watch the band perform — every step visible, every decision recorded.</p>
                </div>
                <button className="btn btn-primary" onClick={startSet}><Icon name="play" />Start the set</button>
              </div>) : null}
          </div>
        </section>

        <ScoreRail findings={scene.findings} />
      </div>

      <TweaksPanel>
        <TweakSection label="Performance" />
        <TweakSlider label="Live-stream speed" value={t.streamSpeed} min={0.3} max={3} step={0.1}
                     unit="×" onChange={(v) => setTweak('streamSpeed', v)} />
        <TweakSection label="Type" />
        <TweakSelect label="Typeface" value={t.font}
                     options={[{ value: 'inter', label: 'Inter Tight + IBM Plex Mono' }, { value: 'geist', label: 'Geist + Geist Mono' }, { value: 'hanken', label: 'Hanken + JetBrains Mono' }]}
                     onChange={(v) => setTweak('font', v)} />
        <TweakSection label="Paper" />
        <TweakRadio label="Warmth" value={t.warmth} options={['cooler', 'warm', 'warmer']}
                    onChange={(v) => setTweak('warmth', v)} />
      </TweaksPanel>
    </div>);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
