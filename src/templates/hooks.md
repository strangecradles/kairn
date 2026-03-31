# Hook Templates

Hooks go in `settings.json` under the `hooks` key. They are deterministic —
not LLM-controlled. Zero token cost unless type is `prompt` or `agent`.

## Always Include

### Block Destructive Commands (PreToolUse)
```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "command": "CMD=$(cat | jq -r '.tool_input.command // empty') && echo \"$CMD\" | grep -qiE 'rm\\s+-rf\\s+/|DROP\\s+TABLE|curl.*\\|\\s*sh|:(){ :|:& };:' && echo 'Blocked destructive command' >&2 && exit 2 || true"
  }]
}
```

### Protect Secret Files (PreToolUse)
```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "command": "FILE=$(cat | jq -r '.tool_input.file_path // empty') && echo \"$FILE\" | grep -qE '(\\.env$|\\.env\\.|secrets/|credentials|id_rsa)' && echo 'Cannot modify secret files' >&2 && exit 2 || true"
  }]
}
```

## Code Projects with Formatters

### Auto-Format with Prettier (PostToolUse)
```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "command": "FILE=$(cat | jq -r '.tool_input.file_path // empty') && [ -n \"$FILE\" ] && npx prettier --write \"$FILE\" 2>/dev/null || true"
  }]
}
```

### Auto-Format with Black (PostToolUse) — Python
```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "command": "FILE=$(cat | jq -r '.tool_input.file_path // empty') && [ -n \"$FILE\" ] && echo \"$FILE\" | grep -q '\\.py$' && black \"$FILE\" 2>/dev/null || true"
  }]
}
```

## Recommended Additions

### Context Re-injection After Compaction (PostCompact)
```json
{
  "matcher": "",
  "hooks": [{
    "type": "prompt",
    "prompt": "Context was compacted. Re-read CLAUDE.md and docs/TODO.md to restore project context."
  }]
}
```

### Desktop Notification (macOS) (Notification)
```json
{
  "matcher": "",
  "hooks": [{
    "type": "command",
    "command": "osascript -e 'display notification \"Claude needs your attention\" with title \"Claude Code\"'"
  }]
}
```

### Sound on Task Complete (Stop) — macOS
```json
{
  "matcher": "",
  "hooks": [{
    "type": "command",
    "command": "/usr/bin/afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || true"
  }]
}
```

## Selection Guide
| Hook | Include When |
|------|-------------|
| Block destructive | Always |
| Protect secrets | Always |
| Auto-format Prettier | JS/TS project with prettier |
| Auto-format Black | Python project with black |
| PostCompact re-inject | All projects |
| Desktop notification | macOS users |
| Sound on complete | Power users |

## Anti-Patterns
- Don't use agent-type hooks unless necessary (expensive — spawns full LLM)
- PostToolUse formatters can loop if formatter modifies the file — add guards
- Stop hooks MUST check for re-entry to prevent infinite loops
- Keep hook commands fast (<5 seconds) — they block Claude
