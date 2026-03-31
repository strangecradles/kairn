---
paths:
  - "src/**/*.ts"
---
# TypeScript Rules

- strict mode always on — no `any` without explicit comment
- Use `fs.promises` for all file I/O, never sync variants
- Use `@inquirer/prompts` — never old `inquirer` package
- ESM only: `import`/`export`, no `require()`
- Error handling: catch at command boundary, log friendly message, `process.exit(1)`
- All public functions must have explicit return types
- Prefer `unknown` over `any` for parsed JSON