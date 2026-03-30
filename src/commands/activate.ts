import { Command } from "commander";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { getEnvsDir } from "../config.js";
import { writeEnvironment } from "../adapter/claude-code.js";
import type { EnvironmentSpec } from "../types.js";

export const activateCommand = new Command("activate")
  .description("Re-deploy a saved environment to the current directory")
  .argument("<env_id>", "Environment ID (from kairn list)")
  .action(async (envId: string) => {
    const envsDir = getEnvsDir();

    // Find the env file — accept full ID or partial match
    let files: string[];
    try {
      files = await fs.readdir(envsDir);
    } catch {
      console.log(chalk.red("\n  No saved environments found.\n"));
      process.exit(1);
    }

    const match = files.find(
      (f) => f === `${envId}.json` || f.startsWith(envId)
    );

    if (!match) {
      console.log(chalk.red(`\n  Environment "${envId}" not found.`));
      console.log(chalk.dim("  Run kairn list to see saved environments.\n"));
      process.exit(1);
    }

    const data = await fs.readFile(path.join(envsDir, match), "utf-8");
    const spec = JSON.parse(data) as EnvironmentSpec;

    console.log(chalk.cyan(`\n  Activating: ${spec.name}`));
    console.log(chalk.dim(`  ${spec.description}\n`));

    const targetDir = process.cwd();
    const written = await writeEnvironment(spec, targetDir);

    console.log(chalk.green("  ✓ Environment written\n"));
    for (const file of written) {
      console.log(chalk.dim(`    ${file}`));
    }

    console.log(
      chalk.cyan("\n  Ready! Run ") +
        chalk.bold("claude") +
        chalk.cyan(" to start.\n")
    );
  });
