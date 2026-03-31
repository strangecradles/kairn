# Security Rules

- NEVER log or echo API keys, tokens, or secrets
- NEVER write secrets to files outside ~/.kairn/config.json
- NEVER execute user-provided strings as shell commands
- NEVER use eval() or Function() with dynamic input
- Validate all LLM output before writing to filesystem
- Sanitize all file paths — prevent path traversal (../)
- Config reads: only from ~/.kairn/config.json, never .env
- When writing generated .claude/ files, validate EnvironmentSpec schema first
- Deny: rm -rf, curl|sh, wget|sh at all times