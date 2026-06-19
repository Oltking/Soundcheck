import { INSTRUMENTS } from "@/components/glyphs";

export const metadata = { title: "The Roster" };

// The Roster - the workforce, their instruments, lanes (model + provider), and
// frameworks. These are Soundcheck's registered Band agents (agent_config.yaml);
// the model lanes reflect band_client's tiering.

const ROSTER = [
  { name: "Scout", inst: "scout", role: "reconnaissance - repo & site → OrgContext", model: "Qwen2.5-14B", provider: "Featherless", fw: "LangGraph" },
  { name: "Bandleader", inst: "bandleader", role: "orchestrator - plan, recruit, sequence", model: "Claude Haiku 4.5", provider: "AI/ML API", fw: "LangGraph" },
  { name: "Code Scanner", inst: "scanner", role: "static analysis (bandit)", model: "Qwen2.5-14B", provider: "Featherless", fw: "LangGraph" },
  { name: "Dependency Auditor", inst: "scanner", role: "dependency CVEs (pip-audit / npm audit)", model: "Qwen2.5-14B", provider: "Featherless", fw: "LangGraph" },
  { name: "Secrets Sentinel", inst: "fixer", role: "committed secrets (detect-secrets) - redacted", model: "Qwen2.5-14B", provider: "Featherless", fw: "LangGraph" },
  { name: "Compliance Mapper", inst: "mapper", role: "findings → SOC 2 / ISO 27001 controls", model: "Qwen2.5-14B", provider: "Featherless", fw: "LangGraph" },
  { name: "Fixer", inst: "fixer", role: "proposes patches on a branch", model: "Claude Sonnet 4.6", provider: "AI/ML API", fw: "LangGraph" },
  { name: "Reviewer", inst: "reviewer", role: "cross-model review of the diff", model: "gpt-4o-mini", provider: "AI/ML API", fw: "LangGraph" },
];

export default function Roster() {
  return (
    <main className="page">
      <div className="page-head">
        <h1>The Roster</h1>
        <div className="sub">
          The workforce - eight specialists across two providers and frameworks, coordinating only through Band.
        </div>
      </div>

      <div className="roster-grid">
        {ROSTER.map((p) => {
          const Inst = INSTRUMENTS[p.inst as keyof typeof INSTRUMENTS];
          const frontier = p.provider === "AI/ML API";
          return (
            <div key={p.name} className="roster-card">
              <div className="rc-head">
                <div className="inst">{Inst()}</div>
                <div>
                  <div className="rc-name">{p.name}</div>
                  <div className="rc-handle mono">@oltking/{p.name.toLowerCase().replace(/\s+/g, "-")}</div>
                </div>
              </div>
              <div className="rc-role">{p.role}</div>
              <div className="rc-lane">
                <span className={`lane-tag ${frontier ? "frontier" : "oss"}`}>{p.provider}</span>
                <span className="mono">{p.model}</span>
                <span className="mono rc-fw">{p.fw}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="roster-note">
        <span className="lane-tag frontier">AI/ML API</span> frontier lane (Anthropic + OpenAI) ·
        <span className="lane-tag oss">Featherless</span> open-source lane (Qwen) -
        genuinely heterogeneous agents, one Band room.
      </div>
    </main>
  );
}
