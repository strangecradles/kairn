---
name: compiler-design
description: Patterns for Kairn's LLM compilation pipeline
triggers:
  - compiler
  - prompt
  - EnvironmentSpec
  - tool selection
---
# Compiler Design Patterns

## Prompt Engineering
- System prompt in `src/compiler/prompt.ts` — keep under 300 lines
- Use few-shot examples for tool selection scoring
- Always request JSON output with explicit schema
- Validate JSON before passing to adapter

## Tool Selection Logic
- Tier 1 tools (context7, sequential-thinking, security-guidance) default included
- Tier 2+ require clear workflow justification
- Max 6 MCP servers total — enforce in adapter
- Auth:api_key tools: use ${ENV_VAR} syntax, never hardcode

## EnvironmentSpec Validation
- Validate schema after LLM response, before writing files
- Required fields: name, description, tools, harness
- Reject if CLAUDE.md > 120 lines
- Reject if > 6 MCP servers selected