# Slash Command Templates

Commands are markdown files in `.claude/commands/`. They show up when users type `/` in Claude Code.

## Universal Commands (include in every environment)

### help.md
```markdown
You are the environment guide. Present a clear summary:

1. List available /project: commands with one-line descriptions
2. List available @agents with how to invoke them
3. Show the project's tech stack and key conventions
4. Suggest the best first step for this workflow

Keep it concise — bullet points, not paragraphs.
```

### tasks.md
```markdown
Manage the project task list:

!cat docs/TODO.md 2>/dev/null || echo "No TODO.md yet"

If TODO.md exists: show tasks grouped by status.
If not: ask what we're working on and create it.

When tasks are completed, mark them done. Add new tasks as they emerge.
```

### status.md (recommended for all projects)
```markdown
Show current project state:

!git status --short 2>/dev/null || echo "Not a git repo"
!git log --oneline -5 2>/dev/null
!cat docs/TODO.md 2>/dev/null || echo "No TODO.md"

Summarize: what changed recently, what's in progress, what's next.
```

## Code Project Commands

### plan.md
```markdown
Analyze the task and create a plan before coding.

1. Read the relevant code to understand current state
2. Write a step-by-step plan to docs/DECISIONS.md
3. Include: what files to modify, what tests to write, risks
4. Do NOT start coding — plan only

!git diff --stat HEAD~3 2>/dev/null
```

### review.md
```markdown
Review staged changes for quality, security, and completeness:

!git diff --staged

Focus on:
1. Security vulnerabilities (injection, XSS, auth bypass)
2. Error handling gaps
3. Missing edge cases
4. Test coverage
5. Adherence to project conventions

Rate each finding: HIGH/MEDIUM/LOW severity.
```

### test.md
```markdown
Run the test suite and fix any failures:

!{TEST_COMMAND} 2>&1

If tests pass: report summary.
If tests fail: read the failing test, understand what's expected,
fix the implementation (not the test), and re-run.

Iterate until all tests pass.
```

### commit.md
```markdown
Create a well-formatted conventional commit:

!git diff --staged --stat

Write a commit message following conventional commits:
- feat: new feature
- fix: bug fix
- docs: documentation
- refactor: code restructuring
- test: adding tests

Include a brief body if the change is non-trivial.
Run: git commit -m "type: description"
```

### fix.md (with $ARGUMENTS for issue number)
```markdown
Fix issue #$ARGUMENTS

1. Read the issue description
2. Understand the expected behavior
3. Find the relevant code
4. Plan the fix in docs/DECISIONS.md
5. Write a failing test that reproduces the issue
6. Implement the minimal fix
7. Verify the test passes
8. Commit: "fix: description (closes #$ARGUMENTS)"
```

## Research Project Commands

### research.md
```markdown
Deep research on a topic. Invoke with:
> /project:research $ARGUMENTS

1. Search using available MCP tools (Exa, Brave, Perplexity)
2. Extract full content from the best 3-5 sources
3. Use Sequential Thinking to analyze findings
4. Log sources to docs/PAPERS.md or docs/SOURCES.md
5. Log key findings to docs/LEARNINGS.md
6. Note open questions in docs/TODO.md
```

### summarize.md
```markdown
Draft or update the project summary:

!cat docs/LEARNINGS.md 2>/dev/null
!cat docs/SOURCES.md 2>/dev/null

1. Read all gathered research in docs/
2. Identify themes, patterns, and contradictions
3. Write a structured summary with sections and citations
4. Save to docs/SUMMARY.md
```

## Notes on Shell Integration
- Use `!command` to embed live output — this runs when the command is invoked
- Use `$ARGUMENTS` for user-provided parameters
- Keep shell commands short — `| tail -20` or `| head -30` to limit output
- Use `2>/dev/null` for commands that might not exist yet
