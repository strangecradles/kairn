# Learnings

## @inquirer/prompts vs inquirer
The project uses `@inquirer/prompts` (new modular API), not the old `inquirer` package.
Old API: `inquirer.prompt([{ type, name, message }])`
New API: `import { input, select, confirm } from '@inquirer/prompts'`

## ESM-only project
All imports must use `import`/`export`. No `require()`. tsup is configured for ESM output.
If you see `require is not defined`, it's an ESM violation somewhere.

## ~/.kairn/ directory
Must be created if missing. Always use `fs.promises.mkdir({ recursive: true })` before writes.
Never assume it exists.

## EnvironmentSpec LLM output
The LLM sometimes returns CLAUDE.md > 120 lines or selects > 6 MCP servers.
Always validate before writing files. Truncate or warn the user.