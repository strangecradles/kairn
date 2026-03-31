# Changelog

All notable changes to Kairn will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] — 2026-03-30

### Added
- **Interactive clarification flow** — LLM generates 3-5 clarifying questions with suggested defaults before compilation, eliminating hallucinated project details
- **`--quick` / `-q` flag** — Skip clarification questions for fast compilation (old behavior)
- **Branded CLI output** — Maroon/warm stone color palette with block-character KAIRN wordmark logo
- **`src/ui.ts` styling module** — Centralized `ui.*` functions for headers, sections, key-value pairs, tool display, env var setup, and error boxes
- **`src/logo.ts`** — Full banner (wordmark + braille cairn art) and compact banner for all commands
- **Ora spinner** — Animated progress spinner during compilation and scanning (replaces line-overwrite hack)
- **Branded error display** — Error boxes with styled headers for all failure modes
- **`--no-color` flag** — Global flag to disable colored output for piping/CI (also respects `NO_COLOR` env var)

### Changed
- **All 9 commands redesigned** — Consistent visual design with branded banners, section headers, key-value pairs, and styled status indicators across init, describe, optimize, list, activate, doctor, registry, templates, and update-registry

---

## [1.5.0] — 2026-03-30

### Added
- **Template gallery** — 4 curated pre-built environments (Next.js Full-Stack, API Service, Research, Content Writing) installed automatically on `kairn init`
- **`kairn templates`** — Browse and filter available templates with `--category` and `--json` options
- **`kairn activate` template fallback** — Activate templates by ID when not found in saved environments
- **`kairn registry list`** — Browse all tools (bundled + user-defined) with `--category` and `--user-only` filtering
- **`kairn registry add`** — Interactively add custom tool definitions to the user registry with validation
- **User registry** — Custom tools stored in `~/.kairn/user-registry.json`, merged with bundled registry (user tools take precedence by ID)
- **Hermes runtime adapter** — `--runtime hermes` flag on `describe` and `optimize` generates `~/.hermes/config.yaml` and `~/.hermes/skills/` from any EnvironmentSpec
- **CONTRIBUTING.md** — Guide for community tool submissions via PR

### Changed
- **Registry loader refactored** — Deduplicated `loadRegistry()` from 3 files into shared `src/registry/loader.ts`
- **Templates directory** — `~/.kairn/templates/` created automatically alongside envs directory

---

## [1.4.0] — 2026-03-30

### Added
- **Sprint contract pattern** — `/project:sprint` command for defining acceptance criteria before coding, writes to `docs/SPRINT.md`
- **Multi-agent QA pipeline** — `@qa-orchestrator` (sonnet), `@linter` (haiku), `@e2e-tester` (sonnet, Playwright) agent templates in generated environments
- **PostCompact hook** — Auto re-reads CLAUDE.md and SPRINT.md after context compaction to restore project context
- **Context budget enforcement** — Strict limits in compilation prompt (≤6 MCP servers, ≤100 lines CLAUDE.md, ≤3 skills, ≤3 agents) with post-compilation validation warnings
- **`kairn optimize --diff`** — Preview what would change before writing, with colored diff output and apply prompt
- **`kairn doctor`** — Validate .claude/ environments against best practices with weighted scoring (10 checks, pass/warn/fail)

---

## [1.3.0] — 2026-03-30

### Added
- **Structured CLAUDE.md template** — Mandatory 7-section format (Purpose, Tech Stack, Commands, Architecture, Conventions, Key Commands, Output) enforced by compilation prompt
- **Shell-integrated commands** — Generated slash commands use `!` prefix for live shell output (git status, test results, build output)
- **Path-scoped rules** — YAML frontmatter `paths:` support for domain-specific rules (api.md, testing.md, frontend.md)
- **Hooks in settings.json** — Auto-generated PreToolUse hook to block destructive commands; PostToolUse formatter hook for projects with Prettier/ESLint/Black
- **`/project:status` command** — Live git status, recent commits, and TODO overview using `!` prefix
- **`/project:fix` command** — Issue-driven development with `$ARGUMENTS` for issue numbers
- **Improved TDD skill** — 3-phase isolation pattern (RED → GREEN → REFACTOR) replacing generic TDD instruction
- **10 new tools in registry** (28 total): Sentry, Vercel, Docker Toolkit, Chrome DevTools, SQLite, Stripe, Memory (Knowledge Graph), E2B Sandbox, GPT Researcher, Jira
- **Optimize audit checks** — Now flags missing hooks and missing path-scoped rules

---

## [1.1.0] — 2026-03-31

### Added
- **`kairn optimize`** — Scan existing codebases and generate or optimize Claude Code environments
  - Project scanner detects: language, framework, dependencies, test/build/lint commands, Docker, CI/CD, env keys
  - Harness auditor checks: CLAUDE.md length, missing commands, missing rules, MCP server count
  - `--audit-only` flag to inspect without generating changes
  - `--yes` flag to skip confirmation prompts
- Backward-compatible config migration — old configs (v1.0.0 format with `anthropic_api_key`) auto-migrate to new format without requiring `kairn init`

### Fixed
- Anthropic model IDs updated to current API names:
  - `claude-sonnet-4-6` (was `claude-sonnet-4-20250514`)
  - `claude-opus-4-6` (was `claude-opus-4-20250514`)
  - `claude-haiku-4-5-20251001` (was `claude-3-5-haiku-20241022`)

## [1.0.0] — 2026-03-30

### Added
- **`kairn init`** — Interactive API key setup with multi-provider support (Anthropic, OpenAI, Google) and model selection
- **`kairn describe`** — Compile natural language intent into optimized Claude Code environments
  - LLM-powered environment compilation
  - Generates: CLAUDE.md, settings.json, .mcp.json, commands/, rules/, skills/, agents/, docs/
  - `--yes` flag to skip confirmation
  - Progress indicator during compilation
- **`kairn list`** — Show all saved environments from `~/.kairn/envs/`
- **`kairn activate`** — Re-deploy a saved environment to any directory (accepts partial ID matching)
- **`kairn update-registry`** — Fetch latest tool catalog from GitHub with backup and validation
- Bundled tool registry with 18 curated tools across 6 tiers:
  - Universal: Context7, Sequential Thinking, security-guidance
  - Code: GitHub MCP, Playwright, Semgrep
  - Search: Exa, Brave Search, Firecrawl, Perplexity
  - Data: PostgreSQL (Bytebase), Supabase
  - Communication: Slack, Notion, Linear, AgentMail
  - Design: Figma, Frontend Design
- Claude Code adapter generating full .claude/ directory structure
- Hermes-inspired patterns in every environment:
  - `/project:help` command (environment guide)
  - `/project:tasks` command (TODO management)
  - `rules/continuity.md` (session memory via DECISIONS.md, LEARNINGS.md)
  - `rules/security.md` (essential security instructions)
- Security deny rules by default (rm -rf, curl|sh, .env, secrets/)
- Robust LLM error classification (auth, rate limit, billing, network, model not found)
- JSON parsing resilience (extracts JSON from wrapped responses)
