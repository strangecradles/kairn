#!/usr/bin/env python3
"""
Kairn Evolve v2 — Population-Based Harness Optimization

Usage:
  python run.py                          # defaults: 10 generations, 5 variants, opus
  python run.py --generations 20 --parallel 5
  python run.py --model sonnet --budget-per-task 0.50   # cheaper test run
"""
from __future__ import annotations
import argparse
import json
import os
import sys
import time
import random
import shutil
import subprocess
import tempfile
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

# ═════════════════════════════════════════════════════════════════
# TYPES
# ═════════════════════════════════════════════════════════════════

class Difficulty(Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"

@dataclass
class Checkpoint:
    name: str
    description: str
    verify_cmd: str
    weight: float = 1.0

@dataclass
class Task:
    id: str
    instruction: str
    difficulty: Difficulty
    checkpoints: list[Checkpoint]
    timeout_seconds: int = 300
    workspace_files: dict[str, str] = field(default_factory=dict)

@dataclass
class EfficiencyMetrics:
    num_turns: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    duration_ms: int = 0

@dataclass
class CheckpointResult:
    name: str
    passed: bool
    output: str = ""

@dataclass
class TaskResult:
    task_id: str
    variant_id: str
    checkpoints: list[CheckpointResult]
    efficiency: EfficiencyMetrics
    self_report: str = ""
    score: float = 0.0
    checkpoint_fraction: float = 0.0

@dataclass
class HarnessVariant:
    id: str
    claude_md: str
    parent_ids: list[str] = field(default_factory=list)
    generation: int = 0
    mutation_description: str = ""

@dataclass
class GenerationResult:
    generation: int
    variant_results: dict[str, list[TaskResult]]
    mini_batch_task_ids: list[str]
    best_variant_id: str = ""
    best_score: float = 0.0

@dataclass
class Mutation:
    action: str      # replace, add, remove
    old_text: str = ""
    new_text: str = ""
    rationale: str = ""

@dataclass
class VariantProposal:
    variant_id: str
    base_id: str
    intent: str      # exploit, explore, ablate, crossover, wild
    description: str
    mutations: list[Mutation] = field(default_factory=list)
    # For crossover
    second_parent_id: str = ""
    claude_md: str = ""

@dataclass
class Config:
    population_size: int = 5
    mini_batch_size: int = 5
    num_hard_in_batch: int = 2
    num_canary: int = 1
    model: str = "opus"
    meta_model: str = "opus"
    max_budget_per_task: float = 2.0
    task_timeout: int = 300
    parallel_agents: int = 3
    max_generations: int = 10
    ablation_every: int = 4
    full_eval_every: int = 4
    efficiency_weight: float = 0.15
    results_dir: str = ""
    workspaces_dir: str = ""


# ═════════════════════════════════════════════════════════════════
# TASK DEFINITIONS
# ═════════════════════════════════════════════════════════════════

def all_tasks() -> list[Task]:
    """Return all 12 tasks."""
    return [
        _hello_api(), _csv_to_json(),                           # easy (canary)
        _fix_json_parser(), _sqlite_todo(), _log_analyzer(),    # medium
        _data_pipeline(), _config_validator(), _test_suite(),   # medium
        _concurrent_kv(), _regex_engine(),                      # hard
        _diff_algorithm(), _expr_compiler(),                    # hard
    ]

def _hello_api():
    return Task(id="hello-api", difficulty=Difficulty.EASY, timeout_seconds=180,
        instruction="""Create a Python HTTP server in server.py that:
1. Listens on port 8080
2. GET /hello returns JSON {"message": "hello world"} with Content-Type application/json
3. GET /health returns JSON {"status": "ok"}
4. Any other path returns 404 with JSON {"error": "not found"}
Use only the standard library. Start the server, verify with curl, create DONE.txt with "complete".""",
        checkpoints=[
            Checkpoint("file-exists", "server.py created", "test -f server.py"),
            Checkpoint("server-runs", "Server starts", "timeout 10 bash -c 'python server.py & sleep 3 && curl -sf http://localhost:8080/health > /dev/null; kill %1 2>/dev/null'"),
            Checkpoint("hello-works", "/hello returns correct JSON", 'timeout 10 bash -c \'python server.py & sleep 3 && curl -sf http://localhost:8080/hello | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get(\\\"message\\\")==\\\"hello world\\\""; kill %1 2>/dev/null\''),
            Checkpoint("done-marker", "DONE.txt exists", "grep -q complete DONE.txt 2>/dev/null"),
        ])

def _csv_to_json():
    return Task(id="csv-to-json", difficulty=Difficulty.EASY, timeout_seconds=180,
        instruction="Write csv_to_json.py that reads input.csv and writes output.json as a JSON array of objects using column headers as keys. Handle quoted fields with commas.",
        workspace_files={"input.csv": 'name,age,city,bio\nAlice,30,"New York","Loves coding, hiking"\nBob,25,London,"Enjoys tea"\nCharlie,35,"San Francisco","AI, ML"\nDiana,28,Tokyo,""\n'},
        checkpoints=[
            Checkpoint("file-exists", "csv_to_json.py created", "test -f csv_to_json.py"),
            Checkpoint("runs", "Runs without error", "python csv_to_json.py"),
            Checkpoint("valid-json", "output.json is valid JSON array", 'python3 -c "import json; d=json.load(open(\'output.json\')); assert isinstance(d,list)"'),
            Checkpoint("correct-count", "All 4 rows", 'python3 -c "import json; assert len(json.load(open(\'output.json\')))==4"'),
            Checkpoint("quoted-commas", "Handles quoted commas", 'python3 -c "import json; d=json.load(open(\'output.json\')); assert \'hiking\' in d[0].get(\'bio\',\'\')"'),
        ])

def _fix_json_parser():
    buggy = r'''"""JSON parser with 3 bugs."""
def parse_json(text):
    text = text.strip()
    return _parse_value(text, 0)[0]

def _parse_value(text, pos):
    pos = _skip_ws(text, pos)
    if pos >= len(text): raise ValueError("Unexpected end")
    ch = text[pos]
    if ch == '"': return _parse_string(text, pos)
    elif ch == '{': return _parse_object(text, pos)
    elif ch == '[': return _parse_array(text, pos)
    elif ch == 't': return _parse_lit(text, pos, 'true', True)
    elif ch == 'f': return _parse_lit(text, pos, 'false', False)
    elif ch == 'n': return _parse_lit(text, pos, 'null', None)
    elif ch == '-' or ch.isdigit(): return _parse_number(text, pos)
    else: raise ValueError(f"Unexpected: {ch} at {pos}")

def _skip_ws(text, pos):
    while pos < len(text) and text[pos] in ' \t\n\r': pos += 1
    return pos

def _parse_string(text, pos):
    assert text[pos] == '"'; pos += 1; result = []
    while pos < len(text):
        ch = text[pos]
        if ch == '\\':
            pos += 1; esc = text[pos]
            if esc == 'n': result.append('\n')
            elif esc == 't': result.append('\t')
            elif esc == '"': result.append('"')
            elif esc == '\\': result.append('\\')
            # BUG 1: No unicode escape (\uXXXX) handling
            else: result.append(esc)
            pos += 1
        elif ch == '"': return ''.join(result), pos + 1
        else: result.append(ch); pos += 1
    raise ValueError("Unterminated string")

def _parse_number(text, pos):
    start = pos
    if text[pos] == '-': pos += 1
    while pos < len(text) and text[pos].isdigit(): pos += 1
    if pos < len(text) and text[pos] == '.':
        pos += 1
        while pos < len(text) and text[pos].isdigit(): pos += 1
    # BUG 2: No scientific notation (e/E) support
    s = text[start:pos]
    return (float(s) if '.' in s else int(s)), pos

def _parse_array(text, pos):
    assert text[pos] == '['; pos += 1; result = []
    pos = _skip_ws(text, pos)
    if pos < len(text) and text[pos] == ']': return result, pos + 1
    while True:
        val, pos = _parse_value(text, pos); result.append(val)
        pos = _skip_ws(text, pos)
        if text[pos] == ']': return result, pos + 1
        elif text[pos] == ',': pos += 1
        else: raise ValueError(f"Expected , or ] at {pos}")

def _parse_object(text, pos):
    assert text[pos] == '{'; pos += 1; result = {}
    pos = _skip_ws(text, pos)
    if pos < len(text) and text[pos] == '}': return result, pos + 1
    while True:
        pos = _skip_ws(text, pos)
        # BUG 3: No trailing comma tolerance
        key, pos = _parse_string(text, pos)
        pos = _skip_ws(text, pos); assert text[pos] == ':'; pos += 1
        val, pos = _parse_value(text, pos); result[key] = val
        pos = _skip_ws(text, pos)
        if text[pos] == '}': return result, pos + 1
        elif text[pos] == ',': pos += 1
        else: raise ValueError(f"Expected , or }} at {pos}")

def _parse_lit(text, pos, lit, val):
    if text[pos:pos+len(lit)] == lit: return val, pos + len(lit)
    raise ValueError(f"Expected {lit} at {pos}")
'''
    return Task(id="fix-json-parser", difficulty=Difficulty.MEDIUM, timeout_seconds=300,
        instruction="json_parser.py has 3 bugs: (1) no unicode escape \\uXXXX support, (2) no scientific notation (1e10), (3) crashes on trailing commas in objects. Fix all 3 without rewriting from scratch.",
        workspace_files={"json_parser.py": buggy},
        checkpoints=[
            Checkpoint("preserved", "Original structure kept", 'python3 -c "c=open(\'json_parser.py\').read(); assert \'_parse_string\' in c and \'_parse_number\' in c"'),
            Checkpoint("basic-ok", "Basic parsing still works", 'python3 -c "from json_parser import parse_json; assert parse_json(\'42\')==42; assert parse_json(\'\\\"hi\\\"\')==\'hi\'"'),
            Checkpoint("unicode", "Unicode escapes work", 'python3 -c "from json_parser import parse_json; assert parse_json(\'\\\"\\\\u0041\\\"\')==\'A\'"'),
            Checkpoint("scientific", "Scientific notation works", 'python3 -c "from json_parser import parse_json; assert parse_json(\'1e10\')==1e10"'),
            Checkpoint("trailing-comma", "Trailing commas handled", 'python3 -c "from json_parser import parse_json; assert parse_json(\'{\\\"a\\\": 1,}\')=={\'a\': 1}"'),
        ])

def _sqlite_todo():
    return Task(id="sqlite-todo", difficulty=Difficulty.MEDIUM, timeout_seconds=300,
        instruction="""Build todo.py — a CLI todo app backed by SQLite (todos.db):
  python todo.py add "Buy groceries" --priority high
  python todo.py list
  python todo.py complete <id>
  python todo.py delete <id>
  python todo.py search "groceries"
Each todo: id, title, status (pending/complete), priority (low/medium/high), created_at. Use argparse.""",
        checkpoints=[
            Checkpoint("exists", "todo.py exists", "test -f todo.py"),
            Checkpoint("add", "Add works", 'python todo.py add "Test" --priority high 2>&1 | grep -qE "[0-9]"'),
            Checkpoint("list", "List shows added items", 'rm -f todos.db && python todo.py add "Task A" && python todo.py list 2>&1 | grep -q "Task A"'),
            Checkpoint("complete", "Complete works", 'rm -f todos.db && ID=$(python todo.py add "X" 2>&1 | grep -oE "[0-9]+" | head -1) && python todo.py complete $ID 2>&1'),
            Checkpoint("search", "Search works", 'rm -f todos.db && python todo.py add "Buy milk" && python todo.py search "milk" 2>&1 | grep -qi "milk"'),
        ])

def _log_analyzer():
    # Generate log data inline
    import random as _r; _r.seed(42)
    lines = []
    ips = ["192.168.1.100","10.0.0.50","172.16.0.1","192.168.1.200"]
    for i in range(400):
        ip = _r.choice(ips); status = _r.choice([200]*5+[404,500])
        lines.append(f"2024-01-15T{10+i//60:02d}:{i%60:02d}:00Z {ip} GET /api/data {status} {_r.randint(10,500)}ms")
    for i in range(55):
        lines.append(f"2024-01-15T14:{i:02d}:00Z 10.99.88.77 POST /api/login 401 {_r.randint(50,200)}ms")
    lines.append("2024-01-15T14:56:00Z 10.99.88.77 POST /api/login 200 150ms")
    return Task(id="log-analyzer", difficulty=Difficulty.MEDIUM, timeout_seconds=300,
        instruction='Write analyze.py that reads access.log and outputs report.json with: total_requests, status_breakdown (status->count), top_ips (top 5 by count), suspicious_ips (IPs with >10 failed logins: 401 on /api/login). Log format: TIMESTAMP IP METHOD PATH STATUS DURATIONms',
        workspace_files={"access.log": "\n".join(lines)+"\n"},
        checkpoints=[
            Checkpoint("exists", "analyze.py exists", "test -f analyze.py"),
            Checkpoint("runs", "Runs without error", "python analyze.py"),
            Checkpoint("valid-json", "report.json valid with required keys", 'python3 -c "import json; r=json.load(open(\'report.json\')); assert \'total_requests\' in r and \'suspicious_ips\' in r"'),
            Checkpoint("total-ok", "Total count correct", 'python3 -c "import json; r=json.load(open(\'report.json\')); assert abs(r[\'total_requests\']-456)<=2"'),
            Checkpoint("found-attacker", "Found suspicious IP", 'python3 -c "import json; r=json.load(open(\'report.json\')); ips=[x[\'ip\'] if isinstance(x,dict) else x for x in r[\'suspicious_ips\']]; assert \'10.99.88.77\' in ips"'),
        ])

def _data_pipeline():
    csv = "date,product,quantity,unit_price,region\n2024-01-01,Widget A,10,29.99,North\n2024-01-01,Widget B,5,49.99,South\n2024-01-02,Widget A,8,29.99,North\n2024-01-02,Widget C,3,99.99,East\n2024-01-03,Widget B,12,49.99,North\n2024-01-03,Widget A,6,29.99,South\ninvalid_row\n2024-01-04,,3,29.99,South\n2024-01-05,Widget A,NaN,29.99,East\n"
    return Task(id="data-pipeline", difficulty=Difficulty.MEDIUM, timeout_seconds=300,
        instruction="Build pipeline.py: read sales.csv, clean data (skip invalid rows, log to errors.log), compute product revenue (qty*price), write clean data + aggregations to sales.db (tables: sales, product_revenue with columns product,total_revenue).",
        workspace_files={"sales.csv": csv},
        checkpoints=[
            Checkpoint("exists", "pipeline.py exists", "test -f pipeline.py"),
            Checkpoint("runs", "Runs without error", "python pipeline.py"),
            Checkpoint("db-tables", "sales.db has required tables", 'python3 -c "import sqlite3; c=sqlite3.connect(\'sales.db\'); t=[r[0] for r in c.execute(\\\"SELECT name FROM sqlite_master WHERE type=\'table\'\\\")]; assert \'sales\' in t and \'product_revenue\' in t, f\'Tables: {t}\'"'),
            Checkpoint("clean-data", "Invalid rows skipped", 'python3 -c "import sqlite3; n=sqlite3.connect(\'sales.db\').execute(\'SELECT COUNT(*) FROM sales\').fetchone()[0]; assert 5<=n<=7, f\'Expected 5-7 clean rows, got {n}\'"'),
            Checkpoint("revenue", "Revenue computed correctly", 'python3 -c "import sqlite3; r=dict(sqlite3.connect(\'sales.db\').execute(\'SELECT product,total_revenue FROM product_revenue\').fetchall()); assert abs(r.get(\'Widget A\',0)-719.76)<10, f\'Widget A: {r}\'"'),
        ])

def _config_validator():
    return Task(id="config-validator", difficulty=Difficulty.MEDIUM, timeout_seconds=300,
        instruction="Build validate.py: python validate.py config.yaml schema.yaml. Schema format: field: {type: string|int|float|bool, required: true/false, min/max for numbers, pattern for strings}. Print 'Valid' or list errors.",
        workspace_files={
            "schema.yaml": "name:\n  type: string\n  required: true\n  pattern: '^[a-zA-Z]\\w*$'\nport:\n  type: int\n  required: true\n  min: 1\n  max: 65535\ndebug:\n  type: bool\n  required: false\n",
            "valid.yaml": "name: my_app\nport: 8080\ndebug: true\n",
            "invalid.yaml": "name: 123bad\nport: 99999\ndebug: notabool\n",
        },
        checkpoints=[
            Checkpoint("exists", "validate.py exists", "test -f validate.py"),
            Checkpoint("valid-passes", "Valid config passes", 'python validate.py valid.yaml schema.yaml 2>&1 | grep -qi "valid"'),
            Checkpoint("invalid-fails", "Invalid config rejected", 'python validate.py invalid.yaml schema.yaml 2>&1 | grep -qiE "error|invalid|fail"'),
            Checkpoint("bad-name", "Catches bad name", 'python validate.py invalid.yaml schema.yaml 2>&1 | grep -qi "name"'),
            Checkpoint("bad-port", "Catches bad port", 'python validate.py invalid.yaml schema.yaml 2>&1 | grep -qi "port"'),
        ])

def _test_suite():
    calc = '''def add(a,b): return a+b
def subtract(a,b): return a-b
def multiply(a,b): return a*b
def divide(a,b):
    if b==0: raise ValueError("Division by zero")
    return a/b
def power(base,exp):
    if exp<0: return 1.0/power(base,-exp)
    r=1
    for _ in range(exp): r*=base
    return r
def fibonacci(n):
    if n<0: raise ValueError("Negative")
    if n<=1: return n
    a,b=0,1
    for _ in range(2,n+1): a,b=b,a+b
    return b
'''
    broken = '''import pytest
from calculator import add, subtract, multiply, divide, power, fibonacci
def test_add(): assert add(2,3)==6       # BUG: should be 5
def test_sub(): assert add(10,3)==7      # BUG: should call subtract
def test_div_zero():
    with pytest.raises(ZeroDivisionError): divide(10,0)  # BUG: should be ValueError
def test_mul(): assert multiply(4,5)==20  # correct
def test_div(): assert divide(10,2)==5.0  # correct
def test_fib(): assert fibonacci(10)==34  # BUG: fib(10)=55
def test_power_neg():
    r=power(2,-3); assert r==0.125
    r2=power(2,3); assert r2==r  # BUG: r2 should be 8, not r
'''
    return Task(id="test-suite-repair", difficulty=Difficulty.MEDIUM, timeout_seconds=300,
        instruction="test_calculator.py has 5 bugs — the calculator.py is CORRECT. Fix only the test file. Run pytest to verify.",
        workspace_files={"calculator.py": calc, "test_calculator.py": broken},
        checkpoints=[
            Checkpoint("tests-exist", "Test file has functions", 'grep -c "def test_" test_calculator.py | grep -qE "[5-9]"'),
            Checkpoint("pytest-runs", "pytest collects", 'python -m pytest test_calculator.py --co -q 2>&1 | grep -qv "error"'),
            Checkpoint("all-pass", "All tests pass", 'python -m pytest test_calculator.py -q 2>&1 | grep -q "passed"'),
            Checkpoint("no-skip", "No tests deleted", 'N=$(python -m pytest test_calculator.py -q 2>&1 | grep -oE "^[0-9]+" | head -1); test "$N" -ge 7'),
        ])

def _concurrent_kv():
    return Task(id="concurrent-kv", difficulty=Difficulty.HARD, timeout_seconds=600,
        instruction="""Build kvstore.py with class KeyValueStore(db_path):
  .get(key) -> str|None, .set(key, value), .delete(key) -> bool, .list_keys(prefix="") -> list
Requirements: SQLite persistence, thread-safe (10 concurrent writers), prefix scanning.
Also create and run test_kvstore.py.""",
        checkpoints=[
            Checkpoint("exists", "kvstore.py exists", "test -f kvstore.py"),
            Checkpoint("basic", "Get/set/delete work", 'python3 -c "from kvstore import KeyValueStore; kv=KeyValueStore(\'/tmp/_kv1.db\'); kv.set(\'a\',\'1\'); assert kv.get(\'a\')==\'1\'; kv.delete(\'a\'); assert kv.get(\'a\') is None"'),
            Checkpoint("persist", "Data survives restart", 'python3 -c "from kvstore import KeyValueStore; KeyValueStore(\'/tmp/_kv2.db\').set(\'p\',\'y\')" && python3 -c "from kvstore import KeyValueStore; assert KeyValueStore(\'/tmp/_kv2.db\').get(\'p\')==\'y\'"'),
            Checkpoint("concurrent", "10 concurrent writers", '''python3 -c "
import threading; from kvstore import KeyValueStore
kv=KeyValueStore('/tmp/_kv3.db'); errs=[]
def w(i):
    try:
        for j in range(20): kv.set(f'k{i}_{j}',f'v{i}_{j}')
    except Exception as e: errs.append(e)
ts=[threading.Thread(target=w,args=(i,)) for i in range(10)]
for t in ts: t.start()
for t in ts: t.join()
assert not errs, errs[:2]; assert kv.get('k5_10')=='v5_10'
"'''),
            Checkpoint("prefix", "Prefix scan works", 'python3 -c "from kvstore import KeyValueStore; kv=KeyValueStore(\'/tmp/_kv4.db\'); kv.set(\'user:a\',\'1\'); kv.set(\'user:b\',\'2\'); kv.set(\'order:1\',\'x\'); assert len(kv.list_keys(\'user:\'))==2"'),
        ])

def _regex_engine():
    return Task(id="regex-engine", difficulty=Difficulty.HARD, timeout_seconds=600,
        instruction="""Build regex.py with: def match(pattern: str, text: str) -> bool
Supported: literals, . (any char), * + ? quantifiers, [] char classes (incl [^...] and ranges), ^ $ anchors, | alternation, () grouping, \\ escaping. match() checks if pattern matches the ENTIRE text.""",
        checkpoints=[
            Checkpoint("exists", "regex.py with match()", 'python3 -c "from regex import match"'),
            Checkpoint("literals", "Literals and dot", 'python3 -c "from regex import match; assert match(\'abc\',\'abc\'); assert not match(\'abc\',\'abd\'); assert match(\'a.c\',\'axc\')"'),
            Checkpoint("quantifiers", "* + ? work", 'python3 -c "from regex import match; assert match(\'ab*c\',\'ac\'); assert match(\'ab*c\',\'abbc\'); assert match(\'ab+c\',\'abc\'); assert not match(\'ab+c\',\'ac\')"'),
            Checkpoint("char-class", "Character classes", 'python3 -c "from regex import match; assert match(\'[abc]\',\'b\'); assert not match(\'[abc]\',\'d\'); assert match(\'[a-z]\',\'m\')"'),
            Checkpoint("alternation", "| and groups", 'python3 -c "from regex import match; assert match(\'cat|dog\',\'cat\'); assert match(\'cat|dog\',\'dog\'); assert not match(\'cat|dog\',\'rat\')"'),
        ])

def _diff_algorithm():
    return Task(id="diff-algorithm", difficulty=Difficulty.HARD, timeout_seconds=600,
        instruction="Build diff.py: python diff.py file_a.txt file_b.txt. Output unified diff format (--- +++ @@ context, +added, -removed). Implement Myers or similar (not subprocess). Handle empty/identical files.",
        workspace_files={
            "file_a.txt": "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\n",
            "file_b.txt": "line 1\nline 2\nchanged 3\nline 4\nnew 4.5\nline 5\nline 7\n",
            "same_a.txt": "same\nhere\n", "same_b.txt": "same\nhere\n",
        },
        checkpoints=[
            Checkpoint("exists", "diff.py exists", "test -f diff.py"),
            Checkpoint("runs", "Runs on test files", "python diff.py file_a.txt file_b.txt"),
            Checkpoint("additions", "Shows + lines", 'python diff.py file_a.txt file_b.txt 2>&1 | grep -qE "^\\+"'),
            Checkpoint("removals", "Shows - lines", 'python diff.py file_a.txt file_b.txt 2>&1 | grep -qE "^-"'),
            Checkpoint("identical", "Identical files = no diff", 'OUT=$(python diff.py same_a.txt same_b.txt 2>&1); test -z "$OUT" || ! echo "$OUT" | grep -qE "^[+-][^+-]"'),
        ])

def _expr_compiler():
    return Task(id="expr-compiler", difficulty=Difficulty.HARD, timeout_seconds=600,
        instruction="""Build compiler.py that runs .expr files: python compiler.py prog.expr
Language: let x = 10, arithmetic (+,-,*,/,%), comparisons, if/then/else, fn name(args) = body, print(expr).
Must handle test_program.expr correctly.""",
        workspace_files={"test_program.expr": "let x = 10\nlet y = 20\nprint(x + y)\nfn square(n) = n * n\nprint(square(5))\nfn max(a, b) = if a > b then a else b\nprint(max(42, 17))\n"},
        checkpoints=[
            Checkpoint("exists", "compiler.py exists", "test -f compiler.py"),
            Checkpoint("runs", "Runs test program", "python compiler.py test_program.expr 2>&1"),
            Checkpoint("arithmetic", "10+20=30", 'python compiler.py test_program.expr 2>&1 | head -1 | grep -qE "^30$"'),
            Checkpoint("functions", "square(5)=25", 'python compiler.py test_program.expr 2>&1 | sed -n 2p | grep -qE "^25$"'),
            Checkpoint("conditionals", "max(42,17)=42", 'python compiler.py test_program.expr 2>&1 | sed -n 3p | grep -qE "^42$"'),
        ])


# ═════════════════════════════════════════════════════════════════
# BASELINE HARNESS
# ═════════════════════════════════════════════════════════════════

BASELINE_CLAUDE_MD = """# Project Assistant

## Approach
1. Read the task carefully before writing any code
2. Check what files already exist in the workspace
3. Plan your approach, then implement
4. Test your solution before finishing

## Code Quality
- Clean variable names, comments for complex logic
- Handle edge cases and errors
- Follow PEP 8 for Python
- Keep functions focused

## Testing
- Run tests if a test file exists
- Verify manually if no tests provided
- Read error messages carefully when tests fail

## Problem Solving
- Break complex problems into smaller steps
- Check intermediate results
- If stuck, re-read the requirements
"""


# ═════════════════════════════════════════════════════════════════
# RUNNER (spawns Claude Code)
# ═════════════════════════════════════════════════════════════════

def setup_workspace(task: Task, variant: HarnessVariant, base_dir: str) -> str:
    ws = tempfile.mkdtemp(prefix=f"ev_{task.id}_", dir=base_dir)
    for fn, content in task.workspace_files.items():
        p = Path(ws) / fn; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(content)
    claude_dir = Path(ws) / ".claude"; claude_dir.mkdir(exist_ok=True)
    (claude_dir / "CLAUDE.md").write_text(variant.claude_md)
    return ws

def run_claude(task: Task, workspace: str, model: str, budget: float, timeout: int) -> dict:
    cmd = ["claude", "-p", task.instruction, "--output-format", "json",
           "--dangerously-skip-permissions", "--model", model,
           "--max-budget-usd", str(budget)]
    try:
        r = subprocess.run(cmd, cwd=workspace, capture_output=True, text=True, timeout=timeout+60)
        try: data = json.loads(r.stdout)
        except: data = {"type": "error", "is_error": True}
        return {"data": data, "exit_code": r.returncode}
    except subprocess.TimeoutExpired:
        return {"data": {"type": "timeout"}, "exit_code": -1}
    except Exception as e:
        return {"data": {"type": "error", "errors": [str(e)]}, "exit_code": -1}

def verify_checkpoints(task: Task, workspace: str) -> list[CheckpointResult]:
    results = []
    for cp in task.checkpoints:
        try:
            proc = subprocess.run(["bash", "-c", cp.verify_cmd], cwd=workspace,
                                  capture_output=True, text=True, timeout=30)
            results.append(CheckpointResult(cp.name, proc.returncode == 0,
                                            (proc.stdout+proc.stderr).strip()[:300]))
        except Exception as e:
            results.append(CheckpointResult(cp.name, False, str(e)[:300]))
    return results

def score_result(cps: list[CheckpointResult], checkpoints: list[Checkpoint], efficiency: EfficiencyMetrics, ew: float = 0.15) -> tuple[float, float]:
    tw = sum(c.weight for c in checkpoints)
    earned = sum(c.weight for c, r in zip(checkpoints, cps) if r.passed)
    frac = earned / tw if tw else 0
    eff = max(0, 1 - (efficiency.num_turns - 1) / 19) if efficiency.num_turns > 0 else 0
    return (frac * (1 - ew) + eff * ew) * 100, frac

def self_report(workspace: str, task: Task, model: str) -> str:
    prompt = f'You attempted: "{task.instruction[:200]}...". In 2-3 sentences: What was unclear in .claude/CLAUDE.md? What guidance would have helped?'
    try:
        r = subprocess.run(["claude", "-p", prompt, "--output-format", "json",
                            "--dangerously-skip-permissions", "--model", model,
                            "--max-budget-usd", "0.30"], cwd=workspace,
                           capture_output=True, text=True, timeout=60)
        return json.loads(r.stdout).get("result", "")[:500]
    except: return ""

def run_task_full(task: Task, variant: HarnessVariant, cfg: Config, dry_run: bool = False) -> TaskResult:
    if dry_run:
        # Generate mock results for dry run
        num_checkpoints = len(task.checkpoints)
        mock_pass_rate = 0.6 + random.random() * 0.3  # 60-90% pass rate
        cps = []
        for i, cp in enumerate(task.checkpoints):
            passed = random.random() < mock_pass_rate
            cps.append(CheckpointResult(cp.name, passed, f"Mock output for {cp.name}"))
        
        eff = EfficiencyMetrics(
            num_turns=random.randint(2, 8),
            total_tokens=random.randint(1000, 5000),
            cost_usd=round(random.uniform(0.1, 1.0), 3),
            duration_ms=random.randint(10000, 60000))
        
        sc, frac = score_result(cps, task.checkpoints, eff, cfg.efficiency_weight)
        sr = f"Mock self-report for {task.id}"
        return TaskResult(task.id, variant.id, cps, eff, sr, sc, frac)
    
    ws = setup_workspace(task, variant, cfg.workspaces_dir)
    try:
        raw = run_claude(task, ws, cfg.model, cfg.max_budget_per_task, cfg.task_timeout)
        cps = verify_checkpoints(task, ws)
        u = raw["data"].get("usage", {})
        eff = EfficiencyMetrics(
            num_turns=raw["data"].get("num_turns", 0),
            total_tokens=u.get("input_tokens", 0) + u.get("output_tokens", 0),
            cost_usd=raw["data"].get("total_cost_usd", 0),
            duration_ms=raw["data"].get("duration_ms", 0))
        sc, frac = score_result(cps, task.checkpoints, eff, cfg.efficiency_weight)
        sr = self_report(ws, task, cfg.model)
        return TaskResult(task.id, variant.id, cps, eff, sr, sc, frac)
    finally:
        shutil.rmtree(ws, ignore_errors=True)


# ═════════════════════════════════════════════════════════════════
# PRINCIPAL + META AGENTS (LLM calls)
# ═════════════════════════════════════════════════════════════════

def call_llm(prompt: str, system: str, model: str, budget: float = 1.5) -> str:
    cmd = ["claude", "-p", prompt, "--output-format", "json",
           "--dangerously-skip-permissions", "--model", model,
           "--max-budget-usd", str(budget)]
    if system: cmd.extend(["--system-prompt", system])
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return json.loads(r.stdout).get("result", r.stdout[:5000])
    except Exception as e: return f"ERROR: {e}"

def extract_json(text: str) -> dict:
    # Remove markdown fences
    text = re.sub(r'^```(?:json)?\\n?', '', text.strip())
    text = re.sub(r'\\n?```$', '', text.strip())
    
    # Find first opening brace
    start = text.find('{')
    if start == -1:
        return {}
    
    # Use brace counting to find matching closing brace
    brace_count = 0
    for i, char in enumerate(text[start:], start):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                try:
                    return json.loads(text[start:i+1])
                except:
                    continue
    return {}

PRINCIPAL_SYSTEM = """You optimize .claude/CLAUDE.md harness files for AI coding agents.

Given task results and the current best CLAUDE.md, propose 5 variants:
1. "exploit" — targeted fix for the top failure mode
2. "exploit_2" — fix for second failure mode
3. "explore" — bigger structural change
4. "ablate" — remove a section to test if it helps
5. "wild" — novel/counterintuitive approach

Use agent self-reports to understand what confused the agent.
If two variants solved different tasks, combine their best elements (crossover).

Return JSON: {"reasoning": "...", "proposals": [{"variant_id": "...", "base_id": "...", "intent": "...", "description": "...", "claude_md": "full new CLAUDE.md content"}, ...]}

IMPORTANT: Each proposal must include the FULL claude_md content (not just a diff), so it can be used directly."""

def propose_variants_llm(best: HarnessVariant, gen_result: GenerationResult, history: list, model: str, dry_run: bool = False) -> list[VariantProposal]:
    trace_lines = []
    for vid, results in gen_result.variant_results.items():
        for r in results:
            cps = " ".join(f"{'✓' if c.passed else '✗'}{c.name}" for c in r.checkpoints)
            trace_lines.append(f"{vid}/{r.task_id}: {r.score:.0f} [{cps}]")
            if r.self_report: trace_lines.append(f"  Self-report: {r.self_report[:200]}")

    prompt = f"""## Current Best CLAUDE.md
```
{best.claude_md}
```

## Results (variant/task: score [checkpoints])
{chr(10).join(trace_lines)}

## History
{chr(10).join(f"Gen {h.generation}: best={h.best_variant_id} score={h.best_score:.0f}" for h in history[-3:])}

Propose 5 harness variants. Each must include complete claude_md content."""

    if dry_run:
        # Generate mock proposals for dry run
        intents = ["exploit", "exploit_2", "explore", "crossover", "wild"]
        descriptions = [
            "Fix checkpoint failures by improving instructions",
            "Optimize prompting structure for better task understanding", 
            "Add dynamic error handling and recovery patterns",
            "Merge successful patterns from multiple variants",
            "Experimental approach with novel harness structure"
        ]
        proposals = []
        for i in range(5):
            proposals.append(VariantProposal(
                variant_id=f"mock-v{i+1}",
                base_id=best.id,
                intent=intents[i],
                description=descriptions[i],
            ))
            # Generate slightly modified claude_md for variety
            proposals[-1].claude_md = best.claude_md + f"\\n# Mock modification {i+1}\\nThis is a mock variant for dry-run testing."
        return proposals
    
    resp = call_llm(prompt, PRINCIPAL_SYSTEM, model, budget=2.0)
    data = extract_json(resp)
    proposals = []
    for p in data.get("proposals", []):
        md = p.get("claude_md", best.claude_md)
        proposals.append(VariantProposal(
            variant_id=p.get("variant_id", f"v{len(proposals)}"),
            base_id=p.get("base_id", best.id),
            intent=p.get("intent", "explore"),
            description=p.get("description", ""),
        ))
        # Store full CLAUDE.md directly on the proposal
        proposals[-1].claude_md = md
    while len(proposals) < 5:
        proposals.append(VariantProposal(f"pad-{len(proposals)}", best.id, "exploit", "Fallback copy"))
        proposals[-1].claude_md = best.claude_md
    return proposals[:5]

META_SYSTEM = """Analyze population-based harness optimization results. Return JSON:
{"best_variant_id": "...", "winning_patterns": [...], "losing_patterns": [...], "strategy": "next gen approach"}"""

def meta_analyze_llm(gen: GenerationResult, history: list, model: str, dry_run: bool = False) -> dict:
    if dry_run:
        # Return mock meta analysis
        best_id = max(gen.variant_results.keys(), key=lambda k: sum(r.score for r in gen.variant_results[k]))
        return {"best_variant_id": best_id, "winning_patterns": ["Mock pattern 1"], "losing_patterns": ["Mock pattern 2"], "strategy": "Mock strategy"}
    
    lines = []
    for vid, results in gen.variant_results.items():
        avg = sum(r.score for r in results) / len(results) if results else 0
        lines.append(f"{vid}: avg={avg:.0f}")
        for r in results:
            cps = " ".join(f"{'✓' if c.passed else '✗'}{c.name}" for c in r.checkpoints)
            lines.append(f"  {r.task_id}: {r.score:.0f} [{cps}]")
    prompt = f"Generation {gen.generation} results:\n" + "\n".join(lines)
    resp = call_llm(prompt, META_SYSTEM, model, budget=1.0)
    return extract_json(resp) or {"best_variant_id": gen.best_variant_id, "strategy": "continue"}

def propose_ablations(variant: HarnessVariant) -> list[VariantProposal]:
    """Remove each ## section one at a time."""
    lines = variant.claude_md.split("\n")
    sections = []; start = 0
    for i, line in enumerate(lines):
        if line.startswith("## ") and i > 0: sections.append((start, i)); start = i
    sections.append((start, len(lines)))
    proposals = []
    for s, e in sections:
        name = lines[s].strip("# ").strip()[:20]
        ablated = "\n".join(lines[:s] + lines[e:]).strip()
        p = VariantProposal(f"ablate-{name.lower().replace(' ','-')}", variant.id, "ablate", f"Remove: {name}")
        p.claude_md = ablated or variant.claude_md
        proposals.append(p)
    return proposals


# ═════════════════════════════════════════════════════════════════
# SAMPLING
# ═════════════════════════════════════════════════════════════════

def select_batch(tasks: list[Task], history: list[GenerationResult], size: int, n_hard: int, n_canary: int) -> list[Task]:
    easy = [t for t in tasks if t.difficulty == Difficulty.EASY]
    med = [t for t in tasks if t.difficulty == Difficulty.MEDIUM]
    hard = [t for t in tasks if t.difficulty == Difficulty.HARD]
    batch = random.sample(easy, min(n_canary, len(easy)))
    batch += random.sample(hard, min(n_hard, len(hard)))
    remaining = size - len(batch)
    if remaining > 0:
        batch += random.sample(med, min(remaining, len(med)))
    return batch


# ═════════════════════════════════════════════════════════════════
# LOGGER
# ═════════════════════════════════════════════════════════════════

class Logger:
    def __init__(self, results_dir: str):
        self.results_dir = results_dir; self.log_path = os.path.join(results_dir, "evolve.log")
        self.json_path = os.path.join(results_dir, "results.json"); self.gens = []

    def log(self, msg: str):
        line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        with open(self.log_path, "a") as f: f.write(line + "\n")

    def save(self, gen: GenerationResult, variants: dict[str, HarnessVariant]):
        self.gens.append(gen)
        data = {"generations": [], "timestamp": datetime.now().isoformat()}
        for g in self.gens:
            gd = {"gen": g.generation, "best": g.best_variant_id, "score": g.best_score, "tasks": g.mini_batch_task_ids, "variants": {}}
            for vid, results in g.variant_results.items():
                gd["variants"][vid] = {
                    "avg": sum(r.score for r in results)/len(results) if results else 0,
                    "tasks": {r.task_id: {"score": r.score, "cps": {c.name: c.passed for c in r.checkpoints},
                              "turns": r.efficiency.num_turns, "cost": r.efficiency.cost_usd,
                              "self_report": r.self_report[:200]} for r in results}}
            data["generations"].append(gd)
        # Also save best harness
        for g in self.gens:
            if g.best_variant_id in variants:
                data["best_claude_md"] = variants[g.best_variant_id].claude_md
        with open(self.json_path, "w") as f: json.dump(data, f, indent=2, default=str)


# ═════════════════════════════════════════════════════════════════
# MAIN LOOP
# ═════════════════════════════════════════════════════════════════

def evolve(cfg: Config, skip_init: bool = False, init_results_path: str = "", dry_run: bool = False):
    os.makedirs(cfg.results_dir, exist_ok=True); os.makedirs(cfg.workspaces_dir, exist_ok=True)
    log = Logger(cfg.results_dir)
    log.log("═══ Kairn Evolve v2 — Population-Based Harness Optimization ═══")
    log.log(f"Config: pop={cfg.population_size}, gens={cfg.max_generations}, model={cfg.model}")

    tasks = all_tasks()
    log.log(f"Tasks: {len(tasks)} ({sum(1 for t in tasks if t.difficulty==Difficulty.EASY)}E "
            f"{sum(1 for t in tasks if t.difficulty==Difficulty.MEDIUM)}M "
            f"{sum(1 for t in tasks if t.difficulty==Difficulty.HARD)}H)")

    baseline = HarnessVariant("baseline", BASELINE_CLAUDE_MD, generation=0, mutation_description="Baseline")
    variants: dict[str, HarnessVariant] = {"baseline": baseline}
    history: list[GenerationResult] = []
    current_best = baseline; best_ever = 0.0

    # ── INIT: baseline on all tasks ──
    if skip_init and init_results_path:
        log.log("\\n═══ SKIPPING INIT: Loading existing results ═══")
        try:
            with open(init_results_path, 'r') as f:
                data = json.load(f)
            # Reconstruct from saved data
            init_results: dict[str, list[TaskResult]] = {"baseline": []}
            for task_data in data["generations"][0]["variant_results"]["baseline"]:
                checkpoints = [CheckpointResult(c["name"], c["passed"], c.get("output", "")) for c in task_data["checkpoints"]]
                efficiency = EfficiencyMetrics(task_data["efficiency"]["num_turns"], task_data["efficiency"]["total_tokens"], 
                                             task_data["efficiency"]["cost_usd"], task_data["efficiency"]["duration_ms"])
                result = TaskResult(task_data["task_id"], task_data["variant_id"], checkpoints, efficiency, 
                                  task_data.get("self_report", ""), task_data["score"], task_data["checkpoint_fraction"])
                init_results["baseline"].append(result)
            log.log(f"Loaded {len(init_results['baseline'])} baseline results")
        except Exception as e:
            log.log(f"Failed to load init results from {init_results_path}: {e}")
            log.log("Falling back to running baseline...")
            skip_init = False
    
    if not skip_init:
        log.log("\\n═══ INIT: Baseline on all tasks ═══")
        init_results: dict[str, list[TaskResult]] = {"baseline": []}
        for task in tasks:
            log.log(f"  baseline/{task.id}...")
            r = run_task_full(task, baseline, cfg, dry_run=dry_run)
            init_results["baseline"].append(r)
            cps = " ".join(f"{'✓' if c.passed else '✗'}{c.name}" for c in r.checkpoints)
            log.log(f"    score={r.score:.0f} cps={r.checkpoint_fraction:.0%} turns={r.efficiency.num_turns} [{cps}]")

    init_gen = GenerationResult(0, init_results, [t.id for t in tasks])
    avg = sum(r.score for r in init_results["baseline"]) / len(init_results["baseline"])
    init_gen.best_variant_id = "baseline"; init_gen.best_score = avg; best_ever = avg
    history.append(init_gen); log.save(init_gen, variants)
    log.log(f"\\nBaseline avg: {avg:.1f}")

    # ── EVOLUTION LOOP ──
    for gen_num in range(1, cfg.max_generations + 1):
        log.log(f"\n{'═'*50}\nGENERATION {gen_num}/{cfg.max_generations} | Best: {current_best.id} ({best_ever:.0f})\n{'═'*50}")

        is_full = gen_num % cfg.full_eval_every == 0
        is_ablation = gen_num % cfg.ablation_every == 0

        # Select tasks
        batch = tasks if is_full else select_batch(tasks, history, cfg.mini_batch_size, cfg.num_hard_in_batch, cfg.num_canary)
        log.log(f"{'FULL EVAL' if is_full else 'Mini-batch'}: {[t.id for t in batch]}")

        # Propose variants
        if is_ablation:
            log.log("ABLATION round")
            proposals = propose_ablations(current_best)[:cfg.population_size]
        else:
            log.log("Principal proposing variants...")
            proposals = propose_variants_llm(current_best, history[-1], history, cfg.meta_model, dry_run=dry_run)

        # Create variant objects
        gen_variants = []
        for p in proposals[:cfg.population_size]:
            v = HarnessVariant(p.variant_id, p.claude_md or current_best.claude_md,
                               parent_ids=[p.base_id], generation=gen_num, mutation_description=p.description)
            variants[v.id] = v; gen_variants.append(v)
            log.log(f"  {v.id} ({p.intent}): {p.description[:60]}")

        # Execute: all variants on same batch, in parallel
        gen_results: dict[str, list[TaskResult]] = {}
        with ThreadPoolExecutor(max_workers=cfg.parallel_agents) as pool:
            futures = {}
            for v in gen_variants:
                def run_v(var=v):
                    results = []
                    for task in batch:
                        r = run_task_full(task, var, cfg, dry_run=dry_run)
                        results.append(r)
                    return var.id, results
                futures[pool.submit(run_v)] = v.id

            for fut in as_completed(futures):
                try:
                    vid, results = fut.result()
                    gen_results[vid] = results
                    avg = sum(r.score for r in results) / len(results) if results else 0
                    log.log(f"  {vid}: avg={avg:.0f}")
                    for r in results:
                        cps = " ".join(f"{'✓' if c.passed else '✗'}" for c in r.checkpoints)
                        log.log(f"    {r.task_id}: {r.score:.0f} [{cps}] turns={r.efficiency.num_turns}")
                except Exception as e:
                    log.log(f"  ERROR {futures[fut]}: {e}")

        # Score generation
        variant_avgs = {vid: sum(r.score for r in rs)/len(rs) if rs else 0 for vid, rs in gen_results.items()}
        best_vid = max(variant_avgs, key=variant_avgs.get) if variant_avgs else current_best.id
        best_sc = variant_avgs.get(best_vid, 0)

        gen = GenerationResult(gen_num, gen_results, [t.id for t in batch], best_vid, best_sc)
        history.append(gen); log.save(gen, variants)

        # Meta-agent
        log.log("Meta-agent analyzing...")
        meta = meta_analyze_llm(gen, history, cfg.meta_model, dry_run=dry_run)
        log.log(f"  Strategy: {meta.get('strategy', 'N/A')[:150]}")

        # Update best
        meta_best = meta.get("best_variant_id", best_vid)
        if meta_best in variants: current_best = variants[meta_best]
        elif best_vid in variants: current_best = variants[best_vid]

        if best_sc > best_ever:
            best_ever = best_sc
            log.log(f"★ NEW BEST: {best_vid} ({best_ever:.0f})")
            bd = os.path.join(cfg.results_dir, "best_harness"); os.makedirs(bd, exist_ok=True)
            Path(bd, "CLAUDE.md").write_text(current_best.claude_md)

        # Canary check
        canary_rs = [r for rs in gen_results.values() for r in rs
                     if any(t.id == r.task_id and t.difficulty == Difficulty.EASY for t in tasks)]
        if canary_rs:
            canary_rate = sum(1 for r in canary_rs if r.checkpoint_fraction >= 0.8) / len(canary_rs)
            if canary_rate < 0.5:
                log.log(f"⚠️ CANARY FAIL ({canary_rate:.0%}), reverting")
                if len(history) >= 2: current_best = variants.get(history[-2].best_variant_id, baseline)

    # Final
    log.log(f"\n{'═'*50}\nDONE: {len(history)} generations, best={best_ever:.0f}\n{'═'*50}")
    log.log(f"\n--- Best CLAUDE.md ---\n{current_best.claude_md}")


def main():
    p = argparse.ArgumentParser(description="Kairn Evolve v2")
    p.add_argument("--generations", type=int, default=10)
    p.add_argument("--population", type=int, default=5)
    p.add_argument("--batch-size", type=int, default=5)
    p.add_argument("--model", default="opus")
    p.add_argument("--meta-model", default="opus")
    p.add_argument("--budget-per-task", type=float, default=2.0)
    p.add_argument("--parallel", type=int, default=3)
    p.add_argument("--results-dir", default="")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--skip-init", action="store_true", help="Skip baseline init, use existing results")
    p.add_argument("--init-results", help="Path to existing baseline results.json")
    p.add_argument("--dry-run", action="store_true", help="Use mock results for testing")
    a = p.parse_args()
    random.seed(a.seed)
    base = Path(__file__).parent
    cfg = Config(
        population_size=a.population, mini_batch_size=a.batch_size,
        model=a.model, meta_model=a.meta_model, max_budget_per_task=a.budget_per_task,
        max_generations=a.generations, parallel_agents=a.parallel,
        results_dir=a.results_dir or str(base / "results" / datetime.now().strftime("%Y%m%d_%H%M%S")),
        workspaces_dir=str(base / "workspaces"))
    evolve(cfg, a.skip_init, a.init_results, a.dry_run)

if __name__ == "__main__":
    main()
