---
paths:
  - "src/compiler/**"
  - "src/adapter/**"
  - "src/registry/**"
---
# Compiler & Adapter Rules

- EnvironmentSpec must be validated before any filesystem writes
- Tool selection: max 6 MCP servers, prefer tier 1-2 over tier 3+
- CLAUDE.md output must be under 120 lines
- Every generated env must include: /project:help, /project:tasks, continuity rule, security rule
- MCP servers go in .mcp.json — NOT settings.json
- Deny rules in settings.json are mandatory: rm -rf, curl|sh, .env reads