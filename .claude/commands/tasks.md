# Task Management

Read the current TODO list:

!cat docs/TODO.md 2>/dev/null || echo 'No TODO.md yet'

Update docs/TODO.md with current task status. Use this format:
```
- [ ] pending task
- [x] completed task
- [~] in progress
```

After updating, summarize: how many tasks done, in progress, and remaining.