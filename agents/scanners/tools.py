"""Scanner tool wrappers — bandit (SAST), pip-audit + npm audit (dependencies),
detect-secrets (secrets). Output is structured JSON, size-capped, and secrets are
redacted BEFORE anything reaches an LLM, an event, or the ledger.

(semgrep/gitleaks/trufflehog per spec §5 don't run natively on Windows; these are
the equivalent OSS scanners that do. Same role, same output discipline.)
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

VENV_SCRIPTS = Path(sys.executable).parent
MAX_ITEMS = 40


def _run(cmd: list[str], cwd: Path, timeout: int = 240) -> tuple[int, str, str]:
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True,
                       timeout=timeout, encoding="utf-8", errors="replace")
    return p.returncode, p.stdout or "", p.stderr or ""


def run_bandit(repo: Path) -> list[dict]:
    """Python SAST. Returns [{file, line, test, severity, confidence, issue}]."""
    code, out, err = _run(
        [str(VENV_SCRIPTS / "bandit"), "-r", ".", "-f", "json", "-q",
         "-x", "./.venv,./node_modules,./.git"],
        repo,
    )
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return [{"error": f"bandit failed (rc={code}): {err[:300]}"}]
    return [
        {
            "file": r.get("filename"),
            "line": r.get("line_number"),
            "test": r.get("test_id"),
            "severity": str(r.get("issue_severity", "")).lower(),
            "confidence": str(r.get("issue_confidence", "")).lower(),
            "issue": r.get("issue_text"),
        }
        for r in data.get("results", [])[:MAX_ITEMS]
    ]


def run_pip_audit(repo: Path) -> list[dict]:
    """Python dependency vulnerabilities from requirements files."""
    repo = repo.resolve()
    reqs = [p for p in (repo / "requirements.txt", repo / "requirements-dev.txt") if p.exists()]
    if not reqs:
        return [{"info": "no requirements*.txt found"}]
    findings = []
    for req in reqs:
        code, out, err = _run(
            [str(VENV_SCRIPTS / "pip-audit"), "-r", str(req), "-f", "json",
             "--disable-pip", "--no-deps"],
            repo, timeout=300,
        )
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            findings.append({"error": f"pip-audit failed on {req.name} (rc={code}): {err[:300]}"})
            continue
        for dep in data.get("dependencies", []):
            for v in dep.get("vulns", []):
                findings.append({
                    "file": req.name,
                    "package": dep.get("name"),
                    "version": dep.get("version"),
                    "vuln_id": v.get("id"),
                    "fix_versions": v.get("fix_versions"),
                    "description": (v.get("description") or "")[:200],
                })
    return findings[:MAX_ITEMS]


def run_npm_audit(repo: Path) -> list[dict]:
    """Node dependency vulnerabilities (needs package-lock.json)."""
    if not (repo / "package-lock.json").exists():
        return [{"info": "no package-lock.json found"}]
    code, out, err = _run(["npm", "audit", "--json"], repo, timeout=300)
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return [{"error": f"npm audit failed (rc={code}): {err[:300]}"}]
    vulns = data.get("vulnerabilities", {})
    return [
        {
            "package": name,
            "severity": v.get("severity"),
            "range": v.get("range"),
            "via": [x.get("title") if isinstance(x, dict) else x for x in v.get("via", [])][:3],
            "fix_available": bool(v.get("fixAvailable")),
        }
        for name, v in list(vulns.items())[:MAX_ITEMS]
    ]


def run_detect_secrets(repo: Path) -> list[dict]:
    """Committed-secret detection. Values are NEVER included — only file:line + type."""
    code, out, err = _run(
        [str(VENV_SCRIPTS / "detect-secrets"), "scan", "--all-files",
         "--exclude-files", r"(\.venv|node_modules|\.git)/"],
        repo,
    )
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return [{"error": f"detect-secrets failed (rc={code}): {err[:300]}"}]
    findings = []
    for file, hits in data.get("results", {}).items():
        for h in hits:
            findings.append({
                "file": file,
                "line": h.get("line_number"),
                "type": h.get("type"),
                "evidence": f"{file}:{h.get('line_number')} (redacted)",
            })
    return findings[:MAX_ITEMS]


def make_scanner_tool(name: str, runner, repo: Path):
    """Wrap a scanner as a LangChain tool returning JSON text."""
    from langchain_core.tools import tool

    async def _impl() -> str:
        import asyncio
        results = await asyncio.to_thread(runner, repo)
        return json.dumps(results, indent=1)

    _impl.__name__ = name
    _impl.__doc__ = runner.__doc__
    return tool(_impl)
