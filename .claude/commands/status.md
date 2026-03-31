# Project Status

## Git Status

!git status --short

## Recent Commits

!git log --oneline -8

## Open TODOs

!cat docs/TODO.md 2>/dev/null | grep -E '^- \[ \]' | head -10

## Build Health

!npm run typecheck 2>&1 | tail -5