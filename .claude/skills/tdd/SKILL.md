---
name: tdd
description: Test-driven development with 3-phase isolation
triggers:
  - implement
  - add feature
  - write tests
---
# TDD — RED → GREEN → REFACTOR

## Phase 1: RED
Write the failing test ONLY. Do not write implementation.
Verify it FAILS with the expected error.

## Phase 2: GREEN
Write the MINIMUM code to make the test pass.
Nothing extra. No refactoring yet.
Verify tests pass.

## Phase 3: REFACTOR
Improve code quality while keeping tests green.
Run tests after every change.

## Rules
- Never write tests and implementation in the same step
- AAA pattern: Arrange → Act → Assert
- One assertion per test when possible
- Mock `@anthropic-ai/sdk` calls — never hit real API in tests
- Mock `fs.promises` for file I/O tests
- Mock `os.homedir()` to avoid touching real ~/.kairn/