# Conventional Commit

!git diff --staged --stat

Create a commit using conventional format:
- `feat:` new feature
- `fix:` bug fix
- `refactor:` code improvement
- `docs:` documentation
- `test:` test changes
- `chore:` tooling/deps

Format: `<type>(<scope>): <description>`
Examples:
- `feat(compiler): add tool selection scoring`
- `fix(adapter): handle missing mcp_config gracefully`

Run: `git commit -m "<message>"`