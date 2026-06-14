"""Git + PR service for the remediation loop (spec §6/§7).

The Fixer proposes patches; THIS module turns an approved patch into a real PR.
Authority rule (non-negotiable): no autonomous merges. open_pr() only ever
creates a branch + PR; merging is never called. The PR body links back to the
Band audit trail (room + approval).

Uses GITHUB_TOKEN (scoped to the target repo). For the minimal P3 test the
target repo is Oltking/Soundcheck itself and the patched file is the throwaway
fixtures/vuln-app — a real PR that touches nothing real.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass
class PatchResult:
    branch: str
    files_changed: list[str]
    diff: str


def _run(args: list[str], cwd: Path) -> str:
    p = subprocess.run(args, cwd=str(cwd), capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(args)} failed: {p.stderr.strip()}")
    return p.stdout


def apply_patch(repo: Path, branch: str, edits: dict[str, str], message: str) -> PatchResult:
    """Create `branch` from the current HEAD, write the given file edits
    (path -> full new content), commit. Returns the branch + diff. Does NOT push.

    edits paths are relative to repo root and are path-contained.
    """
    repo = repo.resolve()
    base = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo).strip()
    _run(["git", "checkout", "-B", branch], repo)
    changed: list[str] = []
    try:
        for rel, content in edits.items():
            target = (repo / rel).resolve()
            if not str(target).startswith(str(repo)):
                raise ValueError(f"edit path escapes repo: {rel}")
            target.write_text(content, encoding="utf-8")
            changed.append(rel.replace("\\", "/"))
        _run(["git", "add", *changed], repo)
        _run(["git", "commit", "-m", message], repo)
        diff = _run(["git", "diff", f"{base}..{branch}", "--", *changed], repo)
        return PatchResult(branch=branch, files_changed=changed, diff=diff)
    finally:
        _run(["git", "checkout", base], repo)


def open_pr(
    repo_full_name: str,
    branch: str,
    title: str,
    body: str,
    base: str = "main",
    repo_path: Path | None = None,
) -> str:
    """Push `branch` and open a PR on GitHub. Returns the PR URL.
    NEVER merges. Requires GITHUB_TOKEN with contents+pull-request write."""
    token = os.environ["GITHUB_TOKEN"]
    if repo_path:
        # push the local branch using the token
        remote = f"https://x-access-token:{token}@github.com/{repo_full_name}.git"
        _run(["git", "push", remote, f"{branch}:{branch}", "--force-with-lease"], repo_path.resolve())

    from github import Github

    gh = Github(token)
    gh_repo = gh.get_repo(repo_full_name)
    pr = gh_repo.create_pull(title=title, body=body, head=branch, base=base)
    return pr.html_url


def audit_pr_body(*, room_id: str, finding: str, reviewer_verdict: str,
                  approver: str, approved_at: str) -> str:
    """PR body assembled from the Band audit trail (spec §6)."""
    return (
        f"## Soundcheck remediation\n\n"
        f"**Finding:** {finding}\n\n"
        f"**Reviewer verdict:** {reviewer_verdict}\n\n"
        f"**Human approval:** {approver} at {approved_at}\n\n"
        f"**Audit room:** `{room_id}` (full provenance — finding → review → "
        f"approval — is recorded in the Band room)\n\n"
        f"---\n*Opened by Soundcheck after human approval. No autonomous merge — "
        f"this PR awaits your review.*"
    )
