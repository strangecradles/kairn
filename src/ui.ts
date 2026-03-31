import chalk from "chalk";
import type { CompileProgress } from "./types.js";

const maroon = chalk.rgb(139, 0, 0);
const darkMaroon = chalk.rgb(100, 0, 0);
const warmStone = chalk.rgb(212, 165, 116);
const lightStone = chalk.rgb(220, 190, 160);
const dimStone = chalk.rgb(140, 100, 70);

export const ui = {
  // Brand colors
  brand: (text: string) => maroon.bold(text),
  accent: (text: string) => warmStone(text),

  // Logos and banners
  fullBanner: (subtitle?: string) => {
    const KAIRN_WORDMARK = [
      maroon("██╗  ██╗") + "  " + maroon("█████╗ ") + " " + maroon("██╗") + "  " + maroon("██████╗ ") + "  " + maroon("███╗   ██╗"),
      maroon("██║ ██╔╝") + "  " + maroon("██╔══██╗") + " " + maroon("██║") + "  " + maroon("██╔══██╗") + "  " + maroon("████╗  ██║"),
      warmStone("█████╔╝ ") + "  " + warmStone("███████║") + " " + warmStone("██║") + "  " + warmStone("██████╔╝") + "  " + warmStone("██╔██╗ ██║"),
      warmStone("██╔═██╗ ") + "  " + warmStone("██╔══██║") + " " + warmStone("██║") + "  " + warmStone("██╔══██╗") + "  " + warmStone("██║╚██╗██║"),
      lightStone("██║  ██╗") + "  " + lightStone("██║  ██║") + " " + lightStone("██║") + "  " + lightStone("██║  ██║") + "  " + lightStone("██║ ╚████║"),
      lightStone("╚═╝  ╚═╝") + "  " + lightStone("╚═╝  ╚═╝") + " " + lightStone("╚═╝") + "  " + lightStone("╚═╝  ╚═╝") + "  " + lightStone("╚═╝  ╚═══╝"),
    ];
    console.log("");
    for (const line of KAIRN_WORDMARK) {
      console.log("  " + line);
    }
    if (subtitle) {
      console.log(dimStone(`  ${subtitle}`));
    }
    console.log("");
  },
  compactBanner: (subtitle?: string) => {
    const line = maroon("━").repeat(52);
    console.log(`  ${line}`);
    console.log(`  ${maroon("  ◆")} ${chalk.bold.rgb(139, 0, 0)("KAIRN")}` + (subtitle ? ` ${dimStone("— " + subtitle)}` : ""));
    console.log(`  ${line}`);
  },

  // Section headers
  section: (title: string) => {
    const len = chalk.dim(title).length;
    const line = "━".repeat(Math.max(0, 48 - len));
    return `\n  ${warmStone("━━")} ${chalk.bold(title)} ${chalk.dim(warmStone(line))}`;
  },

  // Status messages
  success: (text: string) => chalk.green(`  ✓ ${text}`),
  warn: (text: string) => chalk.yellow(`  ⚠ ${text}`),
  error: (text: string) => chalk.red(`  ✗ ${text}`),
  info: (text: string) => chalk.cyan(`  ℹ ${text}`),

  // Key-value pairs
  kv: (key: string, value: string) => `  ${chalk.cyan(key.padEnd(14))} ${value}`,

  // File list
  file: (path: string) => chalk.dim(`    ${path}`),

  // Tool display
  tool: (name: string, reason: string) => `    ${warmStone("●")} ${chalk.bold(name)}\n      ${chalk.dim(reason)}`,

  // Divider
  divider: () => chalk.dim(`  ${"─".repeat(50)}`),

  // Command suggestion
  cmd: (command: string) => `    ${chalk.bold.white("$ " + command)}`,

  // Env var setup with signupUrl
  envVarPrompt: (name: string, desc: string, url?: string) => {
    let out = `  ${chalk.bold(name)}${chalk.dim(` (${desc})`)}`;
    if (url) out += `\n    ${chalk.dim("Get one at:")} ${warmStone(url)}`;
    return out;
  },

  // Clarification question
  question: (q: string, suggestion?: string) => {
    let msg = `  ${warmStone("?")} ${chalk.bold(q)}`;
    if (suggestion) {
      msg += `\n    ${chalk.dim(`(suggested: ${suggestion})`)}`;
    }
    return msg;
  },

  // Error box for compile failures
  errorBox: (title: string, message: string) => {
    const line = "─".repeat(50);
    return chalk.red(`\n  ┌${line}┐\n  │ ${title.padEnd(49)}│\n  │ ${message.padEnd(49)}│\n  └${line}┘\n`);
  },
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min} min`;
}

export function estimateTime(model: string, intent: string): string {
  const wordCount = intent.split(/\s+/).length;
  const isComplex = wordCount > 40;

  const perPass: Record<string, number> = {
    'haiku': 5,
    'sonnet': 20,
    'opus': 60,
    'gpt-4.1-mini': 10,
    'gpt-4.1': 25,
    'gpt-5': 15,
    'o4-mini': 12,
    'gemini-2.5-flash': 8,
    'gemini-3-flash': 8,
    'gemini-2.5-pro': 30,
    'gemini-3.1-pro': 30,
    'grok-4.1-fast': 10,
    'grok-4.20': 25,
    'deepseek': 15,
    'mistral-large': 20,
    'codestral': 15,
    'mistral-small': 10,
    'llama': 10,
    'qwen': 10,
  };

  // Find closest match or default to 20s per pass
  const basePerPass = Object.entries(perPass).find(([k]) => model.toLowerCase().includes(k))?.[1] ?? 20;
  const totalBase = basePerPass * 2; // 2 LLM passes

  if (isComplex) {
    const low = Math.floor(totalBase * 1.5);
    const high = Math.floor(totalBase * 4);
    return `~${formatTime(low)}-${formatTime(high)} (complex workflow)`;
  }
  return `~${formatTime(totalBase)}`;
}

export function createProgressRenderer(): {
  update: (progress: CompileProgress) => void;
  finish: () => void;
  fail: (err: unknown) => void;
} {
  const lines: string[] = [];
  let intervalId: NodeJS.Timeout | null = null;
  let currentPhase = '';
  let phaseStart = Date.now();
  let lineCount = 0; // tracks how many lines have been written to stdout

  function render(): void {
    // Move cursor up to overwrite previous output
    if (lineCount > 0) {
      process.stdout.write(`\x1B[${lineCount}A`);
    }
    for (const line of lines) {
      process.stdout.write('\x1B[2K' + line + '\n');
    }
    lineCount = lines.length;
  }

  function updateElapsed(): void {
    if (!currentPhase) return;
    const elapsed = Math.floor((Date.now() - phaseStart) / 1000);
    const lastIdx = lines.length - 1;
    if (lastIdx >= 0) {
      lines[lastIdx] = lines[lastIdx].replace(/\[\d+s\]/, `[${elapsed}s]`);
      render();
    }
  }

  return {
    update(progress: CompileProgress): void {
      if (progress.status === 'running') {
        currentPhase = progress.phase;
        phaseStart = Date.now();
        lines.push(`  ${warmStone("◐")} ${progress.message} ${chalk.dim("[0s]")}`);
        if (!intervalId) {
          intervalId = setInterval(updateElapsed, 1000);
        }
      } else if (progress.status === 'success') {
        const lastIdx = lines.length - 1;
        const elapsed = progress.elapsed != null ? ` ${chalk.dim("—")} ${chalk.dim(Math.floor(progress.elapsed) + "s")}` : '';
        const detail = progress.detail ? ` ${chalk.dim("(" + progress.detail + ")")}` : '';
        if (lastIdx >= 0) {
          lines[lastIdx] = `  ${chalk.green("✔")} ${progress.message}${detail}${elapsed}`;
        }
        currentPhase = '';
      } else if (progress.status === 'warning') {
        const lastIdx = lines.length - 1;
        if (lastIdx >= 0) {
          lines[lastIdx] = `  ${chalk.yellow("⚠")} ${progress.message}`;
        }
        // Add new running line for the retry
        currentPhase = progress.phase;
        phaseStart = Date.now();
        lines.push(`  ${warmStone("◐")} Retrying in concise mode... ${chalk.dim("[0s]")}`);
      }
      render();
    },
    finish(): void {
      if (intervalId) clearInterval(intervalId);
      currentPhase = '';
      render();
    },
    fail(err: unknown): void {
      if (intervalId) clearInterval(intervalId);
      currentPhase = '';
      const lastIdx = lines.length - 1;
      if (lastIdx >= 0) {
        lines[lastIdx] = `  ${chalk.red("✖")} Compilation failed`;
      }
      render();
    },
  };
}
