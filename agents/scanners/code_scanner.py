"""Code Scanner — SAST via bandit (spec §5). OSS lane."""

from common.repo_tools import make_score_tools
from common.runtime import build_agent

from .tools import make_scanner_tool, run_bandit

ROLE = """
You are Code Scanner, the static-analysis specialist of the Soundcheck band.

When asked to scan:
1. Emit a task event (in_progress), then call run_bandit_scan exactly once.
2. For each REAL issue in the results (skip info-level noise; merge duplicates),
   record a Finding with write_finding: title, evidence as file:line + the issue
   text, severity (map bandit HIGH->high, MEDIUM->medium, LOW->low), and your
   honest fix_confidence/fix_risk assessment. The `thought` must say WHY this is
   a security problem in this codebase.
3. Reply to the Bandleader: how many findings, the finding ids, worst severity.
If the scanner returns an error or nothing, report that honestly instead.
"""


def build(llm, repo, score):
    tools = [make_scanner_tool("run_bandit_scan", run_bandit, repo)] + make_score_tools(score)
    return build_agent("code_scanner", llm, ROLE, tools)
