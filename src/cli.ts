import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { describeCommand } from "./commands/describe.js";

const program = new Command();

program
  .name("kairn")
  .description(
    "Compile natural language intent into optimized Claude Code environments"
  )
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(describeCommand);

program.parse();
