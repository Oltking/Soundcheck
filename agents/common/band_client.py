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
# Model choice constraints (verified live 2026-06-13):
# - NOT Qwen2.5-Coder-32B: emits tool calls as plain text — invisible to Band.
# - NOT Qwen2.5-72B: costs 4/4 concurrency units on this Featherless plan, so any
#   overlapping call 429s. 14B (proper tool calls, 2 units) allows 2 concurrent.
OSS_DEFAULT_MODEL = "Qwen/Qwen2.5-14B-Instruct"

_loaded = False
_OSS_HTTP = None  # shared connection-capped client for the Featherless lane


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
    import httpx
    from langchain_openai import ChatOpenAI

    load_env()
    kwargs.setdefault("disable_streaming", True)
    # One shared pool capped at 2 connections: excess requests queue client-side
    # instead of tripping Featherless's 4-unit concurrency limit (429).
    global _OSS_HTTP
    if _OSS_HTTP is None:
        _OSS_HTTP = httpx.AsyncClient(
            limits=httpx.Limits(max_connections=2), timeout=120.0
        )
    kwargs.setdefault("http_async_client", _OSS_HTTP)
    kwargs.setdefault("max_retries", 5)  # exponential backoff on residual 429s
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

    auto_subscribe_existing_rooms=False (run isolation): on startup the agent does
    NOT re-drain every room it was ever a participant in — that resync storm grew
    with each run and starved the WebSocket heartbeats (run 4, 2026-06-14). Rooms
    joined while the agent is running still subscribe via the live room_added event,
    so the orchestrator starts agents BEFORE adding them to the run room.

    Usage:
        agent = create_band_agent("scout", adapter)
        await agent.run()
    """
    from band import Agent
    from band.runtime.types import AgentConfig

    agent_id, api_key = agent_credentials(config_name)
    kwargs.setdefault("config", AgentConfig(auto_subscribe_existing_rooms=False))
    return Agent.create(
        adapter=adapter,
        agent_id=agent_id,
        api_key=api_key,
        ws_url=ws_url(),
        rest_url=rest_url(),
        **kwargs,
    )
