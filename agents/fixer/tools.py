"""Fixer + Reviewer LangChain tools (spec §6).

The Fixer proposes a patch on an isolated branch and records a PatchProposal in
the Score. The Reviewer reads that diff and records a ReviewResult. Neither can
merge — open_pr happens only after human approval, from the orchestrator.

Eligibility (enforced upstream, restated here): only high-confidence, low-risk
findings reach the Fixer. Defensive only — the Fixer fixes, never writes exploits.
"""

from __future__ import annotations

from pathlib import Path

from common.repo_tools import read_file
from .git_pr import apply_patch


def make_fixer_tools(repo: Path, score, state: dict):
    """Tools for the Fixer. `state` collects the proposal (branch, diff, id) so the
    orchestrator can pick it up for review + PR."""
    from langchain_core.tools import tool

    @tool
    def read_repo_file(path: str) -> str:
        """Read a file from the target repo by relative path (to plan the fix)."""
        return read_file(repo, path)

    @tool
    async def propose_patch(
        path: str, fixed_content: str, finding_id: str, rationale: str, summary: str
    ) -> str:
        """Apply a fix: write `fixed_content` as the FULL new content of `path` on a
        fresh branch, commit it, and record a PatchProposal. `summary` is a one-line
        commit subject; `rationale` is WHY this fix is correct and safe; `finding_id`
        is the Score id of the finding being remediated. Returns the diff to review."""
        slug = path.replace("/", "-").replace("\\", "-").replace(".", "-")
        branch = f"soundcheck/fix-{slug}"
        result = apply_patch(repo, branch, {path: fixed_content},
                             f"fix: {summary} [{path}]")
        entry = await score.write(
            kind="PatchProposal",
            content=f"{summary}\nBranch: {branch}\nFiles: {', '.join(result.files_changed)}",
            thought=rationale,
            references=[finding_id] if finding_id else None,
            tags=["branch:" + branch],
            system="long_term", type="procedural",  # fixes are procedural memory
        )
        state["proposal"] = {
            "id": entry["id"], "branch": branch, "diff": result.diff,
            "files": result.files_changed, "summary": summary, "finding_id": finding_id,
        }
        return f"Patch proposed (id={entry['id']}, branch={branch}). Diff:\n{result.diff[:2000]}"

    return [read_repo_file, propose_patch]


def make_reviewer_tools(score, state: dict):
    """Tools for the Reviewer. Reads the pending diff, records a ReviewResult."""
    from langchain_core.tools import tool

    @tool
    def get_pending_diff() -> str:
        """Get the patch diff awaiting review (and the proposal id)."""
        p = state.get("proposal")
        if not p:
            return "No patch is currently pending review."
        return f"PatchProposal {p['id']} on branch {p['branch']}:\n{p['diff'][:3000]}"

    @tool
    async def record_review(verdict: str, reasoning: str) -> str:
        """Record the review. verdict = 'pass' (diff is correct, safe, minimal) or
        'revise' (needs changes). reasoning = the specific justification."""
        p = state.get("proposal") or {}
        entry = await score.write(
            kind="ReviewResult",
            content=f"Review verdict: {verdict.upper()}",
            thought=reasoning,
            references=[p.get("id")] if p.get("id") else None,
            tags=[f"verdict:{verdict.lower()}"],
        )
        state["review"] = {"id": entry["id"], "verdict": verdict.lower(), "reasoning": reasoning}
        return f"Review recorded (id={entry['id']}, verdict={verdict})."

    return [get_pending_diff, record_review]
