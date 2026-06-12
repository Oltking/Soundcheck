"""Fixer agent (P3): patch-proposing LangGraph/CrewAI agent with file-edit + git tools.
Model: Claude via AI/ML API (OpenAI-compatible). Only fix_confidence=high AND fix_risk=low
findings reach the Fixer. Defensive only — never generate exploit code."""
