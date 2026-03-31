# Contributing to Kairn

## General workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes and verify the build passes (`npm run build`).
3. Open a pull request with a clear description of what was changed and why.

---

## Adding a tool to the registry

The tool registry lives at `src/registry/tools.json`. It is the source of truth for every tool Kairn can include in a compiled environment.

### Required fields

Every tool submission must include all of the following fields:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Unique kebab-case identifier, e.g. `"github"` |
| `name` | `string` | Human-readable display name |
| `description` | `string` | One sentence. What does it do and why does it matter? |
| `category` | `string` | One of: `universal`, `code`, `search`, `data`, `communication`, `design`, `monitoring`, `infrastructure`, `sandbox` |
| `tier` | `number` | `1` = universal (always useful), `2` = common, `3` = specialized |
| `type` | `string` | `"mcp_server"`, `"plugin"`, or `"hook"` |
| `auth` | `string` | `"none"`, `"api_key"`, `"oauth"`, or `"connection_string"` |
| `best_for` | `string[]` | At least two tags describing the use cases this tool fits. Use existing tags where possible. |
| `install` | `object` | One of: `mcp_config`, `plugin_command`, `hook_config`. See structure below. |

### Conditional fields

| Field | Required when |
|---|---|
| `env_vars` | `auth` is anything other than `"none"` |
| `signup_url` | Tool requires account creation or an API key |

`env_vars` is an array of objects: `{ "name": string, "description": string }`.

### install structure

For an MCP server, provide `mcp_config` as a record matching the shape Claude Code expects in `.mcp.json`:

```json
"install": {
  "mcp_config": {
    "your-server-id": {
      "command": "npx",
      "args": ["-y", "your-package@latest"],
      "env": {
        "API_KEY": "${YOUR_API_KEY}"
      }
    }
  }
}
```

Use `${VAR_NAME}` placeholders for secrets — never hardcode values.

For a plugin:

```json
"install": {
  "plugin_command": "claude plugin install your-plugin"
}
```

For a hook:

```json
"install": {
  "hook_config": { ... }
}
```

### Example submission

```json
{
  "id": "example-tool",
  "name": "Example Tool",
  "description": "Does a specific useful thing for a specific class of project.",
  "category": "code",
  "tier": 2,
  "type": "mcp_server",
  "auth": "api_key",
  "best_for": ["code-review", "refactoring"],
  "env_vars": [
    { "name": "EXAMPLE_API_KEY", "description": "API key from example.com/settings" }
  ],
  "signup_url": "https://example.com/signup",
  "install": {
    "mcp_config": {
      "example-tool": {
        "command": "npx",
        "args": ["-y", "@example/mcp-server@latest"],
        "env": {
          "API_KEY": "${EXAMPLE_API_KEY}"
        }
      }
    }
  }
}
```

### Review criteria

A PR adding a tool will be merged when it meets all of the following:

- All required fields are present and correctly typed.
- If `auth` is not `"none"`: `env_vars` is populated with at least one entry, and `signup_url` points to a working sign-up or API key page.
- `best_for` has at least two meaningful tags (not just `"any"`).
- `install` contains the correct config for the declared `type` and it works against a real environment.
- The `description` is one clear sentence — not marketing copy.
- The tool is not a duplicate of an existing registry entry.

---

## Reporting issues

Open a GitHub issue with a minimal reproduction. For compilation output bugs, include the intent string you passed to `kairn describe` and the generated environment files.
