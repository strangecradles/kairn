import { Command } from "commander";
import { password, select } from "@inquirer/prompts";
import chalk from "chalk";
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "child_process";
import { loadConfig, saveConfig, getConfigPath } from "../config.js";
import type { KairnConfig } from "../types.js";

async function verifyApiKey(apiKey: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey });
    await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [{ role: "user", content: "ping" }],
    });
    return true;
  } catch {
    return false;
  }
}

function detectClaudeCode(): boolean {
  try {
    execFileSync("which", ["claude"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const initCommand = new Command("init")
  .description("Set up Kairn with your API key")
  .action(async () => {
    console.log(chalk.cyan("\n  Kairn Setup\n"));

    const existing = await loadConfig();
    if (existing) {
      console.log(
        chalk.yellow("  Config already exists at ") +
          chalk.dim(getConfigPath())
      );
      console.log(chalk.yellow("  Running setup will overwrite it.\n"));
    }

    const provider = await select({
      message: "LLM provider",
      choices: [{ name: "Anthropic (Claude)", value: "anthropic" }],
    });

    const apiKey = await password({
      message: "API key",
      mask: "*",
    });

    if (!apiKey) {
      console.log(chalk.red("\n  No API key provided. Aborting."));
      process.exit(1);
    }

    console.log(chalk.dim("\n  Verifying API key..."));
    const valid = await verifyApiKey(apiKey);

    if (!valid) {
      console.log(
        chalk.red("  Invalid API key. Check your key and try again.")
      );
      process.exit(1);
    }

    console.log(chalk.green("  ✓ API key verified"));

    const config: KairnConfig = {
      anthropic_api_key: apiKey,
      default_runtime: provider,
      created_at: new Date().toISOString(),
    };

    await saveConfig(config);
    console.log(
      chalk.green("  ✓ Config saved to ") + chalk.dim(getConfigPath())
    );

    const hasClaude = detectClaudeCode();
    if (hasClaude) {
      console.log(chalk.green("  ✓ Claude Code detected"));
    } else {
      console.log(
        chalk.yellow(
          "  ⚠ Claude Code not found. Install it: npm install -g @anthropic-ai/claude-code"
        )
      );
    }

    console.log(
      chalk.cyan("\n  Ready! Run ") +
        chalk.bold("kairn describe") +
        chalk.cyan(" to create your first environment.\n")
    );
  });
