# Decisions

## 2024 — Local-first, no server
Kairn has no backend. User brings their own Anthropic API key stored in ~/.kairn/config.json.
Reason: privacy, no infra cost, no auth complexity for v1.

## 2024 — Claude Code only for v1
Only the Claude Code adapter is implemented. Hermes/OpenClaw deferred.
Reason: focus and ship speed. Adapters are isolated modules so adding later is clean.

## 2024 — MCP servers in .mcp.json, not settings.json
Project-scoped MCP config goes in .mcp.json per Claude Code convention.
settings.json is for permissions and hooks only.

## 2024 — Minimal tool selection principle
Fewer tools = better. Each MCP server costs 500-2000 context tokens.
Tier 1 tools default-included; everything else needs clear justification.