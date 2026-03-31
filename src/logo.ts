import chalk from "chalk";

// Kairn brand colors
const maroon = chalk.rgb(139, 0, 0);
const darkMaroon = chalk.rgb(100, 0, 0);
const warmStone = chalk.rgb(180, 120, 80);
const lightStone = chalk.rgb(212, 165, 116);
const dimStone = chalk.rgb(140, 100, 70);

// Block-character wordmark (matches Hermes quality level)
const KAIRN_WORDMARK = [
  maroon("██╗  ██╗") + darkMaroon("  ") + maroon("█████╗ ") + darkMaroon(" ") + maroon("██╗") + darkMaroon("  ") + maroon("██████╗ ") + darkMaroon("  ") + maroon("███╗   ██╗"),
  maroon("██║ ██╔╝") + darkMaroon("  ") + maroon("██╔══██╗") + darkMaroon(" ") + maroon("██║") + darkMaroon("  ") + maroon("██╔══██╗") + darkMaroon("  ") + maroon("████╗  ██║"),
  warmStone("█████╔╝ ") + dimStone("  ") + warmStone("███████║") + dimStone(" ") + warmStone("██║") + dimStone("  ") + warmStone("██████╔╝") + dimStone("  ") + warmStone("██╔██╗ ██║"),
  warmStone("██╔═██╗ ") + dimStone("  ") + warmStone("██╔══██║") + dimStone(" ") + warmStone("██║") + dimStone("  ") + warmStone("██╔══██╗") + dimStone("  ") + warmStone("██║╚██╗██║"),
  lightStone("██║  ██╗") + dimStone("  ") + lightStone("██║  ██║") + dimStone(" ") + lightStone("██║") + dimStone("  ") + lightStone("██║  ██║") + dimStone("  ") + lightStone("██║ ╚████║"),
  lightStone("╚═╝  ╚═╝") + dimStone("  ") + lightStone("╚═╝  ╚═╝") + dimStone(" ") + lightStone("╚═╝") + dimStone("  ") + lightStone("╚═╝  ╚═╝") + dimStone("  ") + lightStone("╚═╝  ╚═══╝"),
];

// Braille-art cairn (stacked stones)
const CAIRN_ART = [
  dimStone("            ⣀⣀⣀            "),
  warmStone("          ⣴⣿⣿⣿⣦          "),
  warmStone("           ⠙⠿⠿⠋           "),
  dimStone("         ⣀⣤⣤⣤⣤⣀         "),
  lightStone("       ⣴⣿⣿⣿⣿⣿⣿⣦       "),
  lightStone("        ⠙⠻⠿⠿⠿⠟⠋        "),
  dimStone("      ⣀⣤⣤⣶⣶⣶⣶⣤⣤⣀      "),
  warmStone("    ⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦    "),
  warmStone("     ⠙⠻⠿⠿⠿⠿⠿⠿⠟⠋     "),
  dimStone("   ⣀⣤⣶⣶⣿⣿⣿⣿⣿⣿⣶⣶⣤⣀   "),
  lightStone("  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿  "),
  dimStone("  ⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉⠉  "),
];

export function printLogo(): void {
  console.log("");
  for (const line of KAIRN_WORDMARK) {
    console.log("  " + line);
  }
  console.log("");
}

export function printCairn(): void {
  console.log("");
  for (const line of CAIRN_ART) {
    console.log("  " + line);
  }
  console.log("");
}

export function printFullBanner(subtitle?: string): void {
  console.log("");
  for (const line of KAIRN_WORDMARK) {
    console.log("  " + line);
  }
  if (subtitle) {
    console.log(dimStone(`  ${subtitle}`));
  }
  console.log("");
}

// Compact one-liner for smaller outputs
export function printCompactBanner(): void {
  const line = maroon("━").repeat(50);
  console.log(`\n  ${line}`);
  console.log(`  ${maroon("  ◆")} ${chalk.bold.rgb(139, 0, 0)("KAIRN")} ${dimStone("— Agent Environment Compiler")}`);
  console.log(`  ${line}\n`);
}
