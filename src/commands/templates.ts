import { Command } from "commander";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { getTemplatesDir } from "../config.js";
import type { EnvironmentSpec } from "../types.js";

export const templatesCommand = new Command("templates")
  .description("Browse available templates")
  .option("--category <cat>", "filter templates by category keyword")
  .option("--json", "output raw JSON array")
  .action(async (options: { category?: string; json?: boolean }) => {
    const templatesDir = getTemplatesDir();

    let files: string[];
    try {
      files = await fs.readdir(templatesDir);
    } catch {
      console.log(
        chalk.dim(
          "\n  No templates found. Templates will be installed with "
        ) +
          chalk.bold("kairn init") +
          chalk.dim(
            " or you can add .json files to ~/.kairn/templates/\n"
          )
      );
      return;
    }

    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log(
        chalk.dim(
          "\n  No templates found. Templates will be installed with "
        ) +
          chalk.bold("kairn init") +
          chalk.dim(
            " or you can add .json files to ~/.kairn/templates/\n"
          )
      );
      return;
    }

    const templates: EnvironmentSpec[] = [];

    for (const file of jsonFiles) {
      try {
        const data = await fs.readFile(
          path.join(templatesDir, file),
          "utf-8"
        );
        const spec = JSON.parse(data) as EnvironmentSpec;
        templates.push(spec);
      } catch {
        // Skip malformed files
      }
    }

    const filtered = options.category
      ? templates.filter((t) => {
          const keyword = options.category!.toLowerCase();
          return (
            t.intent?.toLowerCase().includes(keyword) ||
            t.description?.toLowerCase().includes(keyword)
          );
        })
      : templates;

    if (options.json) {
      console.log(JSON.stringify(filtered, null, 2));
      return;
    }

    if (filtered.length === 0) {
      console.log(
        chalk.dim(`\n  No templates matched category "${options.category}".\n`)
      );
      return;
    }

    console.log(chalk.cyan("\n  Available Templates\n"));

    for (const spec of filtered) {
      const toolCount = spec.tools?.length ?? 0;
      const commandCount = Object.keys(spec.harness?.commands ?? {}).length;
      const ruleCount = Object.keys(spec.harness?.rules ?? {}).length;

      console.log(
        chalk.bold(`  ${spec.name}`) +
          chalk.dim(` (ID: ${spec.id})`)
      );
      console.log(chalk.dim(`    ${spec.description}`));
      console.log(
        chalk.dim(
          `    Tools: ${toolCount} | Commands: ${commandCount} | Rules: ${ruleCount}`
        )
      );
      console.log("");
    }

    console.log(
      chalk.dim(`  ${filtered.length} template${filtered.length === 1 ? "" : "s"} available\n`)
    );
  });
