"""Band client wiring — env, credentials, model routing, agent factory.

Verified against band_research/ (appendix §0/§1/§6):
- Package `band-sdk`, import namespace `thenvoi`.
- Credentials per agent in agent_config.yaml, loaded via thenvoi.config.load_agent_config.
- Models route through OpenAI-compatible endpoints only (no paid Anthropic/OpenAI keys):
    frontier  → AI/ML API      https://api.aimlapi.com/v1   (Claude/GPT/Gemini)
    oss       → Featherless    https://api.featherless.ai/v1 (Qwen/DeepSeek/...)
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Model ids confirmed against live provider lists (P0 smoke test, 2026-06-12).
FRONTIER_BASE_URL = "https://api.aimlapi.com/v1"
FRONTIER_DEFAULT_MODEL = "anthropic/claude-sonnet-4.6"
OSS_BASE_URL = "https://api.featherless.ai/v1"
OSS_DEFAULT_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct"

_loaded = False


def load_env() -> None:
    """Load repo-root .env once (idempotent)."""
    global _loaded
    if not _loaded:
        load_dotenv(REPO_ROOT / ".env")
        _loaded = True


def rest_url() -> str:
    load_env()
    return os.environ.get("THENVOI_REST_URL", "https://app.band.ai/").rstrip("/")


def ws_url() -> str:
    load_env()
    return os.environ.get(
        "THENVOI_WS_URL", "wss://app.band.ai/api/v1/socket/websocket"
    )


def frontier_llm(model: str = FRONTIER_DEFAULT_MODEL, **kwargs):
    """ChatOpenAI routed to AI/ML API — reasoning-heavy roles
    (Bandleader, Compliance Mapper, Fixer=Claude, Reviewer)."""
    from langchain_openai import ChatOpenAI

    load_env()
    return ChatOpenAI(
        model=model,
        base_url=FRONTIER_BASE_URL,
        api_key=os.environ["AIMLAPI_API_KEY"],
        **kwargs,
    )


def oss_llm(model: str = OSS_DEFAULT_MODEL, **kwargs):
    """ChatOpenAI routed to Featherless — high-volume roles
    (Scout ingest, scanner formatting, status)."""
    from langchain_openai import ChatOpenAI

    load_env()
    return ChatOpenAI(
        model=model,
        base_url=OSS_BASE_URL,
        api_key=os.environ["FEATHERLESS_API_KEY"],
        **kwargs,
    )


def agent_credentials(config_name: str) -> tuple[str, str]:
    """(agent_id, api_key) for a block in agent_config.yaml (repo root)."""
    load_env()
    from thenvoi.config import load_agent_config

    cwd = os.getcwd()
    try:
        # thenvoi.config resolves agent_config.yaml relative to CWD
        os.chdir(REPO_ROOT)
        return load_agent_config(config_name)
    finally:
        os.chdir(cwd)


def create_band_agent(config_name: str, adapter, **kwargs):
    """Create a Band Agent (SDK) for a named credential block.

    Usage:
        adapter = LangGraphAdapter(llm=frontier_llm(), checkpointer=InMemorySaver(),
                                   custom_section=..., additional_tools=[...])
        agent = create_band_agent("scout", adapter)
        await agent.run()
    """
    from thenvoi import Agent

    agent_id, api_key = agent_credentials(config_name)
    return Agent.create(
        adapter=adapter,
        agent_id=agent_id,
        api_key=api_key,
        ws_url=ws_url(),
        rest_url=rest_url(),
        **kwargs,
    )
