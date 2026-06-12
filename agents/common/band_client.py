"""Band client wiring — env, credentials, model routing, agent factory.

Verified against band_research/ (appendix §0/§1/§6) and the LIVE SDK:
- Package `band-sdk`. DISCREPANCY vs appendix: since v1.0.0 the import
  namespace is `band` (was `thenvoi` at v0.2.x). Same API surface.
- Credentials per agent in agent_config.yaml, loaded via band.config.load_agent_config.
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
    (Bandleader, Compliance Mapper, Fixer=Claude, Reviewer).

    disable_streaming=True: AI/ML API's Anthropic translation repeats the full
    tool name in every streamed chunk; LangChain's chunk merge concatenates them
    (>200 chars), which Anthropic then rejects on the next turn. Verified live
    2026-06-13 — non-streaming round-trips are clean.
    """
    from langchain_openai import ChatOpenAI

    load_env()
    kwargs.setdefault("disable_streaming", True)
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
    kwargs.setdefault("disable_streaming", True)
    return ChatOpenAI(
        model=model,
        base_url=OSS_BASE_URL,
        api_key=os.environ["FEATHERLESS_API_KEY"],
        **kwargs,
    )


def agent_credentials(config_name: str) -> tuple[str, str]:
    """(agent_id, api_key) for a block in agent_config.yaml (repo root)."""
    load_env()
    from band.config import load_agent_config

    return load_agent_config(config_name, config_path=str(REPO_ROOT / "agent_config.yaml"))


def create_band_agent(config_name: str, adapter, **kwargs):
    """Create a Band Agent (SDK) for a named credential block.

    Usage:
        adapter = LangGraphAdapter(llm=frontier_llm(), checkpointer=InMemorySaver(),
                                   custom_section=..., additional_tools=[...])
        agent = create_band_agent("scout", adapter)
        await agent.run()
    """
    from band import Agent

    agent_id, api_key = agent_credentials(config_name)
    return Agent.create(
        adapter=adapter,
        agent_id=agent_id,
        api_key=api_key,
        ws_url=ws_url(),
        rest_url=rest_url(),
        **kwargs,
    )
