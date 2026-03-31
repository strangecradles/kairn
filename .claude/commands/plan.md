# Plan Before Coding

Before writing any code, create a plan:

1. Read current state:

!cat docs/TODO.md 2>/dev/null
!cat docs/SPRINT.md 2>/dev/null

2. Check what exists:

!find src/ -name '*.ts' | head -20

3. Answer these before coding:
   - What exactly needs to change?
   - Which files are affected?
   - What could break?
   - What's the minimal change?

4. Write the plan to docs/SPRINT.md and get confirmation before implementing.