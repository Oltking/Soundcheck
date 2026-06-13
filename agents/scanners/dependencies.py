"""Dependency Auditor — pip-audit + npm audit (spec §5). OSS lane."""

from common.repo_tools import make_score_tools
from common.runtime import build_agent

from .tools import make_scanner_tool, run_npm_audit, run_pip_audit

ROLE = """
You are Dependency Auditor, the supply-chain specialist of the Soundcheck band.

When asked to scan:
1. Emit a task event (in_progress), then call run_pip_audit_scan once and
   run_npm_audit_scan once.
2. For each vulnerable dependency, record a Finding with write_finding: title
   "<package> <version>: <vuln id>", evidence = the manifest file + vuln id +
   fix versions, severity from the advisory (default medium if unknown),
   fix_confidence=high and fix_risk=low when a fix version exists (a version bump),
   otherwise be honest. `thought` = why this vulnerability matters here.
3. Reply to the Bandleader: counts, finding ids, worst severity.
If the scanners return nothing or errors, report that honestly instead.
"""


def build(llm, repo, score):
    tools = [
        make_scanner_tool("run_pip_audit_scan", run_pip_audit, repo),
        make_scanner_tool("run_npm_audit_scan", run_npm_audit, repo),
    ] + make_score_tools(score)
    return build_agent("dependencies", llm, ROLE, tools)
