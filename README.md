# Kairn

> Describe what you want done. Get an optimized Claude Code environment.

Kairn is a CLI that compiles natural language workflow descriptions into minimal, optimal [Claude Code](https://code.claude.com/) agent environments — complete with MCP servers, slash commands, skills, subagents, and security rules.

**No server. No account. Runs locally with your own LLM key.**

## Why

Every agent needs an environment before it can work. Today, building that environment is manual and generic. The harness repos on GitHub give you 136 skills and hope you figure out which 6 matter for your task.

Kairn selects the right tools, generates workflow-specific instructions, and writes a production-quality `.claude/` directory in one command.

## Install

```bash
npm install -g kairn
```

Requires Node.js 18+.

## Quick Start

```bash
# 1. Set up your LLM key (Anthropic, OpenAI, or Google)
kairn init

# 2. Describe your workflow
kairn describe "Build a Next.js app with Supabase auth"

# 3. Start coding
claude
```

That's it. Kairn generates the entire `.claude/` directory — CLAUDE.md, MCP servers, slash commands, skills, agents, rules — tailored to your specific workflow.

## What Gets Generated

```
.claude/
├── CLAUDE.md              # Workflow-specific system prompt (<100 lines)
├── settings.json          # Permissions and security deny rules
├── commands/              # Slash commands (show up when you type /)
│   ├── help.md            #   /project:help — environment guide
│   ├── tasks.md           #   /project:tasks — manage TODOs
│   ├── plan.md            #   /project:plan — plan before coding
│   └── ...                #   workflow-specific commands
├── rules/                 # Auto-loaded instructions
│   ├── security.md        #   Security best practices
│   └── continuity.md      #   Session memory (DECISIONS.md, LEARNINGS.md)
├── skills/                # Model-controlled capabilities
│   └── {skill}/SKILL.md
├── agents/                # Specialized subagents
│   └── {agent}.md
└── docs/                  # Pre-initialized project memory
    ├── TODO.md
    ├── DECISIONS.md
    └── LEARNINGS.md
.mcp.json                  # Project-scoped MCP server config
```

## Commands

### `kairn init`

Interactive setup. Pick your LLM provider and model, paste your API key. Key stays local at `~/.kairn/config.json`.

Supported providers:
- **Anthropic** — Claude Sonnet 4, Opus 4, Haiku 3.5
- **OpenAI** — GPT-4o, GPT-4o mini, o3
- **Google** — Gemini 2.5 Flash, Gemini 2.5 Pro

### `kairn describe [intent]`

The main command. Describe what you want your agent to do, and Kairn compiles an optimal environment.

```bash
# Interactive
kairn describe

# Inline
kairn describe "Research ML papers on GRPO training and write a summary"

# Skip confirmation
kairn describe "Draft outreach emails from a CSV" --yes
```

Kairn selects the minimal set of tools from a curated registry of 18 MCP servers, plugins, and hooks — then generates every file Claude Code needs.

### `kairn list`

Show all saved environments.

```
$ kairn list

  nextjs-supabase-auth
    Next.js app with Supabase authentication
    3/30/2026 · 7 tools · env_df2c0a23...

  grpo-research
    Research ML papers on GRPO training
    3/30/2026 · 4 tools · env_1638c54e...
```

### `kairn activate <env_id>`

Re-deploy a saved environment to any directory. Use the ID from `kairn list`.

```bash
mkdir new-project && cd new-project
kairn activate env_df2c0a23
```

### `kairn update-registry`

Fetch the latest tool catalog from GitHub.

```bash
kairn update-registry
```

## Tool Registry

Kairn ships with 18 curated tools across 6 tiers:

| Category | Tools |
|----------|-------|
| **Universal** | Context7, Sequential Thinking, security-guidance |
| **Code** | GitHub MCP, Playwright, Semgrep |
| **Search** | Exa, Brave Search, Firecrawl, Perplexity |
| **Data** | PostgreSQL (Bytebase), Supabase |
| **Communication** | Slack, Notion, Linear, AgentMail |
| **Design** | Figma, Frontend Design |

Tools are selected based on your workflow description. Fewer tools = less context bloat = better agent performance.

## How It Works

1. You describe your workflow in natural language
2. Kairn sends your intent + its tool registry to an LLM
3. The LLM selects the minimal tool set and generates a complete `EnvironmentSpec`
4. Kairn writes the `.claude/` directory and `.mcp.json` from the spec
5. The spec is saved locally so you can re-deploy it anywhere

The LLM call uses your own API key. Nothing is sent to Kairn servers (there are none).

## Security

- **API keys stay local.** Stored at `~/.kairn/config.json`, never transmitted anywhere.
- **Every environment includes security rules.** Deny rules for `rm -rf`, `curl | sh`, reading `.env` and `secrets/`.
- **Curated registry only.** Every MCP server in the registry is manually verified. No auto-inclusion of unvetted tools.
- **Environment variable references.** MCP configs use `${ENV_VAR}` syntax — secrets never written to files.

## Philosophy

- **Minimal over complete.** 5 well-chosen tools beat 50 generic ones.
- **Workflow-specific over generic.** Every file generated relates to your actual task.
- **Local-first.** No accounts, no servers, no telemetry.
- **Transparent.** You can inspect every generated file. Nothing is hidden.

## License

MIT

---

*Kairn — from kairos (the right moment) and cairn (the stack of stones marking the path).*
