# Symphony — Operator Runbook

Symphony is a daemon (separate from Kairn) that polls Linear for active Kairn issues, spawns an isolated workspace per issue, and runs Codex inside it to implement the work autonomously. Policy lives in `WORKFLOW.md` at the repo root; this doc covers the operator side: prerequisites, Linear setup, starting the daemon, and what to expect.

**Reference:** https://github.com/openai/symphony — Symphony itself is "low-key engineering preview" prototype software. We use the upstream Elixir reference implementation; we do not vendor it.

## Prerequisites (one-time)

| Tool | Status check | Install |
|------|--------------|---------|
| Codex CLI | `codex --version` | https://developers.openai.com/codex |
| `gh` CLI (authed for `strangecradles/kairn`) | `gh auth status` | `brew install gh && gh auth login` |
| Homebrew | `brew --version` | https://brew.sh |
| `mise` | `mise --version` | `brew install mise` |
| Erlang 28 + Elixir 1.19.5 | `mise exec -- elixir --version` (inside `~/code/symphony/elixir`) | `cd ~/code/symphony/elixir && mise install` |

Symphony lives in `~/code/symphony` (out-of-tree relative to Kairn).

## Linear setup

### 1. Custom workflow states (one-time, manual)

The Strange-ground (STR) team in Linear must include three custom workflow states beyond the default set:

- **Rework** — type `started`, used when reviewer requests changes
- **Human Review** — type `started`, PR is attached and waiting on human approval
- **Merging** — type `started`, approved by human, ready for `land` skill

Add them in Linear UI: **Strange-ground team → Settings → Workflow → Add status**. Order them between `In Progress` and `Done` so they read naturally.

The Linear API does not expose workflow-state creation, so this must be done in the UI.

### 2. Linear personal API key

Mint one in Linear: **Settings → Security & access → Personal API keys → Create new**. Name it something like "symphony-kairn". Copy the value.

Export it in the shell that will run the daemon:

```bash
export LINEAR_API_KEY=lin_api_...
```

For persistence, add it to `~/.zshrc` (do not commit it). Symphony reads `LINEAR_API_KEY` automatically per the `tracker.api_key` default in `WORKFLOW.md`.

## Starting the daemon

```bash
export LINEAR_API_KEY=lin_api_...
cd ~/code/symphony/elixir
mise exec -- ./bin/symphony /Users/ashtonperlroth/Projects/kairn-v2/WORKFLOW.md
```

Optional flags:

- `--port 4000` enables the Phoenix LiveView dashboard at `http://localhost:4000` and a JSON API at `/api/v1/state`.
- `--logs-root /path/to/logs` redirects logs (default: `./log` under the symphony elixir dir).

## Workspace layout

Symphony creates one workspace per issue under `~/code/kairn-workspaces/<sanitized-identifier>/`. Each workspace contains a fresh shallow clone of `strangecradles/kairn` plus `node_modules/` from `npm ci`. Workspaces persist across runs and are cleaned up when the matching issue reaches a terminal state (Done, Closed, Cancelled, Duplicate).

Never edit code in a workspace by hand — Symphony assumes it owns those directories.

## Issue lifecycle (from operator's view)

1. Create or move a Linear issue in the **Kairn** project to **Todo**.
2. Symphony polls every 5s, picks it up, transitions it to **In Progress**, creates the workspace, runs `npm ci`, opens a Codex session, and gives Codex the prompt body of `WORKFLOW.md`.
3. Codex creates a `## Codex Workpad` comment on the issue, plans the work, implements it, runs `npm run build && npx tsc --noEmit && npm test`, opens a PR (with `symphony` label) against `main`, and moves the issue to **Human Review**.
4. You review the PR. If you want changes, move the issue to **Rework** — Symphony will reset and start over with a fresh branch. If you approve, move to **Merging**.
5. In **Merging**, Codex's `land` skill watches for green CI and squash-merges. Issue moves to **Done**.

Concurrency is capped at 2 (`agent.max_concurrent_agents` in `WORKFLOW.md`); raise it cautiously.

## Cost / safety knobs (in `WORKFLOW.md`)

- `codex.command` — uses `gpt-5.5` at `model_reasoning_effort=high`. Drop to `medium` or `low` to reduce cost.
- `codex.approval_policy: never` — Codex acts without confirmation. Tighten by setting `{"reject":{"sandbox_approval":true,"rules":true,"mcp_elicitations":true}}`.
- `codex.thread_sandbox: workspace-write` — Codex can read/write inside its workspace only.
- `agent.max_concurrent_agents: 2` — increase only if you trust queue pressure.
- `agent.max_turns: 20` — caps autonomous turn loop per agent invocation.

## Stopping the daemon

`Ctrl-C` in the foreground process. Workspaces are not destroyed on shutdown — they remain for the next run.

## Troubleshooting

- **`missing_workflow_file`** — daemon was launched from the wrong directory or pointed at a missing path. Pass an absolute path.
- **`tracker.api_key` not set** — `LINEAR_API_KEY` is empty in the shell that started the daemon.
- **State `Human Review` / `Rework` / `Merging` not found** — the three custom Linear states are missing from the STR team.
- **Codex wedged on a state transition** — the agent may not have permission to move issues or attach PRs. Check the workpad comment for an explicit blocker note; the agent should park the ticket in `Human Review` with an unblock action when truly blocked.
- **Reload errors** — if you edit `WORKFLOW.md` while the daemon is running and the YAML is invalid, Symphony keeps running with the last good config and logs the error.
