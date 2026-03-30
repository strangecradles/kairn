import { Command } from "commander";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { getEnvsDir } from "../config.js";
import type { EnvironmentSpec } from "../types.js";

export const listCommand = new Command("list")
  .description("Show saved environments")
  .action(async () => {
    const envsDir = getEnvsDir();

    let files: string[];
    try {
      files = await fs.readdir(envsDir);
    } catch {
      console.log(chalk.dim("\n  No environments yet. Run ") +
        chalk.bold("kairn describe") +
        chalk.dim(" to create one.\n"));
      return;
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log(chalk.dim("\n  No environments yet. Run ") +
        chalk.bold("kairn describe") +
        chalk.dim(" to create one.\n"));
      return;
    }

    console.log(chalk.cyan("\n  Saved Environments\n"));

    for (const file of jsonFiles) {
      try {
        const data = await fs.readFile(path.join(envsDir, file), "utf-8");
        const spec = JSON.parse(data) as EnvironmentSpec;
        const date = new Date(spec.created_at).toLocaleDateString();
        const toolCount = spec.tools?.length ?? 0;

        console.log(chalk.bold(`  ${spec.name}`));
        console.log(chalk.dim(`    ${spec.description}`));
        console.log(
          chalk.dim(`    ${date} · ${toolCount} tools · ${spec.id}`)
        );
        console.log("");
      } catch {
        // Skip malformed files
      }
    }
  });
